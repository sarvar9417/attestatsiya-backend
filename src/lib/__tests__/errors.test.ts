import { describe, it, expect, vi } from 'vitest'
import { AppError, NotFoundError, AuthError, ForbiddenError, sendError } from '../errors.js'
import type { FastifyReply } from 'fastify'

describe('AppError', () => {
  it('creates error with default status 400 and code BAD_REQUEST', () => {
    const err = new AppError('Xatolik yuz berdi')
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toBe('Xatolik yuz berdi')
    expect(err.name).toBe('AppError')
  })

  it('creates error with custom status code and code', () => {
    const err = new AppError('Topilmadi', 404, 'NOT_FOUND')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })

  it('captures stack trace', () => {
    const err = new AppError('Stack test')
    expect(err.stack).toBeDefined()
  })
})

describe('NotFoundError', () => {
  it('extends AppError with 404 and NOT_FOUND', () => {
    const err = new NotFoundError()
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Resurs topilmadi')
    expect(err.name).toBe('NotFoundError')
  })

  it('accepts custom message', () => {
    const err = new NotFoundError('Maxsus xabar')
    expect(err.message).toBe('Maxsus xabar')
  })
})

describe('AuthError', () => {
  it('extends AppError with 401 and UNAUTHORIZED', () => {
    const err = new AuthError()
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.message).toBe('Avtorizatsiyadan o\'tmagansiz')
    expect(err.name).toBe('AuthError')
  })

  it('accepts custom message', () => {
    const err = new AuthError('Token eskirgan')
    expect(err.message).toBe('Token eskirgan')
  })
})

describe('ForbiddenError', () => {
  it('extends AppError with 403 and FORBIDDEN', () => {
    const err = new ForbiddenError()
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
    expect(err.message).toBe('Ruxsat yo\'q')
    expect(err.name).toBe('ForbiddenError')
  })
})

describe('sendError', () => {
  function createMockReply() {
    return {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply
  }

  it('sends AppError with correct status code and error body', () => {
    const reply = createMockReply()
    const err = new AppError('Xatolik', 422, 'CUSTOM_CODE')

    sendError(reply, err)

    expect(reply.status).toHaveBeenCalledWith(422)
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'CUSTOM_CODE', message: 'Xatolik' },
    })
  })

  it('sends NotFoundError with 404', () => {
    const reply = createMockReply()
    const err = new NotFoundError()

    sendError(reply, err)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Resurs topilmadi' },
    })
  })

  it('handles Fastify validation error objects', () => {
    const reply = createMockReply()
    const validationError = {
      validation: [
        { instancePath: '/kind', message: 'must be a valid enum value' },
      ],
    }

    sendError(reply, validationError)

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'So\'rov ma\'lumotlari noto\'g\'ri',
        details: validationError.validation,
      },
    })
  })

  it('handles unknown errors with 500', () => {
    const reply = createMockReply()
    const unknown = new Error('Something unexpected')

    sendError(reply, unknown)

    expect(reply.status).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Serverda kutilmagan xato yuz berdi',
      },
    })
  })

  it('handles non-Error unknown values', () => {
    const reply = createMockReply()

    sendError(reply, 'raw string error')

    expect(reply.status).toHaveBeenCalledWith(500)
  })
})
