import Bell from '@hapi/bell'
import jwt from '@hapi/jwt'
import { config } from '../../../../config/config.js'
import { getOidcEndpoints } from '../oidc-discovery.js'

/**
 * Configure DEFRA ID OAuth2 authentication strategy using Bell
 * Implements OAuth2 authorization code flow with PKCE
 * @param {Object} server - Hapi server instance
 */
async function setupDefraIdStrategy(server) {
  // Register Bell and JWT plugins
  await server.register([Bell, jwt])

  // Fetch OIDC endpoints from discovery
  const oidcEndpoints = await getOidcEndpoints()

  // Construct OAuth callback URL
  // This is where DEFRA ID will redirect after authentication
  const protocol = config.get('isProduction') ? 'https' : 'http'
  const host =
    config.get('host') === '0.0.0.0' ? 'localhost' : config.get('host')
  const port = config.get('port')
  const portSuffix = port === 80 || port === 443 ? '' : `:${port}`
  const callbackUrl = `${protocol}://${host}${portSuffix}/auth/callback`

  server.auth.strategy('defra-id', 'bell', {
    // IMPORTANT: location must be a function, not a string
    // Bell's behavior differs: function uses return value directly,
    // string may append current route path incorrectly
    // Note: We don't capture HTTP Referer here as it's unreliable
    // Original request path is captured in session-strategy.js redirectTo function
    location: () => callbackUrl,
    provider: {
      name: 'defra-id',
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcEndpoints.authorization_endpoint,
      token: oidcEndpoints.token_endpoint,
      scope: ['openid', 'profile', 'email', 'offline_access'],

      /**
       * Extract user profile from ID token
       * @param {Object} credentials - OAuth2 credentials from Bell
       * @param {Object} params - Token response parameters
       * @returns {Promise<Object>} User profile
       */
      profile: async (credentials, params) => {
        // Decode ID token to extract user claims
        const idToken = params.id_token
        const decoded = jwt.token.decode(idToken)
        const claims = decoded.decoded.payload

        return {
          id: claims.contactId,
          email: claims.email,
          displayName: claims.given_name,
          raw: claims
        }
      }
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('defraId.clientId'),
    clientSecret: config.get('defraId.clientSecret'),
    forceHttps: config.get('isProduction'),
    isSecure: config.get('isProduction'),

    // CRITICAL: DEFRA-specific parameter required for authentication
    // Function allows dynamic parameters per-request (e.g., login_hint for SSO handoffs)
    providerParams: (request) => {
      const params = {
        serviceId: config.get('defraId.serviceId')
      }

      // Support OpenID Connect login_hint parameter for cross-system SSO
      // Example: /auth/login?login_hint=user@example.com
      // The hint pre-populates the username field at DEFRA ID login page
      if (request.query.login_hint) {
        const loginHint = String(request.query.login_hint).trim()
        // Basic validation: non-empty and reasonable length
        if (loginHint && loginHint.length <= 255) {
          params.login_hint = loginHint
        }
      }

      return params
    },

    // Enable PKCE (Proof Key for Code Exchange) for enhanced security
    config: {
      usePKCE: true
    }
  })
}

export { setupDefraIdStrategy }
