import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createServer } from '../server.js'

/**
 * Integration test for Authentication Flow
 * Tests against real cdp-defra-id-stub running in Docker Compose
 *
 * Requires: docker compose up redis defra-id-stub
 *
 * Note: These tests verify the auth routes and strategies are configured
 * correctly. Full OAuth2 flow testing (with actual redirects) would require
 * browser automation and is better suited for E2E tests.
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

describe('Authentication Flow - Integration Test', () => {
  let server

  beforeAll(async () => {
    // Wait for stub to be ready
    await waitForStub(
      'http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration'
    )

    // Set required environment variables for auth
    process.env.DEFRA_ID_OIDC_DISCOVERY_URL =
      'http://localhost:3200/cdp-defra-id-stub/.well-known/openid-configuration'
    process.env.DEFRA_ID_CLIENT_ID = 'test-client'
    process.env.DEFRA_ID_CLIENT_SECRET = 'test-secret'
    process.env.DEFRA_ID_SERVICE_ID = 'test-service'

    // Create server with auth configured
    server = await createServer()
    await server.initialize()
  }, 60000) // 60 second timeout for Docker image pull

  afterAll(async () => {
    if (server) {
      await server.stop()
    }
    // Clear module cache
    vi.resetModules()
  })

  test('Should have defra-id auth strategy registered', () => {
    // Check that defra-id strategy exists by verifying routes use it
    const routes = server.table()
    const loginRoute = routes.find((r) => r.path === '/auth/login')
    expect(loginRoute).toBeDefined()
    expect(loginRoute.settings.auth.strategies).toContain('defra-id')
  })

  test('Should have session-cookie auth strategy registered', () => {
    // Check that session-cookie strategy exists by verifying routes use it
    const routes = server.table()
    const logoutRoute = routes.find((r) => r.path === '/auth/logout')
    expect(logoutRoute).toBeDefined()
    expect(logoutRoute.settings.auth.strategies).toContain('session-cookie')
  })

  test('GET /auth/login should redirect to DEFRA ID (302)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login'
    })

    // Bell will redirect to DEFRA ID authorization endpoint
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBeDefined()
    // Should redirect to the stub's authorization endpoint
    expect(response.headers.location).toContain('cdp-defra-id-stub')
    expect(response.headers.location).toContain('authorize')
  })

  test('GET /auth/login should include client_id in redirect URL', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login'
    })

    expect(response.headers.location).toContain('client_id=')
  })

  test('GET /auth/login should include serviceId in redirect URL (DEFRA requirement)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login'
    })

    // CRITICAL: serviceId must be in the authorization URL
    expect(response.headers.location).toContain('serviceId=test-service')
  })

  test('GET /auth/login should use OAuth2 authorization code flow', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login'
    })

    // Should use authorization code flow
    expect(response.headers.location).toContain('response_type=code')
    expect(response.headers.location).toContain('redirect_uri=')
    expect(response.headers.location).toContain('state=')
  })

  test('GET /auth/login should support login_hint parameter', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login?login_hint=trader@example.com'
    })

    // Should include login_hint in authorization URL
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toContain(
      'login_hint=trader%40example.com'
    )
  })

  test('GET /auth/login should work without login_hint (backward compatibility)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login'
    })

    // Should work fine without login_hint
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBeDefined()
    // Should still include serviceId (but not login_hint)
    expect(response.headers.location).toContain('serviceId=')
    expect(response.headers.location).not.toContain('login_hint=')
  })

  test('GET /auth/login should handle login_hint with spaces', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login?login_hint=%20%20user@example.com%20%20'
    })

    // Should trim whitespace from login_hint
    expect(response.statusCode).toBe(302)
    // URL encoded "user@example.com" without surrounding spaces
    expect(response.headers.location).toContain('login_hint=user%40example.com')
  })

  test('GET /auth/logout should clear session and redirect to DEFRA ID logout', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/logout'
    })

    // Should redirect to DEFRA ID end_session_endpoint (logout)
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toContain('cdp-defra-id-stub')
    expect(response.headers.location).toContain('logout')
  })

  test('GET /auth/logout should include post_logout_redirect_uri', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/logout'
    })

    expect(response.headers.location).toContain('post_logout_redirect_uri=')
  })

  test('Auth routes should be registered in router', async () => {
    const routes = server.table()
    const authRoutes = routes.filter((route) => route.path.startsWith('/auth'))

    expect(authRoutes.length).toBeGreaterThanOrEqual(3)

    const paths = authRoutes.map((r) => r.path)
    expect(paths).toContain('/auth/login')
    expect(paths).toContain('/auth/callback')
    expect(paths).toContain('/auth/logout')
  })

  test('Auth routes should have correct auth strategies', async () => {
    const routes = server.table()

    const loginRoute = routes.find((r) => r.path === '/auth/login')
    expect(loginRoute.settings.auth.strategies).toContain('defra-id')

    const callbackRoute = routes.find((r) => r.path === '/auth/callback')
    expect(callbackRoute.settings.auth.strategies).toContain('defra-id')

    const logoutRoute = routes.find((r) => r.path === '/auth/logout')
    expect(logoutRoute.settings.auth.strategies).toContain('session-cookie')
  })
})
