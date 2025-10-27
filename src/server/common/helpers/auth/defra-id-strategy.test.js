import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock config
vi.mock('../../../../config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const config = {
        'session.cookie.password': 'test-password-must-be-at-least-32-chars',
        'defraId.clientId': 'test-client-id',
        'defraId.clientSecret': 'test-client-secret',
        'defraId.serviceId': 'test-service-id',
        isProduction: false
      }
      return config[key] || ''
    })
  }
}))

// Mock OIDC discovery
vi.mock('../oidc-discovery.js', () => ({
  getOidcEndpoints: vi.fn(async () => ({
    authorization_endpoint: 'https://example.com/authorize',
    token_endpoint: 'https://example.com/token'
  }))
}))

describe('DEFRA ID Strategy', () => {
  let setupDefraIdStrategy
  let mockServer

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create mock Hapi server
    mockServer = {
      register: vi.fn(),
      auth: {
        strategy: vi.fn()
      }
    }

    const module = await import('./defra-id-strategy.js')
    setupDefraIdStrategy = module.setupDefraIdStrategy
  })

  test('Should register Bell and JWT plugins', async () => {
    await setupDefraIdStrategy(mockServer)

    expect(mockServer.register).toHaveBeenCalledTimes(1)
    expect(mockServer.register).toHaveBeenCalledWith(expect.any(Array))
  })

  test('Should register strategy with correct name', async () => {
    await setupDefraIdStrategy(mockServer)

    expect(mockServer.auth.strategy).toHaveBeenCalledWith(
      'defra-id',
      'bell',
      expect.any(Object)
    )
  })

  test('Should have providerParams as a function', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    expect(typeof strategyConfig.providerParams).toBe('function')
  })

  test('Should include serviceId in providerParams', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const mockRequest = { query: {} }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params).toEqual({
      serviceId: 'test-service-id'
    })
  })

  test('Should include login_hint when provided in query string', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const mockRequest = {
      query: {
        login_hint: 'user@example.com'
      }
    }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params).toEqual({
      serviceId: 'test-service-id',
      login_hint: 'user@example.com'
    })
  })

  test('Should trim login_hint whitespace', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const mockRequest = {
      query: {
        login_hint: '  user@example.com  '
      }
    }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params.login_hint).toBe('user@example.com')
  })

  test('Should omit login_hint when empty after trimming', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const mockRequest = {
      query: {
        login_hint: '   '
      }
    }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params).toEqual({
      serviceId: 'test-service-id'
    })
    expect(params.login_hint).toBeUndefined()
  })

  test('Should omit login_hint when exceeds max length', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const longHint = 'a'.repeat(256) // 256 characters, exceeds 255 limit
    const mockRequest = {
      query: {
        login_hint: longHint
      }
    }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params).toEqual({
      serviceId: 'test-service-id'
    })
    expect(params.login_hint).toBeUndefined()
  })

  test('Should accept login_hint at max length (255 chars)', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const maxLengthHint = 'a'.repeat(255)
    const mockRequest = {
      query: {
        login_hint: maxLengthHint
      }
    }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params.login_hint).toBe(maxLengthHint)
  })

  test('Should handle non-string login_hint gracefully', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    const mockRequest = {
      query: {
        login_hint: 12345 // Number instead of string
      }
    }
    const params = strategyConfig.providerParams(mockRequest)

    expect(params).toEqual({
      serviceId: 'test-service-id',
      login_hint: '12345' // Should be converted to string
    })
  })

  test('Should enable PKCE', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    expect(strategyConfig.config.usePKCE).toBe(true)
  })

  test('Should use OIDC endpoints from discovery', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    expect(strategyConfig.provider.auth).toBe('https://example.com/authorize')
    expect(strategyConfig.provider.token).toBe('https://example.com/token')
  })

  test('Should include required OAuth2 scopes', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    expect(strategyConfig.provider.scope).toEqual([
      'openid',
      'profile',
      'email',
      'offline_access'
    ])
  })

  test('Should use client credentials from config', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    expect(strategyConfig.clientId).toBe('test-client-id')
    expect(strategyConfig.clientSecret).toBe('test-client-secret')
  })

  test('Should set forceHttps based on environment', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    // forceHttps should be false in test environment
    expect(strategyConfig.forceHttps).toBeFalsy()
  })

  test('Should have profile function', async () => {
    await setupDefraIdStrategy(mockServer)

    const strategyConfig = mockServer.auth.strategy.mock.calls[0][2]
    expect(typeof strategyConfig.provider.profile).toBe('function')
  })
})
