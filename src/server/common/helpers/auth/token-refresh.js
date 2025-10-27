import { config } from '../../../../config/config.js'
import { getOidcEndpoints } from '../oidc-discovery.js'

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - The refresh token from session
 * @returns {Promise<Object>} Response with new tokens
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('No refresh token provided')
  }

  const oidcEndpoints = await getOidcEndpoints()

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.get('defraId.clientId'),
    client_secret: config.get('defraId.clientSecret')
  })

  const response = await fetch(oidcEndpoints.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  return response.json()
}

export { refreshAccessToken }
