import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { adminRoutes } from '../admin.js'
import { sendError, AppError } from '../../lib/errors.js'

const { mockFrom, mockGetUser, mockGetUserById } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetUserById: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: vi.fn(),
    auth: { getUser: mockGetUser, admin: { getUserById: mockGetUserById } },
  })),
}))

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

function setupGlobalErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler((error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
    const err = error as Record<string, unknown>

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

    if (error instanceof AppError) {
      return sendError(reply, error)
    }

    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Serverda xatolik yuz berdi' },
    })
  })
}

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LESSON_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const EXAM_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TOKEN = 'admin-token'

/** getUser + profiles.role tekshiruvini mock qiladi. */
function mockAdminAuth(role: string | null = 'admin') {
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })
  mockFrom.mockReturnValueOnce({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null }),
      })),
    })),
  })
}

const EXAM_ROW = {
  id: EXAM_UUID,
  user_id: USER_ID,
  kind: 'mavzu',
  lesson_id: LESSON_UUID,
  started_at: '2026-07-31T09:20:00Z',
  finished_at: '2026-07-31T09:25:00Z',
  total_score: 12,
  max_score: 40,
  passed: false,
  breakdown: [{ jami: 20, togri: 6, group_code: 'S1.INFO' }],
}

describe('GET /api/admin/attempts', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    mockGetUser.mockReset()
    mockGetUserById.mockReset()
    app = Fastify({ logger: false })
    setupGlobalErrorHandler(app)
  })

  afterEach(async () => {
    await app.close()
  })

  it('token bo\'lmasa 401 qaytaradi', async () => {
    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/admin/attempts' })
    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body).error.code).toBe('TOKEN_REQUIRED')
  })

  it('admin bo\'lmagan foydalanuvchi uchun 403 qaytaradi', async () => {
    mockAdminAuth('user')
    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/attempts',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.body).error.code).toBe('FORBIDDEN')
  })

  it('profil topilmasa ham 403 qaytaradi', async () => {
    mockAdminAuth(null)
    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/attempts',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(response.statusCode).toBe(403)
  })

  it('urinishlar ro\'yxatini javob va answered_count bilan qaytaradi', async () => {
    mockAdminAuth('admin')
    // exams (filtersiz: select -> order -> range)
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          range: vi.fn(() =>
            Promise.resolve({ data: [EXAM_ROW], count: 1, error: null })
          ),
        })),
      })),
    })
    // lessons
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({ data: [{ id: LESSON_UUID, slug: 'm01-02', title_uz: 'M01.02' }], error: null })
        ),
      })),
    })
    // exam_items
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          not: vi.fn(() =>
            Promise.resolve({
              data: [
                { exam_id: EXAM_UUID, id: 'item-1' },
                { exam_id: EXAM_UUID, id: 'item-2' },
              ],
              error: null,
            })
          ),
        })),
      })),
    })
    // profiles
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({ data: [{ id: USER_ID, display_name: 'Test Foydalanuvchi' }], error: null })
        ),
      })),
    })
    // emails
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@test.dev' } },
      error: null,
    })

    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/attempts',
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.total).toBe(1)
    expect(body.page).toBe(1)
    expect(body.page_size).toBe(20)
    expect(body.items).toHaveLength(1)
    const item = body.items[0]
    expect(item.exam_id).toBe(EXAM_UUID)
    expect(item.email).toBe('user@test.dev')
    expect(item.display_name).toBe('Test Foydalanuvchi')
    expect(item.lesson_slug).toBe('m01-02')
    expect(item.answered_count).toBe(2)
    expect(item.total_score).toBe(12)
  })

  it('lesson_id kod orqali berilsa UUID ga resolve qilinib filtrlanadi', async () => {
    mockAdminAuth('admin')
    // resolveLessonUuid: lessons bo'yicha qidiruv
    const resolveChain = {
      eq: vi.fn(() => resolveChain),
      ilike: vi.fn(() => resolveChain),
      limit: vi.fn(() => resolveChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: LESSON_UUID }, error: null }),
    }
    mockFrom.mockReturnValueOnce({ select: vi.fn(() => resolveChain) })
    // exams — eq('lesson_id') chaqirilganini tekshiramiz
    const examsChain = {
      eq: vi.fn(() => examsChain),
      order: vi.fn(() => ({
        range: vi.fn(() => Promise.resolve({ data: [], count: 0, error: null })),
      })),
    }
    mockFrom.mockReturnValueOnce({ select: vi.fn(() => examsChain) })

    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/attempts?lesson_id=M01.02`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    expect(examsChain.eq).toHaveBeenCalledWith('lesson_id', LESSON_UUID)
  })

  it('noto\'g\'ri filter parametri 400 qaytaradi', async () => {
    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/attempts?page=0&page_size=500',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/admin/attempts/:id', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    mockGetUser.mockReset()
    mockGetUserById.mockReset()
    app = Fastify({ logger: false })
    setupGlobalErrorHandler(app)
    mockAdminAuth('admin')
  })

  afterEach(async () => {
    await app.close()
  })

  it('topilmagan sinov uchun 404 qaytaradi', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })
    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/attempts/${EXAM_UUID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('to\'liq detalni qaytaradi: variant tartibi, to\'g\'ri javob va izoh', async () => {
    const QUESTION_UUID = '11111111-1111-4111-8111-111111111111'
    const OPT_A = '22222222-2222-4222-8222-222222222222'
    const OPT_B = '33333333-3333-4333-8333-333333333333'
    const OPT_C = '44444444-4444-4444-8444-444444444444'
    const OPT_D = '55555555-5555-4555-8555-555555555555'
    const itemRow = {
      id: 'item-1',
      exam_id: EXAM_UUID,
      question_id: QUESTION_UUID,
      order_idx: 1,
      user_answer: { option_id: OPT_B },
      is_correct: false,
      score: 0,
      time_spent_sec: 12,
      flagged: false,
      answered_at: '2026-07-31T09:21:00Z',
      option_order: [OPT_A, OPT_D, OPT_C, OPT_B],
    }

    // exams
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: EXAM_ROW, error: null }),
        })),
      })),
    })
    // lessons
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { slug: 'm01-02' }, error: null }),
        })),
      })),
    })
    // profiles
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { display_name: 'Test Foydalanuvchi' }, error: null }),
        })),
      })),
    })
    // exam_items
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [itemRow], error: null })),
        })),
      })),
    })
    // email
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'user@test.dev' } },
      error: null,
    })
    // questions
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({
            data: [{ id: QUESTION_UUID, group_code: 'S1.INFO', format: 'Y1', stem_md: 'Savol matni?' }],
            error: null,
          })
        ),
      })),
    })
    // question_options (natural tartib: A,B,C,D)
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({
            data: [
              { id: OPT_A, question_id: QUESTION_UUID, side: null, content_md: 'Javob A', order_idx: 0 },
              { id: OPT_B, question_id: QUESTION_UUID, side: null, content_md: 'Javob B', order_idx: 1 },
              { id: OPT_C, question_id: QUESTION_UUID, side: null, content_md: 'Javob C', order_idx: 2 },
              { id: OPT_D, question_id: QUESTION_UUID, side: null, content_md: 'Javob D', order_idx: 3 },
            ],
            error: null,
          })
        ),
      })),
    })
    // question_keys
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                question_id: QUESTION_UUID,
                payload: { correct_option_id: OPT_C },
                explanation_md: 'Chunki C to\'g\'ri',
              },
            ],
            error: null,
          })
        ),
      })),
    })

    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/attempts/${EXAM_UUID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.lesson_slug).toBe('m01-02')
    expect(body.email).toBe('user@test.dev')
    expect(body.items).toHaveLength(1)
    const item = body.items[0]
    // variantlar option_order bo'yicha: A, D, C, B
    expect(item.options.map((o: { id: string }) => o.id)).toEqual([OPT_A, OPT_D, OPT_C, OPT_B])
    expect(item.user_answer).toEqual({ option_id: OPT_B })
    expect(item.is_correct).toBe(false)
    expect(item.correct_option_id).toBe(OPT_C)
    expect(item.explanation_md).toBe('Chunki C to\'g\'ri')
    expect(item.stem_md).toBe('Savol matni?')
    // Kalitlar hech qachon talabaga chiqmaydi — lekin admin detali uchun javobda bo'ladi
    expect(JSON.stringify(body)).toContain('correct_option_id')
  })

  it('option_order bo\'lmagan eski urinishda variantlar natural tartibda keladi', async () => {
    const QUESTION_UUID = '11111111-1111-4111-8111-111111111111'
    const OPT_A = '22222222-2222-4222-8222-222222222222'
    const OPT_B = '33333333-3333-4333-8333-333333333333'
    const itemRow = {
      id: 'item-1',
      exam_id: EXAM_UUID,
      question_id: QUESTION_UUID,
      order_idx: 1,
      user_answer: null,
      is_correct: null,
      score: 0,
      time_spent_sec: null,
      flagged: false,
      answered_at: null,
      option_order: null,
    }

    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: EXAM_ROW, error: null }),
        })),
      })),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { slug: 'm01-02' }, error: null }),
        })),
      })),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { display_name: null }, error: null }),
        })),
      })),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [itemRow], error: null })),
        })),
      })),
    })
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: null })
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({ data: [{ id: QUESTION_UUID, group_code: null, format: 'Y1', stem_md: '?' }], error: null })
        ),
      })),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({
            data: [
              { id: OPT_A, question_id: QUESTION_UUID, side: null, content_md: 'A', order_idx: 0 },
              { id: OPT_B, question_id: QUESTION_UUID, side: null, content_md: 'B', order_idx: 1 },
            ],
            error: null,
          })
        ),
      })),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({ data: [], error: null })
        ),
      })),
    })

    await app.register(adminRoutes)
    await app.ready()
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/attempts/${EXAM_UUID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.items[0].options.map((o: { id: string }) => o.id)).toEqual([OPT_A, OPT_B])
    expect(body.items[0].correct_option_id).toBeNull()
    expect(body.email).toBeNull()
  })
})
