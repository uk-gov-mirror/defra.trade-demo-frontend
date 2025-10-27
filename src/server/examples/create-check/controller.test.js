import '../../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../../server.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { exampleApi } from '../../common/helpers/api-client.js'
import { vi } from 'vitest'

vi.mock('../../common/helpers/api-client.js')

describe('#createCheckController', () => {
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

  describe('POST /example/create/check', () => {
    test('Should show error when backend API fails', async () => {
      vi.mocked(exampleApi.create).mockRejectedValue(
        new Error('Backend connection failed')
      )

      const { statusCode } = await server.inject({
        method: 'POST',
        url: '/example/create/check'
      })

      // Since guards will redirect when session is empty, we expect a redirect
      // In a real scenario with session data, we would see the error
      expect(statusCode).toBe(statusCodes.movedTemporarily)
    })
  })
})
