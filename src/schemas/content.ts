import { z } from 'zod'

// ─── Module List ────────────────────────────────────────────────
export const moduleListSchema = {
  querystring: z.object({
    status: z.enum(['published', 'draft', 'archived']).optional(),
    section: z.enum(['specialty', 'professional_standard', 'pedagogy', 'methodology']).optional(),
  }),
}

// ─── Module Detail ──────────────────────────────────────────────
export const moduleDetailSchema = {
  params: z.object({
    id: z.string().min(1),  // UUID or contentTree code
  }),
}

// ─── Lesson Detail ──────────────────────────────────────────────
export const lessonDetailSchema = {
  params: z.object({
    id: z.string().min(1),  // UUID or contentTree code
  }),
}

// ─── Lesson Questions ───────────────────────────────────────────
export const lessonQuestionsSchema = {
  params: z.object({
    id: z.string().min(1),  // UUID or contentTree code
  }),
}

// ─── Check Answer ───────────────────────────────────────────────
export const checkAnswerSchema = {
  body: z.object({
    question_id: z.string().uuid(),
    option_id: z.string().uuid(),
  }),
}

// ─── Response Types ─────────────────────────────────────────────
export interface ModuleResponse {
  id: string
  code: string | null
  title_uz: string
  summary_uz: string | null
  order_idx: number
  exam_section: string | null
  status: string
  exam_question_count: number
  lesson_count: number
}

export interface LessonResponse {
  id: string
  module_id: string
  title_uz: string
  slug: string
  body_mdx: string | null
  blocks: unknown[] | null
  blocks_kind: string | null
  est_minutes: number
  order_idx: number
  status: string
  constructs: { id: string; title_uz: string; code: string }[]
}

export interface LessonQuestionOption {
  id: string
  content_md: string
  order_idx: number
}

/** Learnerga yuboriladigan savol — kalit va explanation YO'Q. */
export interface LessonQuestion {
  id: string
  group_code: string | null
  format: string
  cognitive: string
  difficulty: number
  stem_md: string
  options: LessonQuestionOption[]
}

export interface CheckAnswerResult {
  correct: boolean
  correct_option_id: string
  explanation_md: string | null
}

export interface ConstructResponse {
  id: string
  code: string
  title_uz: string
  description_uz: string | null
  group_code: string
  subject_id: string
}
