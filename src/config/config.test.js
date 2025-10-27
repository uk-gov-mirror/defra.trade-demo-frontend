import { describe, test, expect } from 'vitest'
import { config } from './config.js'

describe('DEFRA ID Configuration', () => {
  test('Should load DEFRA ID environment variables', () => {
    expect(config.has('defraId.oidcDiscoveryUrl')).toBe(true)
    expect(config.has('defraId.serviceId')).toBe(true)
    expect(config.has('defraId.clientId')).toBe(true)
    expect(config.has('defraId.clientSecret')).toBe(true)
  })

  test('Should mark clientSecret as sensitive', () => {
    const schema = config.getSchema()
    expect(
      schema._cvtProperties.defraId._cvtProperties.clientSecret.sensitive
    ).toBe(true)
  })

  test('Should access DEFRA ID configuration values', () => {
    const oidcDiscoveryUrl = config.get('defraId.oidcDiscoveryUrl')
    const serviceId = config.get('defraId.serviceId')
    const clientId = config.get('defraId.clientId')
    const clientSecret = config.get('defraId.clientSecret')

    expect(typeof oidcDiscoveryUrl).toBe('string')
    expect(typeof serviceId).toBe('string')
    expect(typeof clientId).toBe('string')
    expect(typeof clientSecret).toBe('string')
  })
})
