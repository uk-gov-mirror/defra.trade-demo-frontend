import jwt from '@hapi/jwt'
import { config } from '../../config/config.js'
import { getOidcEndpoints } from '../common/helpers/oidc-discovery.js'
import {
  setSessionValue,
  clearSessionValue
} from '../common/helpers/session-helpers.js'

/**
 * Authentication Controller
 *
 * Implements OAuth2/OIDC authentication flow with DEFRA Customer Identity Service (Azure AD B2C).
 * This service manages the complete authentication lifecycle: login, callback, and logout.
 *
 * IMPORTANT ARCHITECTURE NOTES:
 * - Uses @hapi/bell for OAuth2 protocol handling (authorization code flow)
 * - Session storage is Redis-backed via @hapi/yar for horizontal scalability
 * - ID tokens are JWT format containing DEFRA-specific user claims
 * - Access tokens are opaque strings used for API authorization
 * - Refresh tokens enable silent token renewal (see token-refresh.js)
 *
 * SECURITY CONSIDERATIONS:
 * - Sessions are stored server-side (Redis) - only session ID goes to client cookie
 * - ID tokens are validated by Bell (signature, expiry, issuer, audience)
 * - CSRF protection via @hapi/crumb on state-changing operations
 * - Tokens never exposed to client JavaScript (httpOnly cookies)
 *
 * DEFRA ID REQUIREMENTS:
 * - serviceId parameter required in authorization request (identifies this service)
 * - contactId claim uniquely identifies user across DEFRA services
 * - relationships array links user to organizations/businesses
 * - roles array defines permissions within each relationship
 * - aal (Authentication Assurance Level) - login method security level
 * - loa (Level of Assurance) - identity verification level
 *
 * @see https://github.com/DEFRA/identity-hapi-plugin for DEFRA ID integration patterns
 */
const authController = {
  /**
   * GET /auth/login
   *
   * Initiates OAuth2 authorization code flow with DEFRA Customer Identity Service.
   *
   * FLOW:
   * 1. User clicks "Sign in" button
   * 2. This route is called with 'defra-id' strategy (Bell)
   * 3. Bell intercepts before this handler executes
   * 4. Bell constructs authorization URL with required parameters:
   *    - client_id: Identifies this application to DEFRA ID
   *    - response_type: 'code' (authorization code flow)
   *    - redirect_uri: Where DEFRA ID sends user after auth (callback URL)
   *    - scope: 'openid' (requests ID token with user claims)
   *    - state: CSRF protection token (Bell generates and validates)
   *    - serviceId: DEFRA-specific parameter identifying this service
   * 5. Bell redirects user to DEFRA ID authorization endpoint
   * 6. User authenticates with DEFRA ID (Azure AD B2C)
   * 7. DEFRA ID redirects to /auth/callback with authorization code
   *
   * WHY THIS HANDLER IS SIMPLE:
   * Bell handles all OAuth2 protocol complexity (authorization URL construction,
   * state parameter generation, PKCE, etc.). This handler never executes in
   * normal flow - it only runs if Bell encounters an error or during testing.
   *
   * @see src/server/common/helpers/auth/defra-id-strategy.js for Bell configuration
   */
  login: {
    handler(request, h) {
      // Bell intercepts requests to this route and handles OAuth2 redirect
      // This fallback handler only executes if Bell encounters an error
      // or during unit testing when Bell is not active
      return h.redirect('/')
    }
  },

  /**
   * GET /auth/callback
   *
   * OAuth2 callback endpoint - receives authorization code and exchanges it for tokens.
   *
   * FLOW (Bell handles steps 1-4 automatically):
   * 1. DEFRA ID redirects user here with authorization code
   * 2. Bell validates state parameter (CSRF protection)
   * 3. Bell exchanges authorization code for tokens at DEFRA ID token endpoint
   * 4. Bell validates ID token (signature, issuer, audience, expiry)
   * 5. THIS HANDLER: Extract user data from tokens and create session
   * 6. Redirect user to homepage (now authenticated)
   *
   * TOKEN RESPONSE FROM DEFRA ID:
   * - access_token: Opaque string for API authorization (short-lived)
   * - refresh_token: Long-lived token for renewing access tokens
   * - id_token: JWT containing user profile and DEFRA claims
   * - expires_in: Access token lifetime in seconds (typically 3600)
   * - token_type: "Bearer"
   *
   * ID TOKEN CLAIMS (JWT payload):
   * Standard OIDC claims:
   * - sub: Subject identifier (user's unique ID in DEFRA ID)
   * - email: User's email address
   * - given_name: User's first name
   * - family_name: User's last name
   * - iat: Issued at timestamp
   * - exp: Expiry timestamp
   * - iss: Issuer (DEFRA ID URL)
   * - aud: Audience (this service's client_id)
   *
   * DEFRA-specific claims:
   * - contactId: DEFRA's unique identifier (use this, not 'sub')
   * - relationships: Array of {organisationId, role} linking user to businesses
   * - roles: Array of permission strings within relationships
   * - aal: Authentication Assurance Level (1-3, higher = more secure login method)
   * - loa: Level of Assurance (identity verification level)
   *
   * SESSION STORAGE:
   * - Stored in Redis via @hapi/yar (horizontal scaling, no memory leaks)
   * - Session ID stored in httpOnly cookie (secure, not accessible to JS)
   * - Session data never sent to client (only session ID)
   *
   * @see src/server/common/helpers/auth/token-refresh.js for token renewal
   * @see src/server/common/helpers/session-helpers.js for session utilities
   */
  callback: {
    async handler(request, h) {
      try {
        request.logger.info('OAuth callback started')

        // Bell has already validated tokens and made them available in request.auth
        const { credentials } = request.auth
        request.logger.info(
          { isAuthenticated: request.auth.isAuthenticated },
          'Bell authentication status'
        )

        // Decode ID token to access DEFRA-specific claims
        // Bell validates the token signature, but doesn't parse custom claims
        // ID token is JWT format: header.payload.signature (base64-encoded)
        const idToken = credentials.token
        request.logger.info('Decoding ID token')
        const decoded = jwt.token.decode(idToken)
        const claims = decoded.decoded.payload
        request.logger.info(
          { contactId: claims.contactId, email: claims.email },
          'Token claims extracted'
        )

        // Construct session data object
        // IMPORTANT: Store all data needed for authorization decisions:
        // - contactId for user identification across DEFRA services
        // - roles for permission checks
        // - relationships for organization access
        // - tokens for API calls and renewal
        const sessionData = {
          // DEFRA's primary user identifier
          // Use contactId (not 'sub') for consistency across DEFRA services
          contactId: claims.contactId,

          // User profile for display
          email: claims.email,
          displayName: claims.given_name || claims.email, // Fallback to email if no name

          // OAuth2 tokens
          // accessToken: Used for authenticated API calls (Authorization: Bearer <token>)
          accessToken: credentials.token,

          // refreshToken: Used to obtain new access tokens when they expire
          // SECURITY: Never expose refresh tokens to client-side JavaScript
          refreshToken: credentials.refreshToken,

          // Track when access token expires to trigger refresh before API calls fail
          // Convert relative expiry (seconds) to absolute timestamp (ISO 8601)
          expiresAt: new Date(
            Date.now() + credentials.expiresIn * 1000
          ).toISOString(),

          // DEFRA-specific authorization data
          // relationships: Links user to organizations/businesses
          // Example: [{organisationId: '123', role: 'admin'}, {organisationId: '456', role: 'viewer'}]
          relationships: claims.relationships || [],

          // roles: Permission strings for current context
          // Example: ['trader:read', 'trader:write', 'admin:manage']
          roles: claims.roles || [],

          // Authentication Assurance Level: How secure was the login method?
          // aal1: Password only
          // aal2: Two-factor authentication (password + OTP/SMS)
          // aal3: Hardware token or biometric
          // Use this to enforce stricter auth for sensitive operations
          aal: claims.aal,

          // Level of Assurance: How verified is the user's identity?
          // loa1: Self-asserted (user provided info, not verified)
          // loa2: Verified (documents checked)
          // loa3: Physically verified (in-person identity check)
          // Use this to control access to high-risk operations
          loa: claims.loa
        }

        // Store session in Redis (via @hapi/yar)
        // Key: 'auth' (namespace for authentication data)
        // Value: sessionData object (serialized to JSON in Redis)
        // Session ID stored in httpOnly cookie: 'yar' (cookie name from config)
        request.logger.info('Storing session data in Redis')
        setSessionValue(request, 'auth', sessionData)

        // Redirect to original page or homepage
        // Flash message 'redirect' was set in session-strategy.js redirectTo function
        // If user visited /dashboard → /auth/login → (OAuth) → /auth/callback → /dashboard
        const redirect = request.yar.flash('redirect')?.at(0) ?? '/'
        request.logger.info(
          { redirect },
          'Redirecting after successful authentication'
        )

        return h.redirect(redirect)
      } catch (error) {
        request.logger.error(
          { err: error, stack: error.stack },
          'OAuth callback error'
        )
        throw error
      }
    }
  },

  /**
   * GET /auth/logout
   *
   * Logs user out of both this application and DEFRA Customer Identity Service.
   *
   * LOGOUT FLOW:
   * 1. Clear session data in Redis (removes all auth tokens and user data)
   * 2. Construct DEFRA ID logout URL with post-logout redirect
   * 3. Redirect user to DEFRA ID logout endpoint
   * 4. DEFRA ID terminates user's SSO session (logs out of all DEFRA services)
   * 5. DEFRA ID redirects user back to our post-logout URL (homepage)
   *
   * WHY REDIRECT TO DEFRA ID FOR LOGOUT?
   * DEFRA Customer Identity Service uses Single Sign-On (SSO). If we only
   * clear our local session, the user would still be logged into DEFRA ID
   * and could silently re-authenticate by clicking "Sign in" (no password needed).
   *
   * By redirecting to DEFRA ID's logout endpoint, we ensure:
   * - User's SSO session is terminated across ALL DEFRA services
   * - User must re-enter credentials to sign in again
   * - Meets security requirement for proper logout
   *
   * POST-LOGOUT REDIRECT:
   * - Must be registered in DEFRA ID configuration (whitelist)
   * - Dynamically constructed based on environment (dev/prod)
   * - Handles standard ports (80, 443) vs custom ports correctly
   * - URL-encoded to prevent injection attacks
   *
   * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html for OIDC logout spec
   */
  logout: {
    async handler(request, h) {
      // Clear session data from Redis
      // Removes all auth tokens, user data, and session ID
      // Cookie will be cleared by yar plugin
      clearSessionValue(request, 'auth')

      // Fetch DEFRA ID endpoints from OIDC discovery document
      // end_session_endpoint: DEFRA ID's logout URL
      // This is cached, so no performance penalty for repeated calls
      const oidcEndpoints = await getOidcEndpoints()

      // Construct post-logout redirect URI (where user goes after DEFRA ID logout)
      // This URL must be registered in DEFRA ID configuration (whitelist)
      // SECURITY: Only whitelisted URLs accepted (prevents open redirect)

      // Use HTTPS in production, HTTP in development
      const protocol = config.get('isProduction') ? 'https' : 'http'

      // Get configured host and port from environment
      const host = config.get('host')
      const port = config.get('port')

      // Omit port for standard HTTP (80) and HTTPS (443) ports
      // Include port for development (3000, 8080, etc.)
      // Examples:
      // - Production: https://trade-demo.defra.gov.uk
      // - Development: http://localhost:3000
      const postLogoutUri =
        port === 80 || port === 443
          ? `${protocol}://${host}`
          : `${protocol}://${host}:${port}`

      // Construct logout URL following OIDC RP-Initiated Logout spec
      // post_logout_redirect_uri: Where to send user after logout completes
      // URL encoding prevents injection attacks and handles special characters
      const logoutUrl = `${oidcEndpoints.end_session_endpoint}?post_logout_redirect_uri=${encodeURIComponent(postLogoutUri)}`

      // Redirect user to DEFRA ID logout endpoint
      // DEFRA ID will:
      // 1. Terminate user's SSO session
      // 2. Clear DEFRA ID cookies
      // 3. Redirect back to our postLogoutUri
      return h.redirect(logoutUrl)
    }
  }
}

export { authController }
