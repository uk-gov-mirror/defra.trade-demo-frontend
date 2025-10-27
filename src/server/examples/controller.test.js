import '../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { exampleApi } from '../common/helpers/api-client.js'
import { vi } from 'vitest'

vi.mock('../common/helpers/api-client.js')

describe('#examplesController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  describe('list', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    test('Should display all examples when no search query', async () => {
      const mockExamples = [
        { id: '1', name: 'Example One', value: 'Value 1', counter: 10 },
        { id: '2', name: 'Example Two', value: 'Value 2', counter: 20 }
      ]

      vi.mocked(exampleApi.findAll).mockResolvedValue(mockExamples)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/examples'
      })

      expect(result).toEqual(expect.stringContaining('All Examples'))
      expect(result).toEqual(expect.stringContaining('Example One'))
      expect(result).toEqual(expect.stringContaining('Example Two'))
      expect(statusCode).toBe(statusCodes.ok)
      expect(exampleApi.findAll).toHaveBeenCalledTimes(1)
    })

    test('Should filter examples by search query', async () => {
      const mockExamples = [
        { id: '1', name: 'Example One', value: 'Value 1', counter: 10 },
        { id: '2', name: 'Another Example', value: 'Value 2', counter: 20 }
      ]

      vi.mocked(exampleApi.findAll).mockResolvedValue(mockExamples)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/examples?search=Another'
      })

      expect(result).toEqual(expect.stringContaining('All Examples'))
      expect(result).toEqual(expect.stringContaining('Another Example'))
      expect(result).not.toEqual(expect.stringContaining('Example One'))
      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should display no results message when search returns empty', async () => {
      const mockExamples = [
        { id: '1', name: 'Example One', value: 'Value 1', counter: 10 }
      ]

      vi.mocked(exampleApi.findAll).mockResolvedValue(mockExamples)

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/examples?search=NonExistent'
      })

      expect(result).toEqual(expect.stringContaining('No examples found'))
      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should handle backend API error gracefully', async () => {
      vi.mocked(exampleApi.findAll).mockRejectedValue(
        new Error('Backend connection failed')
      )

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/examples'
      })

      expect(result).toEqual(expect.stringContaining('Unable to load examples'))
      expect(statusCode).toBe(statusCodes.internalServerError)
    })

    test('Should display message when no examples exist', async () => {
      vi.mocked(exampleApi.findAll).mockResolvedValue([])

      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/examples'
      })

      expect(result).toEqual(expect.stringContaining('No examples found'))
      expect(statusCode).toBe(statusCodes.ok)
    })
  })
})
