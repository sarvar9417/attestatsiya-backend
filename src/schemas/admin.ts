import { z } from 'zod'

/**
 * Admin statistika uchun so'rov parametrlari.
 * lesson_id — UUID yoki contentTree kodi (masalan "M01.02") qabul qilinadi.
 */
export const listAttemptsQuerySchema = {
  querystring: z.object({
    kind: z
      .enum(['mavzu', 'bolim', 'mock', 'takrorlash', 'zaif', 'diagnostika'])
      .optional(),
    lesson_id: z.string().min(1).max(64).optional(),
    user_id: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  }),
}

export const attemptSummarySchema = z.object({
  exam_id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  kind: z.string(),
  lesson_id: z.string().uuid().nullable(),
  lesson_slug: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  total_score: z.number(),
  max_score: z.number(),
  passed: z.boolean(),
  answered_count: z.number().int(),
  breakdown: z.unknown().nullable(),
})

export type AttemptSummary = z.infer<typeof attemptSummarySchema>

export const listAttemptsResponseSchema = z.object({
  items: z.array(attemptSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

export type ListAttemptsResponse = z.infer<typeof listAttemptsResponseSchema>

export const attemptDetailSchema = z.object({
  exam_id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  kind: z.string(),
  lesson_id: z.string().uuid().nullable(),
  lesson_slug: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  total_score: z.number(),
  max_score: z.number(),
  passed: z.boolean(),
  breakdown: z.unknown().nullable(),
  items: z.array(
    z.object({
      item_id: z.string().uuid(),
      order_idx: z.number().int(),
      question_id: z.string().uuid(),
      group_code: z.string().nullable(),
      format: z.string().nullable(),
      stem_md: z.string().nullable(),
      options: z.array(
        z.object({
          id: z.string().uuid(),
          side: z.string().nullable(),
          content_md: z.string().nullable(),
        })
      ),
      user_answer: z.unknown().nullable(),
      is_correct: z.boolean().nullable(),
      score: z.number(),
      time_spent_sec: z.number().int().nullable(),
      flagged: z.boolean(),
      answered_at: z.string().nullable(),
      correct_option_id: z.string().uuid().nullable(),
      explanation_md: z.string().nullable(),
    })
  ),
})

export type AttemptDetail = z.infer<typeof attemptDetailSchema>
