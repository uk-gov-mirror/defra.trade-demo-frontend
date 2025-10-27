import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

/**
 * Integration test for OIDC Discovery
 * Tests against real cdp-defra-id-stub running in Docker Compose
 *
 * Requires: docker compose up defra-id-stub
 */

// Wait for stub to be ready
async function waitForStub(url, maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return true
      }
    } catch {
      // Service not ready yet
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  throw new Error(
    `DEFRA ID stub not ready after ${maxAttempts} attempts. Is docker compose up?`
  )
}

describe('OIDC Discovery - Integration Test', () => {
  let getOidcEndpoints

  beforeAll(async () => {
    // Wait for stub to be ready
    await waitForStub(
      'http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration'
    )

    // Import module after stub is ready
    const module = await import('./oidc-discovery.js')
    getOidcEndpoints = module.getOidcEndpoints
  }, 60000) // 60 second timeout for Docker image pull

  afterAll(() => {
    // Clear module cache to avoid affecting other tests
    vi.resetModules()
  })

  test('Should fetch real OIDC endpoints from cdp-defra-id-stub', async () => {
    const endpoints = await getOidcEndpoints()

    // Validate real response structure from stub
    expect(endpoints).toHaveProperty('authorization_endpoint')
    expect(endpoints).toHaveProperty('token_endpoint')
    expect(endpoints).toHaveProperty('end_session_endpoint')
    expect(endpoints).toHaveProperty('jwks_uri')
    expect(endpoints).toHaveProperty('issuer')

    // Validate URLs are non-empty strings (stub returns localhost URLs)
    expect(typeof endpoints.authorization_endpoint).toBe('string')
    expect(endpoints.authorization_endpoint.length).toBeGreaterThan(0)
    expect(typeof endpoints.token_endpoint).toBe('string')
    expect(endpoints.token_endpoint.length).toBeGreaterThan(0)
  })

  test('Should cache endpoints from stub', async () => {
    const first = await getOidcEndpoints()
    const second = await getOidcEndpoints()

    // Same object reference = cached
    expect(first).toBe(second)
  })

  test('Should return valid OIDC endpoint URLs', async () => {
    const endpoints = await getOidcEndpoints()

    // Validate URLs are valid
    expect(() => new URL(endpoints.authorization_endpoint)).not.toThrow()
    expect(() => new URL(endpoints.token_endpoint)).not.toThrow()
    expect(() => new URL(endpoints.end_session_endpoint)).not.toThrow()
    expect(() => new URL(endpoints.jwks_uri)).not.toThrow()
  })
})
