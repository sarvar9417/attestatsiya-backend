import { supabase, getAuthedClient } from '../lib/supabase.js'
import { resolveLessonUuid } from '../lib/resolveIds.js'
import type { SyncProgressInput, ModuleProgressResponse } from '../schemas/progress.js'

/**
 * Progress Service
 *
 * Handles synchronization of user progress between client and server.
 * Uses authed client for user-scoped RPCs (mark_lesson_read uses auth.uid()).
 */
export const progressService = {
  /**
   * Sync client progress to server.
   * - Topics: mark lessons as read via `mark_lesson_read` RPC
   * - Module scores: upsert into `user_module_progress`
   */
  async sync(userId: string, userToken: string, input: SyncProgressInput) {
    const authedClient = getAuthedClient(userToken)
    const results = {
      topics_synced: 0,
      modules_synced: 0,
      errors: [] as string[],
    }

    // Sync topics — must use authed client because mark_lesson_read uses auth.uid()
    if (input.topics) {
      for (const topic of input.topics) {
        const lessonId = await resolveLessonUuid(topic.subtopic_code)

        if (lessonId) {
          const { error } = await authedClient.rpc('mark_lesson_read', {
            p_lesson_id: lessonId,
          })

          if (error) {
            results.errors.push(`Topic ${topic.subtopic_code}: ${error.message}`)
          } else {
            results.topics_synced++
          }
        }
      }
    }

    // Sync module scores — admin client is fine here (direct table upsert)
    if (input.module_scores) {
      for (const mod of input.module_scores) {
        const { data: module } = await supabase
          .from('modules')
          .select('id')
          .eq('code', mod.module_code)
          .maybeSingle()

        if (module) {
          const { error } = await authedClient
            .from('user_module_progress')
            .upsert(
              {
                user_id: userId,
                module_id: module.id,
                exam_best_score: mod.exam_score,
              },
              { onConflict: 'user_id,module_id' }
            )

          if (error) {
            results.errors.push(`Module ${mod.module_code}: ${error.message}`)
          } else {
            results.modules_synced++
          }
        }
      }
    }

    return results
  },

  /**
   * Get all module progress for a user.
   */
  async getModuleProgress(userId: string): Promise<ModuleProgressResponse[]> {
    const { data: modules } = await supabase
      .from('modules')
      .select('id, code, title_uz, order_idx')
      .eq('status', 'published')
      .order('order_idx', { ascending: true })

    if (!modules) return []

    const { data: userProgress } = await supabase
      .from('user_module_progress')
      .select('*')
      .eq('user_id', userId)

    const progressMap = new Map((userProgress || []).map(p => [p.module_id, p]))

    // Get topic counts from lessons
    const { data: lessons } = await supabase
      .from('lessons')
      .select('module_id, id')
      .eq('status', 'published')

    const lessonCountMap = new Map<string, number>()
    for (const lesson of lessons || []) {
      lessonCountMap.set(lesson.module_id, (lessonCountMap.get(lesson.module_id) || 0) + 1)
    }

    // Get completed topic counts from user_lesson_progress
    const { data: completedLessons } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId)

    const completedSet = new Set((completedLessons || []).map(cl => cl.lesson_id))

    // Build map of module_id → how many of its lessons are completed
    const completedByModule = new Map<string, number>()
    for (const [modId] of lessonCountMap) {
      completedByModule.set(modId, 0)
    }
    for (const lesson of lessons || []) {
      if (completedSet.has(lesson.id)) {
        completedByModule.set(lesson.module_id, (completedByModule.get(lesson.module_id) || 0) + 1)
      }
    }

    return modules.map(mod => {
      const totalTopics = lessonCountMap.get(mod.id) || 0
      const progress = progressMap.get(mod.id)

      return {
        module_id: mod.id,
        module_code: mod.code || '',
        module_title: mod.title_uz,
        exam_best_score: progress?.exam_best_score ?? null,
        completed_at: progress?.completed_at ?? null,
        unlocked_at: progress?.unlocked_at ?? new Date().toISOString(),
        topic_count: totalTopics,
        completed_topics: completedByModule.get(mod.id) || 0,
      }
    })
  },
}
