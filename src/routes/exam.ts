import type { FastifyInstance } from 'fastify'
import { examService } from '../services/exam.service.js'
import { startExamSchema, submitAnswerSchema, finishExamSchema, reviewParamsSchema } from '../schemas/exam.js'
import { sendError, AppError } from '../lib/errors.js'
import { getDemoToken } from '../lib/demoAuth.js'
import { config } from '../config.js'

/**
 * Extract the Supabase auth token from the Authorization header.
 * Returns null if no valid Bearer token is present.
 */
function getToken(req: { headers: { authorization?: string } }): string | null {
  return req.headers.authorization?.replace('Bearer ', '') ?? null
}

export async function examRoutes(app: FastifyInstance) {
  /**
   * POST /api/exam/start
   * Start a new exam (mock, bolim, mavzu, takrorlash, zaif)
   */
  app.post('/api/exam/start', async (req, reply) => {
    const { kind, module_id, lesson_id } = startExamSchema.body.parse(req.body)
    let token = getToken(req)

    // Demo mode: use demo token if no token provided
    if (!token && config.demo.enabled) {
      try {
        token = await getDemoToken()
      } catch (error) {
        return sendError(reply, error)
      }
    }

    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await examService.start(kind, token, module_id, lesson_id)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/exam/submit
   * Submit an answer during an active exam
   */
  app.post('/api/exam/submit', async (req, reply) => {
    const input = submitAnswerSchema.body.parse(req.body)
    let token = getToken(req)

    // Demo mode: use demo token if no token provided
    if (!token && config.demo.enabled) {
      try {
        token = await getDemoToken()
      } catch (error) {
        return sendError(reply, error)
      }
    }

    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await examService.submit(input, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/exam/finish
   * Finish an exam and get results
   */
  app.post('/api/exam/finish', async (req, reply) => {
    const { exam_id } = finishExamSchema.body.parse(req.body)
    let token = getToken(req)

    // Demo mode: use demo token if no token provided
    if (!token && config.demo.enabled) {
      try {
        token = await getDemoToken()
      } catch (error) {
        return sendError(reply, error)
      }
    }

    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await examService.finish(exam_id, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/exam/:id/review
   * Get full review of a finished exam
   */
  app.get('/api/exam/:id/review', async (req, reply) => {
    const { id } = reviewParamsSchema.params.parse(req.params)
    let token = getToken(req)

    // Demo mode: use demo token if no token provided
    if (!token && config.demo.enabled) {
      try {
        token = await getDemoToken()
      } catch (error) {
        return sendError(reply, error)
      }
    }

    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await examService.review(id, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/exam/due-reviews
   * Get constructs due for spaced repetition
   */
  app.get('/api/exam/due-reviews', async (req, reply) => {
    let token = getToken(req)

    // Demo mode: use demo token if no token provided
    if (!token && config.demo.enabled) {
      try {
        token = await getDemoToken()
      } catch (error) {
        return sendError(reply, error)
      }
    }

    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')

    try {
      const result = await examService.getDueReviews(token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
