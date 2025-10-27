import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock token refresh
vi.mock('./token-refresh.js', () => ({
  refreshAccessToken: vi.fn()
}))

describe('Session Strategy', () => {
  let setupSessionStrategy
  let mockServer

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create mock Hapi server
    mockServer = {
      auth: {
        scheme: vi.fn(),
        strategy: vi.fn()
      }
    }

    const module = await import('./session-strategy.js')
    setupSessionStrategy = module.setupSessionStrategy
  })

  test('Should register custom yar-session scheme', async () => {
    await setupSessionStrategy(mockServer)

    expect(mockServer.auth.scheme).toHaveBeenCalledWith(
      'yar-session',
      expect.any(Function)
    )
  })

  test('Should register strategy with yar-session scheme', async () => {
    await setupSessionStrategy(mockServer)

    expect(mockServer.auth.strategy).toHaveBeenCalledWith(
      'session-cookie',
      'yar-session'
    )
  })

  test('Should redirect to login when no session data (required mode)', async () => {
    await setupSessionStrategy(mockServer)

    // Get the scheme function
    const schemeFunc = mockServer.auth.scheme.mock.calls[0][1]
    const scheme = schemeFunc()

    const mockRequest = {
      path: '/dashboard',
      route: {
        settings: {
          auth: {
            mode: 'required'
          }
        }
      },
      yar: {
        get: vi.fn(() => null),
        flash: vi.fn()
      }
    }

    const mockH = {
      redirect: vi.fn(() => ({
        takeover: vi.fn(() => 'redirect-response')
      }))
    }

    const result = await scheme.authenticate(mockRequest, mockH)

    expect(mockRequest.yar.flash).toHaveBeenCalledWith('redirect', '/dashboard')
    expect(mockH.redirect).toHaveBeenCalledWith('/auth/login')
    expect(result).toBe('redirect-response')
  })

  test('Should allow request when no session data (try mode)', async () => {
    await setupSessionStrategy(mockServer)

    const schemeFunc = mockServer.auth.scheme.mock.calls[0][1]
    const scheme = schemeFunc()

    const mockRequest = {
      path: '/auth/logout',
      route: {
        settings: {
          auth: {
            mode: 'try'
          }
        }
      },
      yar: {
        get: vi.fn(() => null)
      }
    }

    const mockH = {
      authenticated: vi.fn((data) => data)
    }

    await scheme.authenticate(mockRequest, mockH)

    expect(mockH.authenticated).toHaveBeenCalledWith({ credentials: {} })
  })

  test('Should authenticate when token not expired', async () => {
    await setupSessionStrategy(mockServer)

    const schemeFunc = mockServer.auth.scheme.mock.calls[0][1]
    const scheme = schemeFunc()

    const futureDate = new Date(Date.now() + 3600000).toISOString()

    const sessionData = {
      contactId: 'test-contact',
      accessToken: 'test-token',
      expiresAt: futureDate
    }

    const mockRequest = {
      path: '/dashboard',
      route: {
        settings: {
          auth: {
            mode: 'required'
          }
        }
      },
      yar: {
        get: vi.fn(() => sessionData)
      }
    }

    const mockH = {
      authenticated: vi.fn((data) => data)
    }

    await scheme.authenticate(mockRequest, mockH)

    expect(mockH.authenticated).toHaveBeenCalledWith({
      credentials: sessionData
    })
    expect(mockRequest.yar.get).toHaveBeenCalledWith('auth')
  })

  test('Should refresh token when expired', async () => {
    const { refreshAccessToken } = await import('./token-refresh.js')

    const newTokens = {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600
    }

    refreshAccessToken.mockResolvedValue(newTokens)

    await setupSessionStrategy(mockServer)

    const schemeFunc = mockServer.auth.scheme.mock.calls[0][1]
    const scheme = schemeFunc()

    const expiredDate = new Date(Date.now() - 1000).toISOString()

    const sessionData = {
      contactId: 'test-contact',
      accessToken: 'old-token',
      refreshToken: 'old-refresh',
      expiresAt: expiredDate
    }

    const mockRequest = {
      path: '/dashboard',
      route: {
        settings: {
          auth: {
            mode: 'required'
          }
        }
      },
      yar: {
        get: vi.fn(() => sessionData),
        set: vi.fn()
      }
    }

    const mockH = {
      authenticated: vi.fn((data) => data)
    }

    await scheme.authenticate(mockRequest, mockH)

    expect(refreshAccessToken).toHaveBeenCalledWith('old-refresh')
    expect(mockRequest.yar.set).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        accessToken: 'new-token',
        refreshToken: 'new-refresh'
      })
    )
    expect(mockH.authenticated).toHaveBeenCalled()
  })

  test('Should redirect to login when token refresh fails', async () => {
    const { refreshAccessToken } = await import('./token-refresh.js')

    refreshAccessToken.mockRejectedValue(new Error('Refresh failed'))

    await setupSessionStrategy(mockServer)

    const schemeFunc = mockServer.auth.scheme.mock.calls[0][1]
    const scheme = schemeFunc()

    const expiredDate = new Date(Date.now() - 1000).toISOString()

    const sessionData = {
      contactId: 'test-contact',
      accessToken: 'old-token',
      refreshToken: 'old-refresh',
      expiresAt: expiredDate
    }

    const mockRequest = {
      path: '/dashboard',
      route: {
        settings: {
          auth: {
            mode: 'required'
          }
        }
      },
      yar: {
        get: vi.fn(() => sessionData),
        clear: vi.fn(),
        flash: vi.fn()
      }
    }

    const mockH = {
      redirect: vi.fn(() => ({
        takeover: vi.fn(() => 'redirect-response')
      }))
    }

    const result = await scheme.authenticate(mockRequest, mockH)

    expect(mockRequest.yar.clear).toHaveBeenCalledWith('auth')
    expect(mockRequest.yar.flash).toHaveBeenCalledWith('redirect', '/dashboard')
    expect(mockH.redirect).toHaveBeenCalledWith('/auth/login')
    expect(result).toBe('redirect-response')
  })
})
