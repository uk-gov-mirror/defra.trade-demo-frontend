import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock config and OIDC discovery
vi.mock('../../../../config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const config = {
        'defraId.clientId': 'test-client-id',
        'defraId.clientSecret': 'test-client-secret'
      }
      return config[key] || ''
    })
  }
}))

vi.mock('../oidc-discovery.js', () => ({
  getOidcEndpoints: vi.fn(async () => ({
    token_endpoint: 'https://example.com/token'
  }))
}))

// Mock global fetch
global.fetch = vi.fn()

describe('Token Refresh', () => {
  let refreshAccessToken

  beforeEach(async () => {
    vi.clearAllMocks()
    global.fetch.mockClear()

    const module = await import('./token-refresh.js')
    refreshAccessToken = module.refreshAccessToken
  })

  test('Should exchange refresh token for new access token', async () => {
    const mockResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600
    }

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const result = await refreshAccessToken('test-refresh-token')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
    )

    const callArgs = global.fetch.mock.calls[0][1]
    const body = callArgs.body.toString()
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=test-refresh-token')
    expect(body).toContain('client_id=test-client-id')
    expect(body).toContain('client_secret=test-client-secret')

    expect(result).toEqual(mockResponse)
  })

  test('Should throw error when no refresh token provided', async () => {
    await expect(refreshAccessToken(null)).rejects.toThrow(
      'No refresh token provided'
    )
    await expect(refreshAccessToken('')).rejects.toThrow(
      'No refresh token provided'
    )
  })

  test('Should throw error on token refresh failure (HTTP error)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid_grant'
    })

    await expect(refreshAccessToken('invalid-refresh-token')).rejects.toThrow(
      'Token refresh failed: 400 Bad Request'
    )
  })

  test('Should throw error on network failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(refreshAccessToken('test-refresh-token')).rejects.toThrow(
      'Network error'
    )
  })

  test('Should use correct content type header', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    })

    await refreshAccessToken('test-refresh-token')

    const callArgs = global.fetch.mock.calls[0][1]
    expect(callArgs.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    )
  })
})
