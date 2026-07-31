import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

/**
 * Supabase admin client — uses SERVICE_ROLE key.
 * Only use in server-side code (NEVER expose to browser).
 * Bypasses RLS, so all queries must include proper filters.
 */
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * Yangi service-role client yaratadi.
 *
 * Asosiy `supabase` client'ida `signInWithPassword` / `refreshSession`
 * kabi auth chaqiruvlari ishlatilmasligi kerak: ular client'ning
 * session holatini o'zgartirib, keyingi REST so'rovlarini user-scope
 * qilib yuboradi (RLS qo'llanadi). User auth operatsiyalari uchun
 * har safar yangi client yaratiladi.
 */
export function createServiceClient() {
  return createClient(
    config.supabase.url,
    config.supabase.serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

/**
 * Get an authenticated Supabase client for a specific user.
 * Use this for user-scoped RPC calls (start_exam, submit_answer, etc.)
 */
export function getAuthedClient(userToken: string) {
  return createClient(
    config.supabase.url,
    config.supabase.serviceKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
