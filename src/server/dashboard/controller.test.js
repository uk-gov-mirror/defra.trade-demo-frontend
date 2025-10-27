import { describe, expect, test, beforeEach, vi } from 'vitest'
import { dashboardController } from './controller.js'

describe('Dashboard Controller', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    mockRequest = {
      yar: {
        get: vi.fn()
      }
    }
    mockH = {
      view: vi.fn()
    }
  })

  test('Should render dashboard view with user data', () => {
    const authData = {
      displayName: 'Test User',
      email: 'test@example.com',
      contactId: 'test-contact-123'
    }

    mockRequest.yar.get.mockReturnValue(authData)

    dashboardController.handler(mockRequest, mockH)

    expect(mockH.view).toHaveBeenCalledWith(
      'dashboard/index',
      expect.objectContaining({
        pageTitle: 'Dashboard',
        heading: 'Trade Imports Dashboard',
        user: {
          displayName: 'Test User',
          email: 'test@example.com',
          contactId: 'test-contact-123'
        }
      })
    )
  })

  test('Should retrieve auth data from session', () => {
    mockRequest.yar.get.mockReturnValue({
      displayName: 'Test',
      email: 'test@example.com',
      contactId: 'test-123'
    })

    dashboardController.handler(mockRequest, mockH)

    expect(mockRequest.yar.get).toHaveBeenCalledWith('auth', false)
  })

  test('Should show imports link flag', () => {
    mockRequest.yar.get.mockReturnValue({
      displayName: 'Test',
      email: 'test@example.com',
      contactId: 'test-123'
    })

    dashboardController.handler(mockRequest, mockH)

    expect(mockH.view).toHaveBeenCalledWith(
      'dashboard/index',
      expect.objectContaining({
        showImportsLink: true
      })
    )
  })
})
