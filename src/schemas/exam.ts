import { z } from 'zod'

// ─── Start Exam ─────────────────────────────────────────────────
export const startExamSchema = {
  body: z.object({
    kind: z.enum(['mock', 'bolim', 'mavzu', 'takrorlash', 'zaif']),
    module_id: z.string().min(1).optional(),   // contentTree code (e.g. "M01") or UUID
    lesson_id: z.string().min(1).optional(),   // contentTree code (e.g. "M01.01") or UUID
  }),
}

export type StartExamInput = z.infer<typeof startExamSchema.body>

// ─── Submit Answer ──────────────────────────────────────────────
export const submitAnswerSchema = {
  body: z.object({
    exam_id: z.string().uuid(),
    question_id: z.string().uuid(),
    answer: z.record(z.unknown()),
    time_spent_sec: z.number().int().min(0).max(86_400).optional(),
  }),
}

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema.body>

// ─── Finish Exam ────────────────────────────────────────────────
export const finishExamSchema = {
  body: z.object({
    exam_id: z.string().uuid(),
  }),
}

// ─── Review ─────────────────────────────────────────────────────
export const reviewParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
}

// ─── Response Types ─────────────────────────────────────────────
export interface ExamStartResponse {
  exam_id: string
  kind: string
  duration_sec: number | null
  started_at: string
  items: unknown[]
}

// Success: answer saved without feedback (mock/bolim exams)
export interface ExamSubmitSaved {
  saved: true
}

// Success: answer saved with feedback (mavzu/mashq/exam with feedback)
export interface ExamSubmitFeedback {
  saved: true
  correct: boolean
  explanation_md: string
}

// Error response
export interface ExamSubmitError {
  error: 'sinov_tugagan' | 'vaqt_tugadi'
}

export type ExamSubmitResponse = ExamSubmitSaved | ExamSubmitFeedback | ExamSubmitError

export interface ExamFinishResponse {
  exam_id: string
  total_score: number
  max_score: number
  passed: boolean | null
  breakdown: { group_code: string; jami: number; togri: number }[] | null
  already_finished: boolean
}
