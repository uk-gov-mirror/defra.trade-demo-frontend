import { config } from '../../../config/config.js'

let cachedOidcEndpoints = null

/**
 * Fetch OIDC endpoints from DEFRA ID discovery endpoint
 * Caches the result to avoid repeated HTTP calls
 * @returns {Promise<Object>} OIDC endpoints
 */
async function getOidcEndpoints() {
  if (cachedOidcEndpoints) {
    return cachedOidcEndpoints
  }

  const discoveryUrl = config.get('defraId.oidcDiscoveryUrl')

  try {
    const response = await fetch(discoveryUrl)

    if (!response.ok) {
      throw new Error(
        `OIDC discovery failed: ${response.status} ${response.statusText}`
      )
    }

    const endpoints = await response.json()

    // Cache the endpoints
    cachedOidcEndpoints = endpoints

    return endpoints
  } catch (error) {
    throw new Error(`Failed to fetch OIDC configuration: ${error.message}`)
  }
}

export { getOidcEndpoints }
