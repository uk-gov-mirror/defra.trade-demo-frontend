import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'

describe('#createConfirmationController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  describe('GET /example/create/confirmation', () => {
    test('Should display confirmation page with example ID', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/create/confirmation?id=123'
      })

      expect(result).toEqual(expect.stringContaining('Example created'))
      expect(result).toEqual(expect.stringContaining('123'))
      expect(result).toEqual(
        expect.stringContaining('The example has been created successfully')
      )
      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should redirect to examples list if no ID provided', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/example/create/confirmation'
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/examples')
    })

    test('Should include link to examples list', async () => {
      const { result } = await server.inject({
        method: 'GET',
        url: '/example/create/confirmation?id=456'
      })

      expect(result).toEqual(expect.stringContaining('View all examples'))
      expect(result).toEqual(expect.stringContaining('/examples'))
    })
  })
})
