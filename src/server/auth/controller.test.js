import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock dependencies
vi.mock('../../config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const config = {
        isProduction: false,
        host: 'localhost',
        port: 3000
      }
      return config[key] || ''
    })
  }
}))

vi.mock('../common/helpers/oidc-discovery.js', () => ({
  getOidcEndpoints: vi.fn(async () => ({
    end_session_endpoint: 'https://example.com/logout'
  }))
}))

vi.mock('@hapi/jwt', () => ({
  default: {
    token: {
      decode: vi.fn((token) => ({
        decoded: {
          payload: {
            contactId: 'test-contact-id',
            email: 'test@example.com',
            given_name: 'Test User',
            relationships: [],
            roles: ['user'],
            aal: 'aal2',
            loa: '2'
          }
        }
      }))
    }
  }
}))

describe('Auth Controller', () => {
  let authController
  let mockRequest
  let mockH

  beforeEach(async () => {
    vi.clearAllMocks()

    // Mock Hapi request and response toolkit
    mockRequest = {
      auth: {
        credentials: {
          token: 'test-id-token',
          refreshToken: 'test-refresh-token',
          expiresIn: 3600
        },
        isAuthenticated: true
      },
      yar: {
        set: vi.fn(),
        clear: vi.fn(),
        flash: vi.fn(() => [])
      },
      logger: {
        info: vi.fn(),
        error: vi.fn()
      }
    }

    mockH = {
      redirect: vi.fn((url) => url)
    }

    const module = await import('./controller.js')
    authController = module.authController
  })

  describe('login', () => {
    test('Should redirect to homepage', () => {
      const result = authController.login.handler(mockRequest, mockH)

      expect(mockH.redirect).toHaveBeenCalledWith('/')
      expect(result).toBe('/')
    })
  })

  describe('callback', () => {
    test('Should create session with user data', async () => {
      await authController.callback.handler(mockRequest, mockH)

      expect(mockRequest.yar.set).toHaveBeenCalledTimes(1)
      expect(mockRequest.yar.set).toHaveBeenCalledWith(
        'auth',
        expect.objectContaining({
          contactId: 'test-contact-id',
          email: 'test@example.com',
          displayName: 'Test User'
        })
      )
    })

    test('Should store access token in session', async () => {
      await authController.callback.handler(mockRequest, mockH)

      const sessionData = mockRequest.yar.set.mock.calls[0][1]
      expect(sessionData.accessToken).toBe('test-id-token')
    })

    test('Should store refresh token in session', async () => {
      await authController.callback.handler(mockRequest, mockH)

      const sessionData = mockRequest.yar.set.mock.calls[0][1]
      expect(sessionData.refreshToken).toBe('test-refresh-token')
    })

    test('Should calculate expiry time', async () => {
      const beforeTime = Date.now()
      await authController.callback.handler(mockRequest, mockH)
      const afterTime = Date.now()

      const sessionData = mockRequest.yar.set.mock.calls[0][1]
      const expiryTime = new Date(sessionData.expiresAt).getTime()

      // Should be approximately now + 3600 seconds
      expect(expiryTime).toBeGreaterThan(beforeTime + 3600 * 1000 - 1000)
      expect(expiryTime).toBeLessThan(afterTime + 3600 * 1000 + 1000)
    })

    test('Should store DEFRA-specific claims', async () => {
      await authController.callback.handler(mockRequest, mockH)

      const sessionData = mockRequest.yar.set.mock.calls[0][1]
      expect(sessionData.roles).toEqual(['user'])
      expect(sessionData.relationships).toEqual([])
      expect(sessionData.aal).toBe('aal2')
      expect(sessionData.loa).toBe('2')
    })

    test('Should redirect to homepage after creating session', async () => {
      const result = await authController.callback.handler(mockRequest, mockH)

      expect(mockH.redirect).toHaveBeenCalledWith('/')
      expect(result).toBe('/')
    })

    test('Should use email as displayName if given_name not present', async () => {
      const jwt = await import('@hapi/jwt')
      jwt.default.token.decode.mockReturnValueOnce({
        decoded: {
          payload: {
            contactId: 'test-contact-id',
            email: 'test@example.com',
            // No given_name
            relationships: [],
            roles: []
          }
        }
      })

      await authController.callback.handler(mockRequest, mockH)

      const sessionData = mockRequest.yar.set.mock.calls[0][1]
      expect(sessionData.displayName).toBe('test@example.com')
    })
  })

  describe('logout', () => {
    test('Should clear auth session', async () => {
      await authController.logout.handler(mockRequest, mockH)

      expect(mockRequest.yar.clear).toHaveBeenCalledWith('auth')
    })

    test('Should redirect to DEFRA ID logout endpoint', async () => {
      await authController.logout.handler(mockRequest, mockH)

      expect(mockH.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/logout')
      )
    })

    test('Should include post-logout redirect URI', async () => {
      await authController.logout.handler(mockRequest, mockH)

      const redirectUrl = mockH.redirect.mock.calls[0][0]
      expect(redirectUrl).toContain('post_logout_redirect_uri=')
      // URI is encoded, so check for encoded version
      expect(redirectUrl).toContain('http%3A%2F%2Flocalhost')
    })

    test('Should encode post-logout URI', async () => {
      await authController.logout.handler(mockRequest, mockH)

      const redirectUrl = mockH.redirect.mock.calls[0][0]
      expect(redirectUrl).toContain('post_logout_redirect_uri=http%3A%2F%2F')
    })
  })
})
