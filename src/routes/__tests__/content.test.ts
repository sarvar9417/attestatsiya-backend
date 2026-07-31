import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { contentRoutes } from '../content.js'
import { sendError, AppError } from '../../lib/errors.js'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
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

    // AppError
    if (error instanceof AppError) {
      return sendError(reply, error)
    }

    // Unknown error
    console.error('[ERROR]', error)
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Serverda kutilmagan xato yuz berdi',
      },
    })
  })
}

interface QueryNode {
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  then: (onFulfilled: (v: { data: unknown[] | null }) => unknown) => unknown
}

const MODULE_ROW = {
  id: 'uuid-m01',
  code: 'M01',
  title_uz: 'Axborot va raqamli savodxonlik',
  summary_uz: 'Rasmiy izoh',
  order_idx: 1,
  exam_section: 'specialty',
  status: 'published',
  exam_question_count: 3,
}

/**
 * supabase query zanjirini taqlid qiladi: select -> eq/order -> await.
 * Har bir node thenable (await ishlaydi), qo'shimcha eq/order chaqiriladi.
 */
function buildModulesQuery(data: unknown[] | null) {
  const eqMocks: ReturnType<typeof vi.fn>[] = []
  const orderMocks: ReturnType<typeof vi.fn>[] = []
  const makeNode = (): QueryNode => {
    const node: QueryNode = {
      eq: vi.fn(() => makeNode()),
      order: vi.fn(() => makeNode()),
      in: vi.fn(() => makeNode()),
      then: (onFulfilled) => onFulfilled({ data }),
    }
    eqMocks.push(node.eq)
    orderMocks.push(node.order)
    return node
  }
  const first = makeNode()
  const select = vi.fn(() => first)
  return { select, eqMocks, orderMocks }
}

/** lessons so'rovi: select(...).eq('status','published') -> { data } */
function buildLessonsQuery(rows: unknown[] | null) {
  const select = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ data: rows })),
  }))
  return { select }
}

describe('GET /api/content/modules', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    app = Fastify({ logger: false })
    await app.register(contentRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('published modullarni exam_question_count va lesson_count bilan qaytaradi', async () => {
    const modulesQuery = buildModulesQuery([MODULE_ROW])
    mockFrom.mockReturnValueOnce({ select: modulesQuery.select })
    mockFrom.mockReturnValueOnce({ select: buildLessonsQuery([{ module_id: 'uuid-m01' }]).select })

    const response = await app.inject({ method: 'GET', url: '/api/content/modules' })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      code: 'M01',
      exam_question_count: 3,
      lesson_count: 1,
    })
    expect(modulesQuery.select).toHaveBeenCalledWith(expect.stringContaining('exam_question_count'))
  })

  it('status va section filtrlari qo\'llanadi', async () => {
    const modulesQuery = buildModulesQuery([MODULE_ROW])
    mockFrom.mockReturnValueOnce({ select: modulesQuery.select })
    mockFrom.mockReturnValueOnce({ select: buildLessonsQuery([]).select })

    await app.inject({
      method: 'GET',
      url: '/api/content/modules?section=specialty&status=published',
    })

    expect(modulesQuery.eqMocks.some(eq => eq.mock.calls.some(([k, v]) => k === 'status' && v === 'published'))).toBe(true)
    expect(modulesQuery.eqMocks.some(eq => eq.mock.calls.some(([k, v]) => k === 'exam_section' && v === 'specialty'))).toBe(true)
  })

  it('lesson bo\'lmagan modulda lesson_count=0 qaytaradi', async () => {
    const modulesQuery = buildModulesQuery([MODULE_ROW])
    mockFrom.mockReturnValueOnce({ select: modulesQuery.select })
    mockFrom.mockReturnValueOnce({ select: buildLessonsQuery(null).select })

    const response = await app.inject({ method: 'GET', url: '/api/content/modules' })

    const body = JSON.parse(response.body)
    expect(body[0].lesson_count).toBe(0)
  })

  it('modullar bo\'lmasa bo\'sh massiv qaytaradi', async () => {
    const modulesQuery = buildModulesQuery(null)
    mockFrom.mockReturnValueOnce({ select: modulesQuery.select })
    mockFrom.mockReturnValueOnce({ select: buildLessonsQuery([]).select })

    const response = await app.inject({ method: 'GET', url: '/api/content/modules' })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([])
  })
})

describe('GET /api/content/lessons/:id/questions', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    app = Fastify({ logger: false })
    setupGlobalErrorHandler(app)
    await app.register(contentRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('lesson savollarini kalitsiz qaytaradi (question_keys API javobida yo\'q)', async () => {
    const lessonUuid = '11111111-1111-4111-8111-111111111111'
    // questions (published, source_lesson_id)
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [
                {
                  id: 'q-1',
                  group_code: 'S1.INFO',
                  format: 'Y1',
                  cognitive: 'bilish',
                  difficulty: 3,
                  stem_md: 'Informatika ta\'rifi?',
                },
              ],
              error: null,
            })),
          })),
        })),
      })),
    })
    // question_options
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [
              { id: 'opt-1', question_id: 'q-1', content_md: 'Javob A', order_idx: 0 },
              { id: 'opt-2', question_id: 'q-1', content_md: 'Javob B', order_idx: 1 },
            ],
            error: null,
          })),
        })),
      })),
    })

    const response = await app.inject({ method: 'GET', url: `/api/content/lessons/${lessonUuid}/questions` })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('q-1')
    expect(body[0].options).toHaveLength(2)
    expect(body[0].options[0].content_md).toBe('Javob A')
    // Kalit hech qachon javobda bo'lmasligi kerak
    expect(JSON.stringify(body)).not.toContain('correct_option_id')
    expect(JSON.stringify(body)).not.toContain('explanation')
  })

  it('dars topilmasa 404 qaytaradi', async () => {
    // resolveLessonUuid: uchala strategiya ham null qaytaradi
    const chain = {
      eq: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockFrom.mockReturnValue({ select: vi.fn(() => chain) })

    const response = await app.inject({ method: 'GET', url: '/api/content/lessons/M01.99/questions' })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('savollar bo\'lmasa bo\'sh massiv qaytaradi', async () => {
    const lessonUuid = '22222222-2222-4222-8222-222222222222'
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })

    const response = await app.inject({ method: 'GET', url: `/api/content/lessons/${lessonUuid}/questions` })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([])
  })
})

describe('POST /api/content/questions/check', () => {
  let app: ReturnType<typeof Fastify>

  const QUESTION_UUID = '11111111-1111-4111-8111-111111111111'
  const OPTION_UUID = '22222222-2222-4222-8222-222222222222'
  const WRONG_OPTION_UUID = '33333333-3333-4333-8333-333333333333'

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    app = Fastify({ logger: false })
    setupGlobalErrorHandler(app)
    await app.register(contentRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function mockQuestionExists(exists: boolean) {
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: exists ? { id: QUESTION_UUID } : null, error: null }),
          })),
        })),
      })),
    })
  }

  function mockOptionExists(exists: boolean, id = OPTION_UUID) {
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: exists ? { id, question_id: QUESTION_UUID } : null,
              error: null,
            }),
          })),
        })),
      })),
    })
  }

  function mockKey(correctOptionId: string, explanation: string) {
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { payload: { correct_option_id: correctOptionId }, explanation_md: explanation },
            error: null,
          }),
        })),
      })),
    })
  }

  it('to\'g\'ri javob: correct=true va izoh qaytaradi', async () => {
    mockQuestionExists(true)
    mockOptionExists(true, OPTION_UUID)
    mockKey(OPTION_UUID, 'Bu to\'g\'ri izoh')

    const response = await app.inject({
      method: 'POST',
      url: '/api/content/questions/check',
      payload: { question_id: QUESTION_UUID, option_id: OPTION_UUID },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({
      correct: true,
      correct_option_id: OPTION_UUID,
      explanation_md: 'Bu to\'g\'ri izoh',
    })
  })

  it('noto\'g\'ri javob: correct=false', async () => {
    mockQuestionExists(true)
    mockOptionExists(true, OPTION_UUID)
    mockKey(OPTION_UUID, 'izoh')

    const response = await app.inject({
      method: 'POST',
      url: '/api/content/questions/check',
      payload: { question_id: QUESTION_UUID, option_id: WRONG_OPTION_UUID },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.correct).toBe(false)
    expect(body.correct_option_id).toBe(OPTION_UUID)
  })

  it('savol topilmasa 404 qaytaradi', async () => {
    mockQuestionExists(false)

    const response = await app.inject({
      method: 'POST',
      url: '/api/content/questions/check',
      payload: { question_id: QUESTION_UUID, option_id: OPTION_UUID },
    })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('option savolga tegishli bo\'lmasa 400 qaytaradi', async () => {
    mockQuestionExists(true)
    mockOptionExists(false)

    const response = await app.inject({
      method: 'POST',
      url: '/api/content/questions/check',
      payload: { question_id: QUESTION_UUID, option_id: OPTION_UUID },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error.code).toBe('INVALID_OPTION')
  })

  it('noto\'g\'ri formatdagi id 400 qaytaradi (validation)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/content/questions/check',
      payload: { question_id: 'not-a-uuid', option_id: OPTION_UUID },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR')
  })
})
