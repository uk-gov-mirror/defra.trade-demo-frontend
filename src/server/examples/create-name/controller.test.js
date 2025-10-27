import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'

describe('#createNameController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  describe('GET /example/create/name', () => {
    test('Should display name input page', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/create/name'
      })

      expect(result).toEqual(expect.stringContaining('What is the name?'))
      expect(result).toEqual(expect.stringContaining('Enter a unique name'))
      expect(statusCode).toBe(statusCodes.ok)
    })
  })

  describe('POST /example/create/name', () => {
    test('Should store valid name and redirect to value page', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/example/create/name',
        payload: {
          name: 'My Example'
        }
      })

      expect(response.statusCode).toBe(statusCodes.movedTemporarily)
      expect(response.headers.location).toBe('/example/create/value')
    })

    test('Should trim whitespace from name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/example/create/name',
        payload: {
          name: '  Trimmed Example  '
        }
      })

      expect(response.statusCode).toBe(statusCodes.movedTemporarily)
      expect(response.headers.location).toBe('/example/create/value')
    })

    test('Should show error when name is empty', async () => {
      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/create/name',
        payload: {
          name: ''
        }
      })

      expect(result).toEqual(expect.stringContaining('Enter a name'))
      expect(result).toEqual(expect.stringContaining('There is a problem'))
      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should show error when name is only whitespace', async () => {
      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/create/name',
        payload: {
          name: '   '
        }
      })

      expect(result).toEqual(expect.stringContaining('Enter a name'))
      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should show error when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101)

      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/create/name',
        payload: {
          name: longName
        }
      })

      expect(result).toEqual(
        expect.stringContaining('Name must be 100 characters or less')
      )
      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should preserve entered value on validation error', async () => {
      const longName = 'a'.repeat(101)

      const { result } = await server.inject({
        method: 'POST',
        url: '/example/create/name',
        payload: {
          name: longName
        }
      })

      expect(result).toEqual(expect.stringContaining(`value="${longName}"`))
    })
  })
})
