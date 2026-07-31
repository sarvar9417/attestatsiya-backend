import type { FastifyInstance } from 'fastify'
import { contentService } from '../services/content.service.js'
import { moduleListSchema, moduleDetailSchema, lessonDetailSchema, lessonQuestionsSchema, checkAnswerSchema } from '../schemas/content.js'
import { sendError } from '../lib/errors.js'

export async function contentRoutes(app: FastifyInstance) {
  /**
   * GET /api/content/modules
   * List all published modules
   */
  app.get('/api/content/modules', async (req, reply) => {
    try {
      const { status, section } = moduleListSchema.querystring.parse(req.query)
      const result = await contentService.listModules(section, status)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/content/modules/:id
   * Get module detail with lessons
   */
  app.get('/api/content/modules/:id', async (req, reply) => {
    try {
      const { id } = moduleDetailSchema.params.parse(req.params)
      const result = await contentService.getModule(id)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/content/lessons/:id
   * Get lesson detail with constructs and blocks
   */
  app.get('/api/content/lessons/:id', async (req, reply) => {
    try {
      const { id } = lessonDetailSchema.params.parse(req.params)
      const result = await contentService.getLesson(id)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/content/lessons/:id/questions
   * Get published questions for a lesson (no keys)
   */
  app.get('/api/content/lessons/:id/questions', async (req, reply) => {
    try {
      const { id } = lessonQuestionsSchema.params.parse(req.params)
      const result = await contentService.listLessonQuestions(id)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/content/questions/check
   * Server-side answer check (question_keys never leaves the server)
   */
  app.post('/api/content/questions/check', async (req, reply) => {
    const { question_id, option_id } = checkAnswerSchema.body.parse(req.body)
    try {
      const result = await contentService.checkAnswer(question_id, option_id)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/content/constructs
   * List all constructs (competencies)
   */
  app.get('/api/content/constructs', async (req, reply) => {
    try {
      const { group_code } = req.query as { group_code?: string }
      const result = await contentService.listConstructs(group_code)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
