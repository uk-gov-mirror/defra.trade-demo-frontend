import path from 'path'
import hapi from '@hapi/hapi'
import Scooter from '@hapi/scooter'
import Crumb from '@hapi/crumb'

import { router } from './router.js'
import { config } from '../config/config.js'
import { pulse } from './common/helpers/pulse.js'
import { catchAll } from './common/helpers/errors.js'
import { nunjucksConfig } from '../config/nunjucks/nunjucks.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { requestLogger } from './common/helpers/logging/request-logger.js'
import { sessionCache } from './common/helpers/session-cache/session-cache.js'
import { getCacheEngine } from './common/helpers/session-cache/cache-engine.js'
import { secureContext } from '@defra/hapi-secure-context'
import { contentSecurityPolicy } from './common/helpers/content-security-policy.js'
import { setupDefraIdStrategy } from './common/helpers/auth/defra-id-strategy.js'
import { setupSessionStrategy } from './common/helpers/auth/session-strategy.js'

export async function createServer() {
  setupProxy()
  const server = hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    },
    cache: [
      {
        name: config.get('session.cache.name'),
        engine: getCacheEngine(config.get('session.cache.engine'))
      }
    ],
    state: {
      strictHeader: false
    }
  })
  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    {
      plugin: Crumb,
      options: {
        cookieOptions: {
          isSecure: config.get('isProduction'),
          isHttpOnly: true,
          isSameSite: 'Strict'
        },
        skip: (request) => {
          // Skip CSRF in test environment
          if (config.get('isTest')) {
            return true
          }

          // Skip CSRF for health check and static assets
          return (
            request.path.startsWith('/health') ||
            request.path.startsWith('/assets') ||
            request.path.startsWith('/public')
          )
        }
      }
    },
    Scooter,
    contentSecurityPolicy
  ])

  // Setup authentication strategies BEFORE registering routes that use them
  const defraIdConfigured =
    config.get('defraId.oidcDiscoveryUrl') &&
    config.get('defraId.clientId') &&
    config.get('defraId.clientSecret')

  if (defraIdConfigured) {
    await setupDefraIdStrategy(server)
    await setupSessionStrategy(server)
  }

  // Register routes AFTER auth strategies are set up
  await server.register([router])

  server.ext('onPreResponse', catchAll)

  return server
}
