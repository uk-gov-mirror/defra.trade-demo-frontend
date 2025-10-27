import { authController } from './controller.js'

/**
 * Authentication Routes Plugin
 *
 * Registers OAuth2/OIDC authentication routes for DEFRA Customer Identity Service.
 * These routes implement the complete authentication lifecycle: login, callback, logout.
 *
 * ROUTE REGISTRATION ORDER:
 * This plugin must be registered AFTER authentication strategies are set up.
 * See src/server/server.js for the correct initialization sequence:
 * 1. setupDefraIdStrategy() - Registers 'defra-id' strategy
 * 2. setupSessionStrategy() - Registers 'session-cookie' strategy
 * 3. register([router]) - Registers routes (including this auth plugin)
 *
 * If routes are registered before strategies, server will throw:
 * "Unknown authentication strategy defra-id in /auth/login"
 *
 * CONDITIONAL REGISTRATION:
 * This plugin is only registered when DEFRA ID configuration is present.
 * See src/server/router.js for the conditional logic based on config values.
 * This allows the application to start without authentication in test/dev environments.
 *
 * AUTHENTICATION STRATEGIES EXPLAINED:
 *
 * 'defra-id' strategy (Bell OAuth2):
 * - Implements OAuth2 authorization code flow
 * - Handles redirects to/from DEFRA Customer Identity Service
 * - Validates tokens and extracts user credentials
 * - Used on /auth/login and /auth/callback routes
 * - Configured in: src/server/common/helpers/auth/defra-id-strategy.js
 *
 * 'session-cookie' strategy (custom):
 * - Validates user has active session in Redis
 * - Extracts user data from session storage
 * - Used on protected application routes
 * - Configured in: src/server/common/helpers/auth/session-strategy.js
 *
 * @see src/server/auth/controller.js for handler implementations
 * @see src/server/common/helpers/auth/defra-id-strategy.js for OAuth2 strategy config
 * @see src/server/common/helpers/auth/session-strategy.js for session strategy config
 */
export const auth = {
  plugin: {
    name: 'auth',
    register: async (server) => {
      server.route([
        /**
         * GET /auth/login
         *
         * Initiates OAuth2 authorization code flow with DEFRA Customer Identity Service.
         *
         * AUTHENTICATION STRATEGY: 'defra-id' (Bell OAuth2)
         * - mode: 'required' - All requests must authenticate (no anonymous access)
         * - Bell intercepts this route and redirects to DEFRA ID authorization endpoint
         * - Handler only executes on error or in testing (Bell handles normal flow)
         *
         * FLOW:
         * 1. User navigates to /auth/login (e.g., clicks "Sign in" button)
         * 2. Bell strategy intercepts request
         * 3. Bell constructs OAuth2 authorization URL with:
         *    - client_id (identifies this application)
         *    - redirect_uri (callback URL)
         *    - scope (openid for ID token)
         *    - state (CSRF protection)
         *    - serviceId (DEFRA-specific parameter)
         * 4. Bell redirects user to DEFRA ID
         * 5. User authenticates with DEFRA ID (Azure AD B2C)
         * 6. DEFRA ID redirects to /auth/callback with authorization code
         *
         * TYPICAL USER JOURNEY:
         * Homepage -> Click "Sign in" -> /auth/login -> DEFRA ID login page ->
         * /auth/callback -> Homepage (authenticated)
         *
         * @see src/server/auth/controller.js login handler for implementation
         */
        {
          method: 'GET',
          path: '/auth/login',
          ...authController.login,
          options: {
            auth: {
              strategy: 'defra-id',
              mode: 'required'
            },
            description: 'Initiate DEFRA ID authentication',
            notes: 'Redirects to DEFRA ID authorization endpoint'
          }
        },

        /**
         * GET /auth/callback
         *
         * OAuth2 callback endpoint - receives authorization code and creates session.
         *
         * AUTHENTICATION STRATEGY: 'defra-id' (Bell OAuth2)
         * - mode: 'required' - Must have valid OAuth2 response from DEFRA ID
         * - Bell handles token exchange and validation before handler executes
         *
         * FLOW:
         * 1. DEFRA ID redirects user here with authorization code
         * 2. Bell validates state parameter (CSRF protection)
         * 3. Bell exchanges code for tokens at DEFRA ID token endpoint
         * 4. Bell validates ID token (signature, issuer, audience, expiry)
         * 5. Handler extracts user data from tokens
         * 6. Handler creates session in Redis
         * 7. Handler redirects to homepage
         *
         * TOKEN VALIDATION (automatic by Bell):
         * - ID token signature verified using DEFRA ID public keys (JWKS)
         * - Issuer (iss) matches DEFRA ID URL
         * - Audience (aud) matches our client_id
         * - Expiry (exp) is in the future
         * - Not before (nbf) is in the past
         *
         * WHAT HANDLER DOES:
         * - Decode ID token to access DEFRA-specific claims (contactId, roles, etc.)
         * - Construct session data object with user profile and tokens
         * - Store session in Redis (via @hapi/yar)
         * - Redirect user to homepage (now authenticated)
         *
         * SECURITY NOTES:
         * - This route must never be called directly by users
         * - Only DEFRA ID should redirect here (after authentication)
         * - State parameter prevents CSRF attacks
         * - Authorization code is single-use and short-lived (60 seconds)
         *
         * @see src/server/auth/controller.js callback handler for implementation
         */
        {
          method: 'GET',
          path: '/auth/callback',
          ...authController.callback,
          options: {
            auth: {
              strategy: 'defra-id',
              mode: 'required'
            },
            description: 'DEFRA ID OAuth2 callback',
            notes: 'Handles OAuth2 callback and creates user session'
          }
        },

        /**
         * GET /auth/logout
         *
         * Logs user out of both this application and DEFRA Customer Identity Service.
         *
         * AUTHENTICATION STRATEGY: 'session-cookie' (custom session validation)
         * - mode: 'try' - Attempt authentication but allow anonymous access
         * - 'try' mode allows logout even if session expired (graceful degradation)
         * - If session exists: clear it and redirect to DEFRA ID logout
         * - If no session: still redirect to DEFRA ID logout (SSO logout)
         *
         * WHY 'try' INSTEAD OF 'required':
         * If session expired between page load and logout click, we still want
         * to redirect to DEFRA ID logout endpoint to clear SSO session. Using
         * 'required' would redirect to login page (bad UX).
         *
         * FLOW:
         * 1. User clicks "Sign out" button
         * 2. Request sent to /auth/logout
         * 3. Handler clears session data in Redis
         * 4. Handler constructs DEFRA ID logout URL with post-logout redirect
         * 5. Handler redirects to DEFRA ID end_session_endpoint
         * 6. DEFRA ID terminates SSO session (logs out of ALL DEFRA services)
         * 7. DEFRA ID redirects back to our homepage
         *
         * WHY REDIRECT TO DEFRA ID FOR LOGOUT:
         * DEFRA Customer Identity Service uses Single Sign-On (SSO). If we only
         * clear our local session, user remains logged into DEFRA ID and could
         * silently re-authenticate without password. Redirecting to DEFRA ID
         * logout ensures proper SSO session termination.
         *
         * POST-LOGOUT REDIRECT:
         * The URL where users are sent after DEFRA ID logout must be:
         * - Registered in DEFRA ID configuration (whitelist)
         * - Dynamically constructed based on environment (dev/prod)
         * - URL-encoded to prevent injection attacks
         *
         * @see src/server/auth/controller.js logout handler for implementation
         * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html for OIDC logout spec
         */
        {
          method: 'GET',
          path: '/auth/logout',
          ...authController.logout,
          options: {
            auth: {
              strategy: 'session-cookie',
              mode: 'try'
            },
            description: 'Logout from DEFRA ID',
            notes: 'Clears session and redirects to DEFRA ID logout'
          }
        }
      ])
    }
  }
}
