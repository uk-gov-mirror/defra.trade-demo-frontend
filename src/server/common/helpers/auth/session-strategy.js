import { isPast, parseISO, subMinutes } from 'date-fns'
import { refreshAccessToken } from './token-refresh.js'

/**
 * Configure yar-based session authentication strategy
 * Validates user sessions stored in Redis and automatically refreshes expired tokens
 * @param {Object} server - Hapi server instance
 */
async function setupSessionStrategy(server) {
  // Register custom authentication scheme that validates against yar session data
  server.auth.scheme('yar-session', () => {
    return {
      authenticate: async (request, h) => {
        // Get session data from yar (Redis-backed session storage)
        const sessionData = request.yar.get('auth')

        // Check authentication mode from route configuration
        const authMode = request.route.settings.auth.mode

        if (!sessionData) {
          // No session data
          if (authMode === 'try' || authMode === 'optional') {
            // For 'try' or 'optional' mode, allow request to proceed without credentials
            return h.authenticated({ credentials: {} })
          }

          // For 'required' mode, save original path and redirect to login
          request.yar.flash('redirect', request.path)
          return h.redirect('/auth/login').takeover()
        }

        // Check if token has expired (with 1-minute buffer)
        const tokenHasExpired = isPast(
          subMinutes(parseISO(sessionData.expiresAt), 1)
        )

        if (tokenHasExpired && sessionData.refreshToken) {
          try {
            // Attempt to refresh the access token
            const newTokens = await refreshAccessToken(sessionData.refreshToken)

            // Update session with new tokens
            const updatedSession = {
              ...sessionData,
              accessToken: newTokens.access_token,
              refreshToken: newTokens.refresh_token,
              expiresAt: new Date(
                Date.now() + newTokens.expires_in * 1000
              ).toISOString()
            }

            request.yar.set('auth', updatedSession)

            return h.authenticated({ credentials: updatedSession })
          } catch (error) {
            // Token refresh failed - clear session
            request.yar.clear('auth')

            if (authMode === 'try' || authMode === 'optional') {
              // Allow request to proceed without credentials
              return h.authenticated({ credentials: {} })
            }

            // For 'required' mode, redirect to login
            request.yar.flash('redirect', request.path)
            return h.redirect('/auth/login').takeover()
          }
        }

        return h.authenticated({ credentials: sessionData })
      }
    }
  })

  // Register the strategy using our custom scheme
  server.auth.strategy('session-cookie', 'yar-session')
}

export { setupSessionStrategy }
