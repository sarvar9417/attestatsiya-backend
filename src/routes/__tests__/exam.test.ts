import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { examRoutes } from '../exam.js'
import { sendError, AppError } from '../../lib/errors.js'

// vi.mock factories are hoisted — use vi.hoisted() for shared mock variables
const { mockSupabaseFrom } = vi.hoisted(() => ({
  mockSupabaseFrom: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockSupabaseFrom,
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@test.com' } },
        error: null,
      }),
    },
  })),
}))

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

// Replicate the global error handler from src/index.ts so route errors
// (AppError, ZodError) get formatted the same way.
function setupGlobalErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler((error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
    const err = error as Record<string, unknown>

    // Fastify validation errors
    if (err.validation && Array.isArray(err.validation)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'So\'rov ma\'lumotlari noto\'g\'ri',
          details: err.validation.map((v: Record<string, unknown>) => ({
            field: v.instancePath as string,
            message: v.message as string,
          })),
        },
      })
    }

    // Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'So\'rov ma\'lumotlari noto\'g\'ri',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      })
    }

    sendError(reply, error)
  })
}

describe('Exam Routes', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify({ logger: false })
    setupGlobalErrorHandler(app)
    await app.register(examRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('POST /api/exam/start returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/exam/start',
      payload: { kind: 'mock' },
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('TOKEN_REQUIRED')
  })

  it('POST /api/exam/start returns 400 for invalid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/exam/start',
      headers: { authorization: 'Bearer token-abc' },
      payload: { kind: 'invalid_kind' },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/exam/submit returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/exam/submit',
      payload: {
        exam_id: '550e8400-e29b-41d4-a716-446655440000',
        question_id: '550e8400-e29b-41d4-a716-446655440001',
        answer: { selected: 'A' },
      },
    })

    expect(response.statusCode).toBe(401)
  })

  it('POST /api/exam/submit returns 400 for non-UUID exam_id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/exam/submit',
      headers: { authorization: 'Bearer token-abc' },
      payload: {
        exam_id: 'not-a-uuid',
        question_id: '550e8400-e29b-41d4-a716-446655440001',
        answer: { selected: 'A' },
      },
    })

    expect(response.statusCode).toBe(400)
  })

  it('POST /api/exam/finish returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/exam/finish',
      payload: { exam_id: '550e8400-e29b-41d4-a716-446655440000' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('GET /api/exam/:id/review returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/exam/550e8400-e29b-41d4-a716-446655440000/review',
    })

    expect(response.statusCode).toBe(401)
  })

  it('GET /api/exam/due-reviews returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/exam/due-reviews',
    })

    expect(response.statusCode).toBe(401)
  })
})
