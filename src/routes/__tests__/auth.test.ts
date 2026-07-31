import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { authRoutes } from '../auth.js'
import { sendError } from '../../lib/errors.js'

// vi.mock factories are hoisted — use vi.hoisted() for shared mock variables
const { mockAuth, mockFrom } = vi.hoisted(() => {
  const mockAuth = {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    refreshSession: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    resend: vi.fn(),
    updateUser: vi.fn(),
    admin: {
      createUser: vi.fn(),
      updateUserById: vi.fn(),
    },
  }
  const mockFrom = vi.fn()
  return { mockAuth, mockFrom }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: mockAuth,
  })),
}))

function buildProfileChain(profile: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue(profile ? { data: profile, error: null } : { data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

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

    sendError(reply, error)
  })
}

const SESSION = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  user: { id: 'user-1', email: 'test@test.com' },
}

describe('Auth Routes', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(buildProfileChain({ display_name: 'Ali', role: 'user', is_blocked: false }))
    app = Fastify({ logger: false })
    setupGlobalErrorHandler(app)
    await app.register(authRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/auth/register', () => {
    it('returns 201 and creates user + profile on success', async () => {
      mockAuth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@test.com' } },
        error: null,
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'test@test.com', password: 'secret123', full_name: 'Ali Valiyev' },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body).toEqual({
        user_id: 'user-1',
        email: 'test@test.com',
        requires_confirmation: true,
      })
      expect(mockAuth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@test.com', email_confirm: false })
      )
      expect(mockFrom).toHaveBeenCalledWith('profiles')
    })

    it('returns 409 EMAIL_TAKEN when email already registered', async () => {
      mockAuth.admin.createUser.mockResolvedValue({
        data: null,
        error: { message: 'A user with this email address has already been registered' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'dup@test.com', password: 'secret123', full_name: 'Ali Valiyev' },
      })

      expect(response.statusCode).toBe(409)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('EMAIL_TAKEN')
    })

    it('returns 400 for invalid body (short password, short name)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'bad@test.com', password: '123', full_name: 'A' },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/auth/login', () => {
    it('returns 200 with session and user profile', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@test.com', password: 'secret123' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.access_token).toBe('access-1')
      expect(body.refresh_token).toBe('refresh-1')
      expect(body.expires_at).toBeGreaterThan(0)
      expect(body.user).toEqual({
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Ali',
        role: 'user',
      })
    })

    it('returns 401 INVALID_CREDENTIALS for wrong credentials', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid login credentials' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@test.com', password: 'wrong' },
      })

      expect(response.statusCode).toBe(401)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 401 EMAIL_NOT_CONFIRMED for unconfirmed email', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error: { message: 'Email not confirmed' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@test.com', password: 'secret123' },
      })

      expect(response.statusCode).toBe(401)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('EMAIL_NOT_CONFIRMED')
    })

    it('returns 403 when user is blocked', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null })
      mockFrom.mockReturnValue(
        buildProfileChain({ display_name: 'Ali', role: 'user', is_blocked: true })
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@test.com', password: 'secret123' },
      })

      expect(response.statusCode).toBe(403)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('FORBIDDEN')
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('returns 200 with new session', async () => {
      mockAuth.refreshSession.mockResolvedValue({ data: { session: SESSION }, error: null })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: 'refresh-1' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.access_token).toBe('access-1')
      expect(mockAuth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh-1' })
    })

    it('returns 401 when refresh token is invalid', async () => {
      mockAuth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid Refresh Token' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: 'expired' },
      })

      expect(response.statusCode).toBe(401)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('returns 401 without token', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/auth/logout' })
      expect(response.statusCode).toBe(401)
    })

    it('returns 200 and signs out globally', async () => {
      mockAuth.signOut.mockResolvedValue({ error: null })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: 'Bearer access-1' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ success: true })
      expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    })
  })

  describe('POST /api/auth/reset-password', () => {
    it('returns 200 and sends reset email with redirectTo', async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { email: 'test@test.com' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ sent: true })
      expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
      )
    })
  })

  describe('POST /api/auth/update-password', () => {
    it('returns 200 and updates password with user token', async () => {
      mockAuth.getUser.mockResolvedValue({ data: { user: SESSION.user }, error: null })
      mockAuth.updateUser.mockResolvedValue({ data: { user: SESSION.user }, error: null })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/update-password',
        headers: { authorization: 'Bearer access-1' },
        payload: { password: 'newsecret123' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ updated: true })
      expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'newsecret123' })
    })

    it('returns 401 without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/update-password',
        payload: { password: 'newsecret123' },
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /api/auth/resend-confirmation', () => {
    it('returns 200 and resends confirmation email', async () => {
      mockAuth.resend.mockResolvedValue({ error: null })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/resend-confirmation',
        payload: { email: 'test@test.com' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ sent: true })
      expect(mockAuth.resend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'signup', email: 'test@test.com' })
      )
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/auth/me' })
      expect(response.statusCode).toBe(401)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('TOKEN_REQUIRED')
    })

    it('returns 200 with user profile', async () => {
      mockAuth.getUser.mockResolvedValue({ data: { user: SESSION.user }, error: null })

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer access-1' },
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Ali',
        role: 'user',
      })
    })

    it('returns 401 when token is invalid', async () => {
      mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer bad-token' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('PATCH /api/auth/profile', () => {
    it('returns 200 and updates name + metadata', async () => {
      mockAuth.getUser.mockResolvedValue({ data: { user: SESSION.user }, error: null })
      mockAuth.admin.updateUserById.mockResolvedValue({ data: { user: SESSION.user }, error: null })

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: 'Bearer access-1' },
        payload: { full_name: 'Bobur Aliyev' },
      })

      expect(response.statusCode).toBe(200)
      expect(mockAuth.admin.updateUserById).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ user_metadata: { name: 'Bobur Aliyev' } })
      )
      expect(mockFrom).toHaveBeenCalledWith('profiles')
    })

    it('returns 400 for too-short name', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: 'Bearer access-1' },
        payload: { full_name: 'A' },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
