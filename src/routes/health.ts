import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'

export async function healthRoutes(app: FastifyInstance) {
  /**
   * GET /api/health
   * Health check endpoint
   */
  app.get('/api/health', async (_req, reply) => {
    let dbOk = false
    let dbError: string | null = null

    try {
      const { error } = await supabase.from('modules').select('id').limit(1)
      dbOk = !error
      dbError = error?.message ?? null
    } catch (e) {
      dbError = e instanceof Error ? e.message : 'unknown'
    }

    const status = dbOk ? 'healthy' : 'degraded'

    return reply.code(dbOk ? 200 : 503).send({
      status,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        database: {
          status: dbOk ? 'healthy' : 'unhealthy',
          error: dbError,
        },
      },
    })
  })
}
