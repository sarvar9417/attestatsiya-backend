import { z } from 'zod'

// ─── Sync Progress ──────────────────────────────────────────────
export const syncProgressSchema = {
  body: z.object({
    topics: z.array(
      z.object({
        subtopic_code: z.string().min(1),
        completed: z.boolean(),
        correct_count: z.number().int().nonnegative(),
        total_count: z.number().int().positive(),
        last_score: z.number().int().min(0).max(100),
      })
    ).optional(),
    module_scores: z.array(
      z.object({
        module_code: z.string().min(1),
        exam_score: z.number().int().nonnegative(),
      })
    ).optional(),
  }),
}

export type SyncProgressInput = z.infer<typeof syncProgressSchema.body>

// ─── Due Reviews ────────────────────────────────────────────────
export interface DueReviewItem {
  construct_id: string
  title_uz: string
  group_code: string
  due_at: string | null
  accuracy: number
}

// ─── Module Progress ────────────────────────────────────────────
export interface ModuleProgressResponse {
  module_id: string
  module_code: string
  module_title: string
  exam_best_score: number | null
  completed_at: string | null
  unlocked_at: string
  topic_count: number
  completed_topics: number
}
