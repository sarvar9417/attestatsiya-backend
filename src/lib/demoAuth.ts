import { createClient, type User } from '@supabase/supabase-js'
import { config } from '../config.js'

let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Demo Auth — provides a JWT for demo mode without requiring user login.
 *
 * Creates a demo user in Supabase (if not exists) and caches the JWT.
 * The JWT is refreshed before expiry.
 */
export async function getDemoToken(): Promise<string> {
  if (!config.demo.enabled) {
    throw new Error('Demo mode is not enabled')
  }

  // Return cached token if still valid (with 5min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60_000) {
    return cachedToken.token
  }

  const adminClient = createClient(
    config.supabase.url,
    config.supabase.serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  // Check if demo user exists
  const { data: existingUsers } = await adminClient.auth.admin.listUsers()
  const existing = existingUsers?.users.find(
    (u: User) => u.email === config.demo.userEmail
  )

  let userId: string

  if (existing) {
    userId = existing.id
  } else {
    // Create demo user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: config.demo.userEmail,
      password: config.demo.userPassword,
      email_confirm: true,
    })

    if (createError || !newUser?.user) {
      throw new Error(`Demo user yaratishda xatolik: ${createError?.message ?? 'unknown'}`)
    }

    userId = newUser.user.id
  }

  // Sign in to get a fresh JWT
  const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
    email: config.demo.userEmail,
    password: config.demo.userPassword,
  })

  if (signInError || !signInData?.session?.access_token) {
    throw new Error(`Demo user kirishda xatolik: ${signInError?.message ?? 'unknown'}`)
  }

  const token = signInData.session.access_token
  const expiresAt = Date.now() + (signInData.session.expires_in ?? 3600) * 1000

  cachedToken = { token, expiresAt }

  return token
}

/**
 * Clear the cached demo token (e.g., on server restart or manual refresh).
 */
export function clearDemoTokenCache(): void {
  cachedToken = null
}
