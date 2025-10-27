import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { exampleApi } from '../../common/helpers/api-client.js'
import { vi } from 'vitest'

vi.mock('../../common/helpers/api-client.js')

describe('#deleteController', () => {
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

  describe('GET /example/{id}/delete', () => {
    test('Should display delete confirmation page', async () => {
      const mockExample = {
        id: '123',
        name: 'Example to Delete',
        value: 'Some Value',
        counter: 42
      }

      vi.mocked(exampleApi.findById).mockResolvedValue(mockExample)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/123/delete'
      })

      expect(result).toEqual(
        expect.stringContaining('Are you sure you want to delete this example?')
      )
      expect(result).toEqual(expect.stringContaining('Example to Delete'))
      expect(result).toEqual(
        expect.stringContaining('Deleting this example cannot be undone')
      )
      expect(result).toEqual(
        expect.stringContaining('Delete example permanently')
      )
      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should redirect to examples when example not found', async () => {
      const error = new Error('Not found')
      error.statusCode = 404

      vi.mocked(exampleApi.findById).mockRejectedValue(error)

      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/example/999/delete'
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/examples')
    })
  })

  describe('POST /example/{id}/delete', () => {
    test('Should delete example and redirect to examples list', async () => {
      vi.mocked(exampleApi.delete).mockResolvedValue(undefined)

      const { statusCode, headers } = await server.inject({
        method: 'POST',
        url: '/example/123/delete'
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/examples')
      expect(exampleApi.delete).toHaveBeenCalledTimes(1)
    })

    test('Should show error when delete fails', async () => {
      vi.mocked(exampleApi.delete).mockRejectedValue(new Error('Backend error'))

      const mockExample = {
        id: '123',
        name: 'Example',
        value: 'Value',
        counter: 10
      }

      vi.mocked(exampleApi.findById).mockResolvedValue(mockExample)

      const { result, statusCode } = await server.inject({
        method: 'POST',
        url: '/example/123/delete'
      })

      expect(result).toEqual(
        expect.stringContaining('Unable to delete example')
      )
      expect(statusCode).toBe(statusCodes.internalServerError)
    })

    test('Should redirect to examples if delete fails and cannot fetch example', async () => {
      vi.mocked(exampleApi.delete).mockRejectedValue(new Error('Backend error'))
      vi.mocked(exampleApi.findById).mockRejectedValue(new Error('Not found'))

      const { statusCode, headers } = await server.inject({
        method: 'POST',
        url: '/example/123/delete'
      })

      expect(statusCode).toBe(statusCodes.movedTemporarily)
      expect(headers.location).toBe('/examples')
    })
  })
})
