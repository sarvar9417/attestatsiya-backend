import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted — use vi.hoisted() for shared mock variables
const { mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  })),
}))

// Mock resolveIds to avoid DB calls when resolving module/lesson codes
vi.mock('../../lib/resolveIds.js', () => ({
  resolveModuleUuid: vi.fn((code: string) => {
    if (code === 'M01') return Promise.resolve('module-uuid-01')
    return Promise.resolve(`module-uuid-${code.toLowerCase()}`)
  }),
  resolveLessonUuid: vi.fn((code: string) => {
    if (code === 'M01.01') return Promise.resolve('lesson-uuid-0101')
    return Promise.resolve(`lesson-uuid-${code.toLowerCase().replace('.', '')}`)
  }),
}))

// Set env before config import
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

import { examService } from '../exam.service.js'
import { AppError, NotFoundError } from '../../lib/errors.js'

describe('examService.start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully starts a mock exam', async () => {
    mockRpc.mockResolvedValue({
      data: {
        exam_id: 'exam-123',
        kind: 'mock',
        duration_sec: 7200,
        started_at: new Date().toISOString(),
        items: [],
      },
      error: null,
    })

    const result = await examService.start('mock', 'token-abc')
    expect(result.kind).toBe('mock')
    expect(result.exam_id).toBe('exam-123')
    expect(mockRpc).toHaveBeenCalledWith('start_exam', { p_kind: 'mock' })
  })

  it('throws INSUFFICIENT_POOL when pool is insufficient', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'savol_yetarli_emas' },
    })

    await expect(examService.start('mock', 'token-abc'))
      .rejects.toThrow(AppError)
    await expect(examService.start('mock', 'token-abc'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_POOL', statusCode: 503 })
  })

  it('throws NO_QUESTIONS when no questions for topic', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'savol_yoq' },
    })

    await expect(examService.start('mavzu', 'token-abc', undefined, 'M01.01'))
      .rejects.toMatchObject({ code: 'NO_QUESTIONS', statusCode: 404 })
  })

  it('throws NO_BLUEPRINT when blueprint not found', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'blueprint_topilmadi' },
    })

    await expect(examService.start('mock', 'token-abc'))
      .rejects.toMatchObject({ code: 'NO_BLUEPRINT', statusCode: 503 })
  })

  it('throws AUTH_REQUIRED when auth fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'auth_required' },
    })

    await expect(examService.start('bolim', 'bad-token', 'M01'))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED', statusCode: 401 })
  })

  it('throws generic EXAM_START_ERROR for unknown RPC errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'something_else' },
    })

    await expect(examService.start('mock', 'token-abc'))
      .rejects.toMatchObject({ code: 'EXAM_START_ERROR', statusCode: 500 })
  })
})

describe('examService.submit', () => {
  const validInput = {
    exam_id: 'exam-123',
    question_id: 'q-456',
    answer: { selected: 'A' },
    time_spent_sec: 15,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully submits an answer', async () => {
    mockRpc.mockResolvedValue({
      data: { saved: true, correct: true, explanation_md: 'To\'g\'ri!' },
      error: null,
    })

    const result = await examService.submit(validInput, 'token-abc')
    expect(result).toEqual({ saved: true, correct: true, explanation_md: 'To\'g\'ri!' })
    expect(mockRpc).toHaveBeenCalledWith('submit_answer', {
      p_exam_id: 'exam-123',
      p_question_id: 'q-456',
      p_answer: { selected: 'A' },
      p_time_spent: 15,
    })
  })

  it('returns sinov_tugagan error when exam is already finished', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'sinov_topilmadi' },
    })

    await expect(examService.submit(validInput, 'token-abc'))
      .rejects.toThrow(NotFoundError)
  })

  it('returns sinov_tugagan status when exam has ended', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'sinov_tugagan' },
    })

    const result = await examService.submit(validInput, 'token-abc')
    expect(result).toEqual({ error: 'sinov_tugagan' })
  })

  it('returns vaqt_tugadi status when time is up', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'vaqt_tugadi' },
    })

    const result = await examService.submit(validInput, 'token-abc')
    expect(result).toEqual({ error: 'vaqt_tugadi' })
  })

  it('throws SUBMIT_ERROR for unknown errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'unknown_db_error' },
    })

    await expect(examService.submit(validInput, 'token-abc'))
      .rejects.toMatchObject({ code: 'SUBMIT_ERROR', statusCode: 500 })
  })
})

describe('examService.finish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully finishes an exam', async () => {
    mockRpc.mockResolvedValue({
      data: {
        exam_id: 'exam-123',
        total_score: 35,
        max_score: 50,
        passed: true,
        breakdown: [{ group_code: 'M01', jami: 10, togri: 8 }],
        already_finished: false,
      },
      error: null,
    })

    const result = await examService.finish('exam-123', 'token-abc')
    expect(result.passed).toBe(true)
    expect(result.total_score).toBe(35)
    expect(mockRpc).toHaveBeenCalledWith('finish_exam', { p_exam_id: 'exam-123' })
  })

  it('throws NotFoundError when exam not found', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'sinov_topilmadi' },
    })

    await expect(examService.finish('bad-id', 'token-abc'))
      .rejects.toThrow(NotFoundError)
  })

  it('throws FINISH_ERROR for unknown errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'db_error' },
    })

    await expect(examService.finish('exam-123', 'token-abc'))
      .rejects.toMatchObject({ code: 'FINISH_ERROR', statusCode: 500 })
  })
})

describe('examService.review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns review data for a finished exam', async () => {
    mockRpc.mockResolvedValue({
      data: [{ question_id: 'q-1', correct: true }, { question_id: 'q-2', correct: false }],
      error: null,
    })

    const result = await examService.review('exam-123', 'token-abc')
    expect(result).toHaveLength(2)
    expect(mockRpc).toHaveBeenCalledWith('get_review', { p_exam_id: 'exam-123' })
  })

  it('throws NotFoundError when exam not found', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'sinov_topilmadi' },
    })

    await expect(examService.review('bad-id', 'token-abc'))
      .rejects.toThrow(NotFoundError)
  })

  it('throws EXAM_NOT_FINISHED when exam is still active', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'sinov_tugamagan' },
    })

    await expect(examService.review('exam-123', 'token-abc'))
      .rejects.toMatchObject({ code: 'EXAM_NOT_FINISHED', statusCode: 400 })
  })
})

describe('examService.getDueReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns due reviews', async () => {
    mockRpc.mockResolvedValue({
      data: [{ construct_id: 'c-1' }, { construct_id: 'c-2' }],
      error: null,
    })

    const result = await examService.getDueReviews('token-abc')
    expect(result).toHaveLength(2)
    expect(mockRpc).toHaveBeenCalledWith('get_due_reviews')
  })

  it('throws DUE_REVIEWS_ERROR on failure', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'error' },
    })

    await expect(examService.getDueReviews('token-abc'))
      .rejects.toMatchObject({ code: 'DUE_REVIEWS_ERROR', statusCode: 500 })
  })
})

describe('examService.getHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only authenticated learner finished attempts with lesson metadata', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          kind: 'mavzu',
          lesson_id: '550e8400-e29b-41d4-a716-446655440011',
          started_at: '2026-10-06T10:00:00.000Z',
          finished_at: '2026-10-06T10:20:00.000Z',
          total_score: 16,
          max_score: 20,
          passed: true,
          breakdown: null,
        },
      ],
      count: 1,
      error: null,
    })
    const order = vi.fn(() => ({ range }))
    const not = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ not }))
    const examSelect = vi.fn(() => ({ eq }))
    const lessonIn = vi.fn().mockResolvedValue({
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          slug: 'M01.02',
          title_uz: 'Axborot turlari',
        },
      ],
      error: null,
    })
    const lessonSelect = vi.fn(() => ({ in: lessonIn }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'exams') return { select: examSelect }
      if (table === 'lessons') return { select: lessonSelect }
      throw new Error(`unexpected table: ${table}`)
    })

    const result = await examService.getHistory(
      { page: 1, page_size: 20 },
      'token-abc'
    )

    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(not).toHaveBeenCalledWith('finished_at', 'is', null)
    expect(order).toHaveBeenCalledWith('finished_at', { ascending: false })
    expect(range).toHaveBeenCalledWith(0, 19)
    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({
      exam_id: '550e8400-e29b-41d4-a716-446655440010',
      lesson_slug: 'M01.02',
      lesson_title_uz: 'Axborot turlari',
      total_score: 16,
      max_score: 20,
      passed: true,
    })
  })

  it('does not query lesson metadata when history page has no lesson attempts', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440020',
          kind: 'mock',
          lesson_id: null,
          started_at: '2026-10-06T10:00:00.000Z',
          finished_at: '2026-10-06T12:00:00.000Z',
          total_score: 70,
          max_score: 100,
          passed: true,
          breakdown: [],
        },
      ],
      count: 1,
      error: null,
    })
    const examSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        not: vi.fn(() => ({
          order: vi.fn(() => ({ range })),
        })),
      })),
    }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'exams') return { select: examSelect }
      throw new Error(`unexpected table: ${table}`)
    })

    const result = await examService.getHistory(
      { page: 2, page_size: 10 },
      'token-abc'
    )

    expect(range).toHaveBeenCalledWith(10, 19)
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(result.items[0].lesson_title_uz).toBeNull()
  })

  it('throws EXAM_HISTORY_ERROR when learner query fails', async () => {
    const range = vi.fn().mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'db error' },
    })
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          not: vi.fn(() => ({
            order: vi.fn(() => ({ range })),
          })),
        })),
      })),
    })

    await expect(
      examService.getHistory({ page: 1, page_size: 20 }, 'token-abc')
    ).rejects.toMatchObject({
      code: 'EXAM_HISTORY_ERROR',
      statusCode: 500,
    })
  })
})
