import { describe, it, expect } from 'vitest'
import { buildApp } from '../../app.js'

/**
 * Global error handler regressiya testlari.
 *
 * Tarix: `setErrorHandler` route'lardan keyin chaqirilgani uchun route
 * context'lar default handler'ni ushlab qolgan va zod validation xatosi
 * 400 o'rniga Fastify default 500 qaytargan. Endi handler route'lardan
 * oldin ro'yxatdan o'tkaziladi va quyidagi testlar buni qattiq tutadi.
 */
describe('global error handler (zod validation)', () => {
  it("register {} -> 400 VALIDATION_ERROR (default emas 500)", async () => {
    const app = await buildApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(Array.isArray(body.error.details)).toBe(true)
      expect(body.error.details.length).toBeGreaterThan(0)
    } finally {
      await app.close()
    }
  })

  it('login noto\'g\'ri email -> 400 VALIDATION_ERROR', async () => {
    const app = await buildApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'not-an-email', password: 'x' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_ERROR')
    } finally {
      await app.close()
    }
  })

  it('app-error path still returns our envelope (logout without token)', async () => {
    // Logout token'siz AppError tashlaydi (try/catch tashqarisida) —
    // global handler yo'li orqali o'tadi va demo rejimga bog'liq emas
    // (auth/me'dan farqli — u demo tokenni olib 200 qaytarishi mumkin).
    const app = await buildApp()
    try {
      const res = await app.inject({ method: 'POST', url: '/api/auth/logout' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('TOKEN_REQUIRED')
    } finally {
      await app.close()
    }
  })
})
