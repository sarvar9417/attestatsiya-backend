import { supabase, getAuthedClient, createServiceClient } from '../lib/supabase.js'
import { config } from '../config.js'
import { AppError, ForbiddenError, AuthError } from '../lib/errors.js'
import type {
  AuthSessionResponse,
  AuthUserResponse,
  LoginInput,
  RegisterInput,
  RegisterResponse,
  UpdateProfileInput,
} from '../schemas/auth.js'

/**
 * Auth Service
 *
 * Barcha foydalanuvchi amallari (register, login, refresh, parol tiklash,
 * profil tahrirlash) server tomonda Supabase Auth admin API orqali
 * bajariladi. Browser hech qachon to'g'ridan-to'g'ri Supabase'ga
 * ulanmaydi — yagona yo'l: frontend → backend → Supabase.
 */

const MAX_NAME_LENGTH = 100

function mapAuthError(error: { message?: string } | null, fallback: string): AppError {
  const message = (error?.message ?? '').toLowerCase()
  if (message.includes('already registered') || message.includes('already been registered')) {
    return new AppError('Bu email allaqachon ro\'yxatdan o\'tgan', 409, 'EMAIL_TAKEN')
  }
  if (message.includes('invalid login credentials')) {
    return new AppError('Email yoki parol noto\'g\'ri', 401, 'INVALID_CREDENTIALS')
  }
  if (message.includes('email not confirmed')) {
    return new AppError('Email tasdiqlanmagan. Xatni tekshiring.', 401, 'EMAIL_NOT_CONFIRMED')
  }
  if (message.includes('unexpected_failure')) {
    return new AppError('Serverda xatolik yuz berdi', 500, 'AUTH_SERVER_ERROR')
  }
  return new AppError(fallback, 400, 'AUTH_ERROR')
}

async function getProfile(userId: string): Promise<{
  display_name: string | null
  role: 'user' | 'editor' | 'admin'
  is_blocked: boolean
}> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, role, is_blocked')
    .eq('id', userId)
    .maybeSingle()

  return {
    display_name: data?.display_name ?? null,
    role: (data?.role as 'user' | 'editor' | 'admin') ?? 'user',
    is_blocked: data?.is_blocked ?? false,
  }
}

function toUserResponse(
  id: string,
  email: string,
  profile: { display_name: string | null; role: 'user' | 'editor' | 'admin' }
): AuthUserResponse {
  return {
    id,
    email,
    display_name: profile.display_name,
    role: profile.role,
  }
}

export const authService = {
  /**
   * POST /api/auth/register — yangi foydalanuvchi yaratish.
   * Email tasdiqlanishi talab qilinadi; tasdiqlash xati Supabase orqali yuboriladi.
   */
  async register(input: RegisterInput): Promise<RegisterResponse> {
    if (input.full_name.length > MAX_NAME_LENGTH) {
      throw new AppError('Ism juda uzun', 400, 'VALIDATION_ERROR')
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      user_metadata: { name: input.full_name },
    })

    if (error || !data.user) {
      throw mapAuthError(error, 'Ro\'yxatdan o\'tishda xatolik')
    }

    // profiles row trigger orqali yaratiladi; display_name metadata dan ko'chiriladi
    await supabase
      .from('profiles')
      .update({ display_name: input.full_name })
      .eq('id', data.user.id)

    return {
      user_id: data.user.id,
      email: data.user.email ?? input.email,
      requires_confirmation: true,
    }
  },

  /**
   * POST /api/auth/login — email/parol bilan kirish.
   * Bloklangan foydalanuvchilarga ruxsat berilmaydi.
   */
  async login(input: LoginInput): Promise<AuthSessionResponse> {
    const client = createServiceClient()
    const { data, error } = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })

    if (error || !data.session) {
      throw mapAuthError(error, 'Kirishda xatolik')
    }

    const profile = await getProfile(data.session.user.id)
    if (profile.is_blocked) {
      throw new ForbiddenError('Foydalanuvchi bloklangan')
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: Date.now() + (data.session.expires_in ?? 3600) * 1000,
      user: toUserResponse(data.session.user.id, data.session.user.email ?? '', profile),
    }
  },

  /**
   * POST /api/auth/refresh — refresh token bilan yangi session olish.
   */
  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    const client = createServiceClient()
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    })

    if (error || !data.session) {
      throw new AuthError('Session muddati tugagan. Qayta kiring.')
    }

    const profile = await getProfile(data.session.user.id)
    if (profile.is_blocked) {
      throw new ForbiddenError('Foydalanuvchi bloklangan')
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: Date.now() + (data.session.expires_in ?? 3600) * 1000,
      user: toUserResponse(data.session.user.id, data.session.user.email ?? '', profile),
    }
  },

  /**
   * POST /api/auth/logout — barcha sessionlarni yopish.
   */
  async logout(userToken: string): Promise<{ success: true }> {
    const client = getAuthedClient(userToken)
    const { error } = await client.auth.signOut({ scope: 'global' })
    if (error) {
      throw new AppError('Chiqishda xatolik', 500, 'LOGOUT_ERROR')
    }
    return { success: true }
  },

  /**
   * POST /api/auth/reset-password — parolni tiklash xatini yuborish.
   */
  async resetPassword(email: string): Promise<{ sent: true }> {
    const client = createServiceClient()
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${config.auth.redirectUrl}/reset-password`,
    })
    if (error) throw mapAuthError(error, 'Tiklash xatini yuborishda xatolik')
    return { sent: true }
  },

  /**
   * POST /api/auth/update-password — login qilgan foydalanuvchi parolini o'zgartirish.
   */
  async updatePassword(password: string, userToken: string): Promise<{ updated: true }> {
    const client = getAuthedClient(userToken)
    const { error } = await client.auth.updateUser({ password })
    if (error) throw mapAuthError(error, 'Parolni yangilashda xatolik')
    return { updated: true }
  },

  /**
   * POST /api/auth/resend-confirmation — tasdiqlash xatini qayta yuborish.
   */
  async resendConfirmation(email: string): Promise<{ sent: true }> {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: config.auth.redirectUrl,
      },
    })
    if (error) throw mapAuthError(error, 'Xatni qayta yuborishda xatolik')
    return { sent: true }
  },

  /**
   * GET /api/auth/me — joriy foydalanuvchi ma'lumotlari.
   */
  async me(userToken: string): Promise<AuthUserResponse> {
    const { data: { user }, error } = await supabase.auth.getUser(userToken)
    if (error || !user) throw new AuthError('Yaroqsiz token')

    const profile = await getProfile(user.id)
    return toUserResponse(user.id, user.email ?? '', profile)
  },

  /**
   * PATCH /api/auth/profile — ism-familiyani tahrirlash.
   */
  async updateProfile(input: UpdateProfileInput, userToken: string): Promise<AuthUserResponse> {
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken)
    if (userError || !user) throw new AuthError('Yaroqsiz token')

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { name: input.full_name },
    })
    if (error) throw mapAuthError(error, 'Profilni yangilashda xatolik')

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ display_name: input.full_name })
      .eq('id', user.id)
    if (profileError) {
      throw new AppError('Profilni yangilashda xatolik', 500, 'PROFILE_UPDATE_ERROR')
    }

    const profile = await getProfile(user.id)
    return toUserResponse(user.id, user.email ?? '', profile)
  },
}
