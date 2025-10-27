import { beforeAll, vi } from 'vitest'

// Set required DEFRA ID environment variables for all tests
// These are needed by both unit tests and integration tests
beforeAll(() => {
  vi.stubEnv(
    'DEFRA_ID_OIDC_DISCOVERY_URL',
    'http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration'
  )
  vi.stubEnv('DEFRA_ID_CLIENT_ID', 'test-client')
  vi.stubEnv('DEFRA_ID_CLIENT_SECRET', 'test-secret')
  vi.stubEnv('DEFRA_ID_SERVICE_ID', 'test-service')
})
