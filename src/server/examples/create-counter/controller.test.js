import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'

describe('#createCounterController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  describe('GET /example/create/counter', () => {
    test('Should redirect to name page if name not in session (guard pattern)', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/example/create/counter'
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/example/create/name')
    })
  })

  describe('POST /example/create/counter', () => {
    test('Should redirect to name page if required session data missing (guard pattern)', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'POST',
        url: '/example/create/counter',
        payload: {
          counter: '42'
        }
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/example/create/name')
    })
  })
})
