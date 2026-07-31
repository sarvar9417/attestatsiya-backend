import type { FastifyReply } from 'fastify'

export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
    readonly code: string = 'BAD_REQUEST'
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resurs topilmadi') {
    super(message, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class AuthError extends AppError {
  constructor(message = 'Avtorizatsiyadan o\'tmagansiz') {
    super(message, 401, 'UNAUTHORIZED')
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Ruxsat yo\'q') {
    super(message, 403, 'FORBIDDEN')
    this.name = 'ForbiddenError'
  }
}

interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

interface ZodIssueLike {
  path?: ReadonlyArray<string | number>
  message?: string
}

/**
 * Zod xatosi ekanini strukturaviy tekshiradi va `issues` ro'yxatini
 * qaytaradi. `instanceof ZodError` ishonchli emas: zod 3.25.x
 * (v4-core transitional build) `zod/v3` subpath'dan xato tashlashi
 * mumkin — modul instance'lari farqlanib, `instanceof` false bo'ladi.
 * Shu sababli `name === 'ZodError'` va `issues`/`errors` massivlariga
 * tayanamiz (zod v4 `issues`, v3 `errors` ishlatadi).
 */
export function getZodIssues(error: unknown): ZodIssueLike[] | null {
  if (!error || typeof error !== 'object') return null
  const err = error as { name?: unknown; issues?: unknown; errors?: unknown }
  const issues = Array.isArray(err.issues)
    ? err.issues
    : Array.isArray(err.errors)
      ? err.errors
      : null
  if (err.name !== 'ZodError' && !issues) return null
  return (issues ?? []).filter(
    (issue): issue is ZodIssueLike => typeof issue === 'object' && issue !== null
  )
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    } satisfies ErrorResponse)
  }

  // Fastify validation error
  if (error && typeof error === 'object' && 'validation' in error) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'So\'rov ma\'lumotlari noto\'g\'ri',
        details: (error as { validation: unknown }).validation,
      },
    } satisfies ErrorResponse)
  }

  // Zod validation error
  const zodIssues = getZodIssues(error)
  if (zodIssues) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'So\'rov ma\'lumotlari noto\'g\'ri',
        details: zodIssues.map((issue) => ({
          field: (issue.path ?? []).join('.'),
          message: issue.message ?? 'Noto\'g\'ri qiymat',
        })),
      },
    } satisfies ErrorResponse)
  }

  // Unknown error
  console.error('[ERROR]', error)
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Serverda kutilmagan xato yuz berdi',
    },
  } satisfies ErrorResponse)
}
