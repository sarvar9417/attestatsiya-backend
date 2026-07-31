import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { healthRoutes } from '../health.js'

// vi.mock factories are hoisted — use vi.hoisted() for shared mock variables
const { mockFrom, mockSelect, mockLimit } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockLimit: vi.fn(),
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

describe('GET /api/health', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify({ logger: false })
    await app.register(healthRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns healthy status when DB is reachable', async () => {
    // Mock chain: supabase.from('modules').select('id').limit(1)
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ limit: mockLimit })
    mockLimit.mockResolvedValue({ data: [{ id: 'mod-1' }], error: null })

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('healthy')
    expect(body.checks.database.status).toBe('healthy')
    expect(body.checks.database.error).toBeNull()
    expect(body.version).toBe('1.0.0')
    expect(body.timestamp).toBeDefined()
  })

  it('returns degraded status when DB query fails', async () => {
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ limit: mockLimit })
    mockLimit.mockResolvedValue({ data: null, error: { message: 'Connection refused' } })

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(503)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('degraded')
    expect(body.checks.database.status).toBe('unhealthy')
    expect(body.checks.database.error).toBe('Connection refused')
  })

  it('handles exceptions gracefully', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected crash')
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(503)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('degraded')
    expect(body.checks.database.status).toBe('unhealthy')
  })

  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/nonexistent',
    })

    expect(response.statusCode).toBe(404)
  })
})
