/**
 * Dashboard Controller
 *
 * Entry point to the trade imports journey - requires authentication.
 * Displays authenticated user information and provides navigation to imports functionality.
 *
 * AUTHENTICATION:
 * This controller expects the user to be authenticated via the 'session-cookie' strategy.
 * If the user is not authenticated, Hapi will redirect to /auth/login automatically.
 *
 * SESSION DATA:
 * User data is retrieved from the session, which was populated by the /auth/callback
 * handler after successful OAuth2 authentication with DEFRA Customer Identity Service.
 *
 * @see src/server/dashboard/index.js for route registration
 * @see src/server/auth/controller.js for session creation
 */

import { getSessionValue } from '../common/helpers/session-helpers.js'

export const dashboardController = {
  /**
   * GET /dashboard
   *
   * Renders the dashboard page for authenticated users.
   *
   * This is the entry point to the trade imports journey. The dashboard displays:
   * - User profile information (name, email, contact ID)
   * - Navigation to imports functionality
   * - Sign out link
   *
   * FLOW:
   * 1. User navigates to /dashboard
   * 2. session-cookie strategy validates session exists in Redis
   * 3. If no session: redirect to /auth/login (handled by Hapi)
   * 4. If session valid: this handler executes
   * 5. Retrieve auth data from session
   * 6. Render dashboard template with user data
   *
   * SESSION DATA STRUCTURE:
   * The 'auth' session key contains:
   * - displayName: User's display name (from given_name claim)
   * - email: User's email address
   * - contactId: DEFRA's unique user identifier
   * - roles: Array of permission strings
   * - relationships: Array of organization relationships
   * - accessToken: OAuth2 access token (for API calls)
   * - refreshToken: OAuth2 refresh token (for token renewal)
   * - expiresAt: ISO 8601 timestamp when access token expires
   * - aal: Authentication Assurance Level (login security level)
   * - loa: Level of Assurance (identity verification level)
   *
   * FUTURE ENHANCEMENTS:
   * - Display recent import declarations
   * - Show statistics (total imports, pending reviews, etc.)
   * - Quick actions (start new import, view drafts, etc.)
   * - Notifications and alerts
   */
  handler(request, h) {
    // Retrieve authentication data from session
    // This was set by /auth/callback after successful login
    const authData = getSessionValue(request, 'auth')

    return h.view('dashboard/index', {
      pageTitle: 'Dashboard',
      heading: 'Trade Imports Dashboard',
      user: {
        displayName: authData.displayName,
        email: authData.email,
        contactId: authData.contactId
      },
      // Future: Add imports-specific data here
      // - recentImports: await fetchRecentImports(authData.contactId)
      // - statistics: await fetchImportStatistics(authData.contactId)
      showImportsLink: true
    })
  }
}
