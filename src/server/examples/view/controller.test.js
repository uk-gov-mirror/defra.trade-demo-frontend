import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { exampleApi } from '../../common/helpers/api-client.js'
import { vi } from 'vitest'

vi.mock('../../common/helpers/api-client.js')

describe('#viewController', () => {
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

  describe('GET /example/{id}', () => {
    test('Should display example details', async () => {
      const mockExample = {
        id: '123',
        name: 'Test Example',
        value: 'Test Value',
        counter: 42
      }

      vi.mocked(exampleApi.findById).mockResolvedValue(mockExample)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/123'
      })

      expect(result).toEqual(expect.stringContaining('Test Example'))
      expect(result).toEqual(expect.stringContaining('Test Value'))
      expect(result).toEqual(expect.stringContaining('42'))
      expect(statusCode).toBe(statusCodes.ok)
      expect(exampleApi.findById).toHaveBeenCalledTimes(1)
    })

    test('Should display "Not provided" when counter is null', async () => {
      const mockExample = {
        id: '456',
        name: 'Example Without Counter',
        value: 'Some Value',
        counter: null
      }

      vi.mocked(exampleApi.findById).mockResolvedValue(mockExample)

      const { result } = await server.inject({
        method: 'GET',
        url: '/example/456'
      })

      expect(result).toEqual(expect.stringContaining('Not provided'))
    })

    test('Should show 404 error when example not found', async () => {
      const error = new Error('Not found')
      error.statusCode = 404

      vi.mocked(exampleApi.findById).mockRejectedValue(error)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/999'
      })

      expect(result).toEqual(expect.stringContaining('Example not found'))
      expect(result).toEqual(
        expect.stringContaining(
          'The example you are looking for does not exist'
        )
      )
      expect(statusCode).toBe(statusCodes.notFound)
    })

    test('Should show error message when API fails', async () => {
      vi.mocked(exampleApi.findById).mockRejectedValue(
        new Error('Backend connection failed')
      )

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/example/123'
      })

      expect(result).toEqual(expect.stringContaining('Unable to load example'))
      expect(statusCode).toBe(statusCodes.internalServerError)
    })

    test('Should include edit and delete links', async () => {
      const mockExample = {
        id: '123',
        name: 'Test Example',
        value: 'Test Value',
        counter: 10
      }

      vi.mocked(exampleApi.findById).mockResolvedValue(mockExample)

      const { result } = await server.inject({
        method: 'GET',
        url: '/example/123'
      })

      expect(result).toEqual(expect.stringContaining('/example/123/edit'))
      expect(result).toEqual(expect.stringContaining('/example/123/delete'))
      expect(result).toEqual(expect.stringContaining('Edit example'))
      expect(result).toEqual(expect.stringContaining('Delete example'))
    })
  })
})
