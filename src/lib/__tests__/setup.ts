import { vi } from 'vitest'
import { config } from '../../config.js'

// ─── Mock dotenv/config ──────────────────────────────────────────
vi.mock('dotenv/config', () => ({}))

// ─── Mock @supabase/supabase-js ──────────────────────────────────
const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
  },
}

export function createMockClient() {
  return Object.assign(Object.create(null), {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  })
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// ─── Expose mock helpers globally ────────────────────────────────
;(globalThis as Record<string, unknown>).__mockSupabaseClient = mockSupabaseClient
;(globalThis as Record<string, unknown>).__createMockClient = createMockClient

// ─── Ensure config loades without env vars ───────────────────────
// The config module reads process.env at import time.
// Before importing config, set dummy env vars.
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'
process.env.HOST = '127.0.0.1'
process.env.RATE_LIMIT_MAX = '100'
process.env.RATE_LIMIT_WINDOW_MS = '60000'
