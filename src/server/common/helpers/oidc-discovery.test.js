import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock fetch globally
global.fetch = vi.fn()

describe('OIDC Discovery', () => {
  const mockEndpoints = {
    authorization_endpoint: 'https://example.com/authorize',
    token_endpoint: 'https://example.com/token',
    end_session_endpoint: 'https://example.com/logout',
    jwks_uri: 'https://example.com/jwks',
    issuer: 'https://example.com'
  }

  let getOidcEndpoints

  beforeEach(async () => {
    // Clear the cache by re-importing the module
    vi.resetModules()
    global.fetch.mockClear()

    // Re-import to get a fresh cache
    const module = await import('./oidc-discovery.js')
    getOidcEndpoints = module.getOidcEndpoints
  })

  test('Should fetch endpoints from discovery URL', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEndpoints
    })

    const endpoints = await getOidcEndpoints()

    expect(endpoints).toEqual(mockEndpoints)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    // Verify fetch was called (URL will be empty string in test env without .env)
    expect(global.fetch).toHaveBeenCalled()
  })

  test('Should cache endpoints after first fetch', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEndpoints
    })

    // First call - should fetch
    const firstCall = await getOidcEndpoints()
    expect(firstCall).toEqual(mockEndpoints)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Second call - should use cache
    const secondCall = await getOidcEndpoints()
    expect(secondCall).toEqual(mockEndpoints)
    expect(global.fetch).toHaveBeenCalledTimes(1) // Still only called once
    expect(firstCall).toBe(secondCall) // Same object reference
  })

  test('Should throw error on discovery failure (HTTP error)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await expect(getOidcEndpoints()).rejects.toThrow(
      'OIDC discovery failed: 404 Not Found'
    )
  })

  test('Should throw error on network failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(getOidcEndpoints()).rejects.toThrow(
      'Failed to fetch OIDC configuration: Network error'
    )
  })

  test('Should return expected endpoint structure', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEndpoints
    })

    const endpoints = await getOidcEndpoints()

    expect(endpoints).toHaveProperty('authorization_endpoint')
    expect(endpoints).toHaveProperty('token_endpoint')
    expect(endpoints).toHaveProperty('end_session_endpoint')
    expect(endpoints).toHaveProperty('jwks_uri')
    expect(endpoints).toHaveProperty('issuer')
  })
})
