import '../common/test-helpers/mock-oidc-discovery.js'
import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'

describe('#startController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response for start page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(result).toEqual(expect.stringContaining('Manage Examples'))
    expect(result).toEqual(expect.stringContaining('Start now'))
    expect(result).toEqual(expect.stringContaining('Java Spring Boot backend'))
    expect(statusCode).toBe(statusCodes.ok)
  })
})
