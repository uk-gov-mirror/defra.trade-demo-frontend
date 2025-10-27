/**
 * Dashboard Plugin
 *
 * Registers the protected dashboard route - entry point to the trade imports journey.
 *
 * AUTHENTICATION REQUIREMENT:
 * The dashboard route uses 'session-cookie' strategy with mode: 'required'.
 * This means:
 * - Users MUST have a valid session to access the dashboard
 * - Unauthenticated users are automatically redirected to /auth/login
 * - Session is validated on EVERY request by checking Redis for session data
 * - Expired tokens are automatically refreshed (see session-strategy.js)
 *
 * AUTHENTICATION FLOW (when user accesses /dashboard):
 *
 * Unauthenticated User:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ User → /dashboard → No session? → Redirect to /auth/login       │
 * │                                          ↓                       │
 * │                                    Bell intercepts              │
 * │                                          ↓                       │
 * │                               Redirect to DEFRA ID stub         │
 * │                                          ↓                       │
 * │                               User authenticates on stub        │
 * │                                          ↓                       │
 * │                    Stub redirects to /auth/callback?code=...    │
 * │                                          ↓                       │
 * │                               Bell exchanges code for tokens    │
 * │                                          ↓                       │
 * │                    Callback handler creates session in Redis    │
 * │                                          ↓                       │
 * │                         Set 'yar' cookie with session ID        │
 * │                                          ↓                       │
 * │                               Redirect to homepage (/)          │
 * │                                          ↓                       │
 * │                            User navigates to /dashboard         │
 * │                                          ↓                       │
 * │                  Session cookie validated → Dashboard renders   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Authenticated User (subsequent requests):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ User → /dashboard → Has 'yar' cookie?                           │
 * │                           ↓                                      │
 * │                  session-cookie strategy validates              │
 * │                           ↓                                      │
 * │                  Lookup session in Redis by ID                  │
 * │                           ↓                                      │
 * │                  Session found & token valid?                   │
 * │                           ↓                                      │
 * │                  Dashboard handler executes                     │
 * │                           ↓                                      │
 * │                  Retrieve auth data from session                │
 * │                           ↓                                      │
 * │                  Render dashboard template                      │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ROUTE PROTECTION PATTERN:
 * This plugin demonstrates the standard pattern for protecting routes:
 * ```javascript
 * options: {
 *   auth: {
 *     strategy: 'session-cookie',
 *     mode: 'required'
 *   }
 * }
 * ```
 *
 * OTHER AUTH MODES:
 * - mode: 'try' - Attempt authentication but allow anonymous access
 * - mode: 'optional' - Similar to 'try' but sets isAuthenticated flag
 *
 * REGISTRATION ORDER:
 * This plugin must be registered AFTER authentication strategies are set up.
 * See src/server/server.js for correct initialization order:
 * 1. setupDefraIdStrategy() - Registers OAuth2 strategy
 * 2. setupSessionStrategy() - Registers session validation strategy
 * 3. server.register([router]) - Registers all route plugins (including this)
 *
 * @see src/server/dashboard/controller.js for handler implementation
 * @see src/server/common/helpers/auth/session-strategy.js for session validation
 */

import { dashboardController } from './controller.js'

export const dashboard = {
  plugin: {
    name: 'dashboard',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/dashboard',
          ...dashboardController,
          options: {
            auth: {
              strategy: 'session-cookie',
              mode: 'required' // Must be authenticated - no anonymous access
            },
            description: 'Trade imports dashboard',
            notes:
              'Protected route - entry point to imports journey. Requires valid session cookie.'
          }
        }
      ])
    }
  }
}
