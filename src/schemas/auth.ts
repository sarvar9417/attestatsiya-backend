import { z } from 'zod'

// ─── Register ─────────────────────────────────────────────────────
export const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    full_name: z.string().min(2).max(100),
  }),
}
export type RegisterInput = z.infer<typeof registerSchema.body>

// ─── Login ────────────────────────────────────────────────────────
export const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
}
export type LoginInput = z.infer<typeof loginSchema.body>

// ─── Refresh ──────────────────────────────────────────────────────
export const refreshSchema = {
  body: z.object({
    refresh_token: z.string().min(1),
  }),
}
export type RefreshInput = z.infer<typeof refreshSchema.body>

// ─── Reset / Update password ──────────────────────────────────────
export const resetPasswordSchema = {
  body: z.object({
    email: z.string().email(),
  }),
}

export const updatePasswordSchema = {
  body: z.object({
    password: z.string().min(6),
  }),
}

// ─── Resend confirmation ──────────────────────────────────────────
export const resendConfirmationSchema = {
  body: z.object({
    email: z.string().email(),
  }),
}

// ─── Profile ──────────────────────────────────────────────────────
export const updateProfileSchema = {
  body: z.object({
    full_name: z.string().min(2).max(100),
  }),
}
export type UpdateProfileInput = z.infer<typeof updateProfileSchema.body>

// ─── Response Types ───────────────────────────────────────────────
export interface AuthUserResponse {
  id: string
  email: string
  display_name: string | null
  role: 'user' | 'editor' | 'admin'
}

export interface AuthSessionResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  user: AuthUserResponse
}

export interface RegisterResponse {
  user_id: string
  email: string
  requires_confirmation: true
}
