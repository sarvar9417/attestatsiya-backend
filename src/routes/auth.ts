import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authService } from '../services/auth.service.js'
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  resendConfirmationSchema,
  updateProfileSchema,
} from '../schemas/auth.js'
import { sendError, AppError } from '../lib/errors.js'
import { config } from '../config.js'
import { getDemoToken } from '../lib/demoAuth.js'

type AuthRequest = FastifyRequest

function getToken(req: AuthRequest): string | null {
  return req.headers.authorization?.replace('Bearer ', '') ?? null
}

/**
 * Token talab qiladi; demo rejimda token bo'lmasa demo tokenni oladi.
 * /api/auth/me va /api/auth/profile uchun.
 */
async function requireToken(req: AuthRequest): Promise<string> {
  let token = getToken(req)
  if (!token && config.demo.enabled) {
    try {
      token = await getDemoToken()
    } catch {
      throw new AppError('Demo rejimida xatolik', 500, 'DEMO_AUTH_ERROR')
    }
  }
  if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')
  return token
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/register — ro'yxatdan o'tish
   */
  app.post('/api/auth/register', async (req, reply) => {
    const input = registerSchema.body.parse(req.body)
    try {
      const result = await authService.register(input)
      return reply.status(201).send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/auth/login — kirish
   */
  app.post('/api/auth/login', async (req, reply) => {
    const input = loginSchema.body.parse(req.body)
    try {
      const result = await authService.login(input)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/auth/refresh — session yangilash
   */
  app.post('/api/auth/refresh', async (req, reply) => {
    const { refresh_token } = refreshSchema.body.parse(req.body)
    try {
      const result = await authService.refresh(refresh_token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/auth/logout — chiqish (barcha sessionlar yopiladi)
   */
  app.post('/api/auth/logout', async (req, reply) => {
    const token = getToken(req)
    if (!token) throw new AppError('Token kerak', 401, 'TOKEN_REQUIRED')
    try {
      const result = await authService.logout(token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/auth/reset-password — parolni tiklash xatini yuborish
   */
  app.post('/api/auth/reset-password', async (req, reply) => {
    const { email } = resetPasswordSchema.body.parse(req.body)
    try {
      const result = await authService.resetPassword(email)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/auth/update-password — parolni yangilash (reset linkdan keyin)
   */
  app.post('/api/auth/update-password', async (req, reply) => {
    const { password } = updatePasswordSchema.body.parse(req.body)
    const token = await requireToken(req)
    try {
      const result = await authService.updatePassword(password, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * POST /api/auth/resend-confirmation — tasdiqlash xatini qayta yuborish
   */
  app.post('/api/auth/resend-confirmation', async (req, reply) => {
    const { email } = resendConfirmationSchema.body.parse(req.body)
    try {
      const result = await authService.resendConfirmation(email)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * GET /api/auth/me — joriy foydalanuvchi ma'lumotlari
   */
  app.get('/api/auth/me', async (req, reply) => {
    try {
      const token = await requireToken(req)
      const result = await authService.me(token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * PATCH /api/auth/profile — ism-familiya tahrirlash
   */
  app.patch('/api/auth/profile', async (req, reply) => {
    const input = updateProfileSchema.body.parse(req.body)
    try {
      const token = await requireToken(req)
      const result = await authService.updateProfile(input, token)
      return reply.send(result)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
