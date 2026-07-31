import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted — use vi.hoisted() for shared mock variables
const { mockFrom, mockSelect, mockEq, mockLimit, mockILike, mockMaybeSingle } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockLimit: vi.fn(),
  mockILike: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// Set env before config load
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

import { resolveModuleUuid, resolveLessonUuid } from '../resolveIds.js'

/**
 * NOTE: `resolveModuleUuid` and `resolveLessonUuid` maintain in-memory caches
 * (moduleCache, lessonCache) that persist across tests within the same file.
 * Each sub-test MUST use a unique code (e.g., M01, M02-auth-error, M03-not-found)
 * to avoid cache interference.
 */

describe('resolveModuleUuid', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock chain
    mockFrom.mockReturnValue({
      select: mockSelect,
    })
    mockSelect.mockReturnValue({
      eq: mockEq,
    })
    mockEq.mockReturnValue({
      maybeSingle: mockMaybeSingle,
    })
  })

  it('returns the input unchanged if it is already a valid UUID', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = await resolveModuleUuid(uuid)
    expect(result).toBe(uuid)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('resolves a module code to UUID via database lookup', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'uuid-123' }, error: null })

    const result = await resolveModuleUuid('M01')
    expect(result).toBe('uuid-123')
    expect(mockFrom).toHaveBeenCalledWith('modules')
    expect(mockEq).toHaveBeenCalledWith('code', 'M01')
  })

  it('returns null when module code is not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await resolveModuleUuid('M99')
    expect(result).toBeNull()
  })

  it('returns null on database error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'Connection failed' } })

    // Use a different code (not previously cached) so it hits the DB
    const result = await resolveModuleUuid('M01-err')
    expect(result).toBeNull()
  })

  it('caches the result for subsequent calls', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'uuid-cached' }, error: null })

    // First call — hits DB
    const first = await resolveModuleUuid('M02')
    expect(first).toBe('uuid-cached')
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1)

    // Second call — uses cache
    const second = await resolveModuleUuid('M02')
    expect(second).toBe('uuid-cached')
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1) // still 1
  })
})

describe('resolveLessonUuid', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFrom.mockReturnValue({
      select: mockSelect,
    })
    mockSelect.mockReturnValue({
      eq: mockEq,
      ilike: mockILike,
      limit: mockLimit,
    })
    mockEq.mockReturnValue({
      maybeSingle: mockMaybeSingle,
    })
    mockILike.mockReturnValue({
      limit: mockLimit,
    })
    mockLimit.mockReturnValue({
      maybeSingle: mockMaybeSingle,
    })
  })

  it('returns the input unchanged if it is already a valid UUID', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = await resolveLessonUuid(uuid)
    expect(result).toBe(uuid)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('tries exact slug match first', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'lesson-exact' }, error: null })

    const result = await resolveLessonUuid('A01.01')
    expect(result).toBe('lesson-exact')
    expect(mockEq).toHaveBeenCalledWith('slug', 'a01-01')
  })

  it('falls back to title_uz ilike match when slug fails', async () => {
    // First call (exact slug) → null, Second call (title_uz ilike) → found
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'lesson-title' }, error: null })

    const result = await resolveLessonUuid('A01.02')
    expect(result).toBe('lesson-title')
    expect(mockILike).toHaveBeenCalledWith('title_uz', 'A01.02%')
  })

  it('falls back to slug ilike match when both exact and title fail', async () => {
    // Exact slug → null, title ilike → null, slug ilike → found
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'lesson-slug-ilike' }, error: null })

    const result = await resolveLessonUuid('A02.03')
    expect(result).toBe('lesson-slug-ilike')
    expect(mockILike).toHaveBeenCalledWith('slug', 'a02-03%')
  })

  it('returns null when all lookup strategies fail', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    const result = await resolveLessonUuid('A99.99')
    expect(result).toBeNull()
  })

  it('caches the result after successful lookup', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: 'lesson-cached' }, error: null })

    const first = await resolveLessonUuid('A01.03')
    expect(first).toBe('lesson-cached')

    // Second call — cache hit
    const second = await resolveLessonUuid('A01.03')
    expect(second).toBe('lesson-cached')

    // Only one DB call (via mockMaybeSingle) was made for 'A01.03'
    expect(mockEq).toHaveBeenCalledTimes(1)
  })
})
