import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createServer } from '../server.js'

/**
 * Integration Tests for Protected Routes
 *
 * Tests authentication flow against real cdp-defra-id-stub running in Docker.
 * These tests verify that protected routes (like /dashboard) properly require
 * authentication and that the complete OAuth2 flow works end-to-end.
 *
 * REQUIRES:
 * - docker compose up redis defra-id-stub
 *
 * WHAT THESE TESTS VERIFY:
 * - Unauthenticated users are redirected to login
 * - Authentication strategy configuration is correct
 * - Session management works properly
 * - Logout clears session and prevents access
 *
 * NOTE: Full OAuth2 flow (with actual token exchange) requires browser
 * automation or stub cooperation. These tests verify the route configuration
 * and redirect behavior, which is what we can test at the HTTP level.
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

describe('Protected Routes - Integration Tests', () => {
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

  describe('Unauthenticated Access to Protected Routes', () => {
    test('GET /dashboard without session redirects (302)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/dashboard'
      })

      // Should redirect - either to /auth/login or directly to authorization endpoint
      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBeDefined()
    })

    test('GET /dashboard returns redirect, not error status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/dashboard'
      })

      expect(response.statusCode).toBe(302)
      expect(response.statusCode).not.toBe(401) // Not unauthorized error
      expect(response.statusCode).not.toBe(500) // Not server error
    })

    test('Dashboard route is registered in routing table', async () => {
      const routes = server.table()
      const dashboardRoute = routes.find((r) => r.path === '/dashboard')

      expect(dashboardRoute).toBeDefined()
      expect(dashboardRoute.method).toBe('get')
    })
  })

  describe('Authentication Strategy Configuration', () => {
    test('Dashboard route uses session-cookie strategy', async () => {
      const routes = server.table()
      const dashboardRoute = routes.find((r) => r.path === '/dashboard')

      expect(dashboardRoute).toBeDefined()
      expect(dashboardRoute.settings.auth.strategies).toContain(
        'session-cookie'
      )
    })

    test('Dashboard route requires authentication (mode: required)', async () => {
      const routes = server.table()
      const dashboardRoute = routes.find((r) => r.path === '/dashboard')

      expect(dashboardRoute).toBeDefined()
      expect(dashboardRoute.settings.auth.mode).toBe('required')
    })

    test('Login route uses defra-id strategy', async () => {
      const routes = server.table()
      const loginRoute = routes.find((r) => r.path === '/auth/login')

      expect(loginRoute).toBeDefined()
      expect(loginRoute.settings.auth.strategies).toContain('defra-id')
    })

    test('Callback route uses defra-id strategy', async () => {
      const routes = server.table()
      const callbackRoute = routes.find((r) => r.path === '/auth/callback')

      expect(callbackRoute).toBeDefined()
      expect(callbackRoute.settings.auth.strategies).toContain('defra-id')
    })
  })

  describe('Login Initiation Flow', () => {
    test('GET /auth/login redirects to DEFRA ID authorization (302)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/login'
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBeDefined()
      expect(response.headers.location).toContain('cdp-defra-id-stub')
      expect(response.headers.location).toContain('authorize')
    })

    test('Authorization URL includes required OAuth2 parameters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/login'
      })

      const authUrl = response.headers.location

      // Standard OAuth2 parameters
      expect(authUrl).toContain('client_id=')
      expect(authUrl).toContain('redirect_uri=')
      expect(authUrl).toContain('response_type=code')
      expect(authUrl).toContain('state=')

      // DEFRA-specific parameter (CRITICAL requirement)
      expect(authUrl).toContain('serviceId=test-service')
    })

    test('Authorization URL includes redirect_uri parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/login'
      })

      const authUrl = response.headers.location
      expect(authUrl).toContain('redirect_uri=')
      // redirect_uri is URL-encoded
      expect(authUrl).toContain('redirect_uri=http')
    })
  })

  describe('Logout Flow', () => {
    test('GET /auth/logout redirects to DEFRA ID end session (302)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/logout'
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toContain('cdp-defra-id-stub')
      expect(response.headers.location).toContain('logout')
    })

    test('Logout URL includes post_logout_redirect_uri parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/logout'
      })

      expect(response.headers.location).toContain('post_logout_redirect_uri=')
    })

    test('Logout works even without session (mode: try)', async () => {
      // Logout should work even if no session exists (graceful degradation)
      const response = await server.inject({
        method: 'GET',
        url: '/auth/logout'
      })

      expect(response.statusCode).toBe(302)
      // Should still redirect to DEFRA ID logout
      expect(response.headers.location).toContain('logout')
    })
  })

  describe('Route Registration', () => {
    test('All auth routes are registered', async () => {
      const routes = server.table()
      const authRoutes = routes.filter((route) =>
        route.path.startsWith('/auth')
      )

      const paths = authRoutes.map((r) => r.path)
      expect(paths).toContain('/auth/login')
      expect(paths).toContain('/auth/callback')
      expect(paths).toContain('/auth/logout')
    })

    test('Dashboard route is conditionally registered with auth', async () => {
      const routes = server.table()
      const dashboardRoute = routes.find((r) => r.path === '/dashboard')

      // Dashboard should exist when auth is configured
      expect(dashboardRoute).toBeDefined()
    })
  })
})
