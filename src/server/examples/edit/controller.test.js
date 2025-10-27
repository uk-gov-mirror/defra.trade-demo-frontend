import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { exampleApi } from '../../common/helpers/api-client.js'
import { vi } from 'vitest'

vi.mock('../../common/helpers/api-client.js')

describe('#editController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /example/{id}/edit', () => {
    test('Should display edit form with pre-filled data', async () => {
      const mockExample = {
        id: '123',
        name: 'Existing Example',
        value: 'Existing Value',
        counter: 42
      }

      vi.mocked(exampleApi.findById).mockResolvedValue(mockExample)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/123/edit'
      })

      expect(result).toEqual(expect.stringContaining('Edit example'))
      expect(result).toEqual(expect.stringContaining('Existing Example'))
      expect(result).toEqual(expect.stringContaining('Existing Value'))
      expect(result).toEqual(expect.stringContaining('42'))
      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should redirect to examples list when example not found', async () => {
      const error = new Error('Not found')
      error.statusCode = 404

      vi.mocked(exampleApi.findById).mockRejectedValue(error)

      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/example/999/edit'
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/examples')
    })
  })

  describe('POST /example/{id}/edit', () => {
    test('Should update example and redirect to view page', async () => {
      vi.mocked(exampleApi.update).mockResolvedValue({
        id: '123',
        name: 'Updated Name',
        value: 'Updated Value',
        counter: 50
      })

      const { statusCode, headers } = await server.inject({
        method: 'POST',
        url: '/example/123/edit',
        payload: {
          name: 'Updated Name',
          value: 'Updated Value',
          counter: '50'
        }
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/example/123')
      expect(exampleApi.update).toHaveBeenCalledTimes(1)
    })

    test('Should handle null counter', async () => {
      vi.mocked(exampleApi.update).mockResolvedValue({
        id: '123',
        name: 'Updated Name',
        value: 'Updated Value',
        counter: null
      })

      const { statusCode } = await server.inject({
        method: 'POST',
        url: '/example/123/edit',
        payload: {
          name: 'Updated Name',
          value: 'Updated Value',
          counter: ''
        }
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(exampleApi.update).toHaveBeenCalledTimes(1)
    })

    test('Should show validation error when name is empty', async () => {
      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/123/edit',
        payload: {
          name: '',
          value: 'Some Value',
          counter: '10'
        }
      })

      expect(result).toEqual(expect.stringContaining('Enter a name'))
      expect(result).toEqual(expect.stringContaining('There is a problem'))
      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should show validation error when value is empty', async () => {
      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/123/edit',
        payload: {
          name: 'Valid Name',
          value: '',
          counter: '10'
        }
      })

      expect(result).toEqual(expect.stringContaining('Enter a value'))
      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should show validation error when counter is invalid', async () => {
      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/123/edit',
        payload: {
          name: 'Valid Name',
          value: 'Valid Value',
          counter: 'not-a-number'
        }
      })

      expect(result).toEqual(
        expect.stringContaining('Counter must be a number')
      )
      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should show error when backend update fails', async () => {
      vi.mocked(exampleApi.update).mockRejectedValue(new Error('Backend error'))

      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/123/edit',
        payload: {
          name: 'Valid Name',
          value: 'Valid Value',
          counter: '10'
        }
      })

      expect(result).toEqual(
        expect.stringContaining('Unable to update example')
      )
      expect(statusCode).toBe(statusCodes.internalServerError)
    })
  })
})
