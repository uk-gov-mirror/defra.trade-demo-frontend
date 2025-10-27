import { vi } from 'vitest'

/**
 * Mock OIDC discovery for unit tests that create full server instances
 * Import this in any test file that calls createServer() to avoid network calls
 *
 * Usage:
 *   import '../common/test-helpers/mock-oidc-discovery.js'
 */

vi.mock('../../common/helpers/oidc-discovery.js', () => ({
  getOidcEndpoints: vi.fn(async () => ({
    authorization_endpoint: 'https://example.com/authorize',
    token_endpoint: 'https://example.com/token',
    end_session_endpoint: 'https://example.com/logout',
    jwks_uri: 'https://example.com/jwks'
  }))
}))
