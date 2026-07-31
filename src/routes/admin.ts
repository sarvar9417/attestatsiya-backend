import type { FastifyInstance } from 'fastify'
import { adminService } from '../services/admin.service.js'
import { listAttemptsQuerySchema } from '../schemas/admin.js'
import { sendError, AppError } from '../lib/errors.js'

function getToken(req: { headers: { authorization?: string } }): string | null {
  return req.headers.authorization?.replace('Bearer ', '') ?? null
}

export async function adminRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/attempts
   * Barcha sinov urinishlari (admin). Filter: kind, lesson_id, user_id, from, to.
   */
  app.get('/api/admin/attempts', async (req, reply) => {
    const query = listAttemptsQuerySchema.querystring.parse(req.query)
    const token = getToken(req)
    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await adminService.listAttempts(query, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/admin/attempts/:id
   * Bitta urinishning to'liq detali (admin).
   */
  app.get('/api/admin/attempts/:id', async (req, reply) => {
    const { id } = (req.params as { id: string })
    const token = getToken(req)
    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await adminService.getAttemptDetail(id, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
