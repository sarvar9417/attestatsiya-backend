/**
 * UUID Resolver (Backend)
 *
 * Maps contentTree codes (e.g. "M01", "M01.01") to database UUIDs.
 * The frontend uses human-readable codes; Supabase RPCs expect UUIDs.
 * This bridge avoids coupling the contentTree to database PKs.
 *
 * @note Uses the admin supabase client (not user-scoped) since
 *       modules and lessons are public read-only data.
 */

import { supabase } from './supabase.js'

type CacheEntry = { id: string; fetchedAt: number }
const CACHE_TTL = 600_000 // 10 min
const moduleCache = new Map<string, CacheEntry>()
const lessonCache = new Map<string, CacheEntry>()

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a module code (e.g. "M01") to its UUID in the `modules` table.
 * Returns the input unchanged if it's already a valid UUID.
 */
export async function resolveModuleUuid(code: string): Promise<string | null> {
  if (UUID_RE.test(code)) return code // already a UUID

  const cached = moduleCache.get(code)
  if (isFresh(cached)) return cached.id

  const { data, error } = await supabase
    .from('modules')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (error || !data) {
    console.warn(`[resolveIds] Module '${code}' not found:`, error?.message ?? 'no data')
    return null
  }

  moduleCache.set(code, { id: data.id, fetchedAt: Date.now() })
  return data.id
}

/**
 * Resolve a subtopic/lesson code (e.g. "M01.01") to its UUID in the `lessons` table.
 * Returns the input unchanged if it's already a valid UUID.
 * Tries strategies: exact slug match → slug prefix match
 */
export async function resolveLessonUuid(subtopicCode: string): Promise<string | null> {
  if (UUID_RE.test(subtopicCode)) return subtopicCode // already a UUID

  const cached = lessonCache.get(subtopicCode)
  if (isFresh(cached)) return cached.id

  const baseSlug = subtopicCode.toLowerCase().replace('.', '-')

  // Strategy 1: exact slug match
  const { data: exact } = await supabase
    .from('lessons')
    .select('id')
    .eq('slug', baseSlug)
    .maybeSingle()

  if (exact) {
    lessonCache.set(subtopicCode, { id: exact.id, fetchedAt: Date.now() })
    return exact.id
  }

  // Strategy 2: title_uz starts with the subtopic code (e.g. "M01.01")
  const { data: byCode } = await supabase
    .from('lessons')
    .select('id')
    .ilike('title_uz', `${subtopicCode}%`)
    .limit(1)
    .maybeSingle()

  if (byCode) {
    lessonCache.set(subtopicCode, { id: byCode.id, fetchedAt: Date.now() })
    return byCode.id
  }

  // Strategy 3: slug starts with the base slug
  const { data: bySlug } = await supabase
    .from('lessons')
    .select('id')
    .ilike('slug', `${baseSlug}%`)
    .limit(1)
    .maybeSingle()

  if (bySlug) {
    lessonCache.set(subtopicCode, { id: bySlug.id, fetchedAt: Date.now() })
    return bySlug.id
  }

  console.warn(`[resolveIds] Lesson for '${subtopicCode}' not found (tried slug=${baseSlug})`)
  return null
}
