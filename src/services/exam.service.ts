import { getAuthedClient } from '../lib/supabase.js'
import { resolveModuleUuid, resolveLessonUuid } from '../lib/resolveIds.js'
import { AppError, NotFoundError } from '../lib/errors.js'
import type { StartExamInput, ExamStartResponse, ExamSubmitResponse, ExamSubmitError, ExamFinishResponse } from '../schemas/exam.js'

/**
 * Exam Service
 *
 * Wraps Supabase RPC calls with proper error handling.
 * All methods require an authenticated user token.
 */
export const examService = {
  /**
   * Start a new exam.
   * - mock → full attestatsiya (50 questions, 120 min)
   * - bolim → module exam (15 questions, 30 min)
   * - mavzu → topic test (unlimited time)
   * - takrorlash → due reviews (15 questions)
   * - zaif → weak area focus (10 questions)
   */
  async start(kind: StartExamInput['kind'], userToken: string, moduleId?: string, lessonId?: string): Promise<ExamStartResponse> {
    const client = getAuthedClient(userToken)

    // Resolve contentTree codes to DB UUIDs before calling RPCs
    let resolvedModuleId: string | null = null
    let resolvedLessonId: string | null = null

    if (kind === 'bolim' && moduleId) {
      resolvedModuleId = await resolveModuleUuid(moduleId)
      if (!resolvedModuleId) {
        throw new AppError(`"${moduleId}" moduli topilmadi`, 404, 'MODULE_NOT_FOUND')
      }
    }
    if (kind === 'mavzu' && lessonId) {
      resolvedLessonId = await resolveLessonUuid(lessonId)
      if (!resolvedLessonId) {
        throw new AppError(`"${lessonId}" mavzusi topilmadi`, 404, 'LESSON_NOT_FOUND')
      }
    }

    let result
    if (kind === 'mavzu' && resolvedLessonId) {
      result = await client.rpc('generate_topic_test', { p_lesson_id: resolvedLessonId })
    } else {
      const args: Record<string, unknown> = { p_kind: kind }
      if (resolvedModuleId) args.p_module_id = resolvedModuleId
      result = await client.rpc('start_exam', args)
    }

    if (result.error) {
      if (result.error.message?.includes('savol_yetarli_emas')) {
        throw new AppError('Savollar bazasi yetarli emas. Iltimos, keyinroq urinib ko\'ring.', 503, 'INSUFFICIENT_POOL')
      }
      if (result.error.message?.includes('savol_yoq')) {
        throw new AppError('Bu mavzu uchun savollar mavjud emas.', 404, 'NO_QUESTIONS')
      }
      if (result.error.message?.includes('blueprint_topilmadi')) {
        throw new AppError('Faol blueprint topilmadi. Administrator bilan bog\'laning.', 503, 'NO_BLUEPRINT')
      }
      if (result.error.message?.includes('auth_required')) {
        throw new AppError('Avtorizatsiyadan o\'tmagansiz', 401, 'AUTH_REQUIRED')
      }
      throw new AppError('Imtihonni boshlashda xatolik', 500, 'EXAM_START_ERROR')
    }

    return result.data as unknown as ExamStartResponse
  },

  /**
   * Submit an answer for a question during an active exam.
   */
  async submit(input: { exam_id: string; question_id: string; answer: Record<string, unknown>; time_spent_sec?: number }, userToken: string): Promise<ExamSubmitResponse> {
    const client = getAuthedClient(userToken)

    const result = await client.rpc('submit_answer', {
      p_exam_id: input.exam_id,
      p_question_id: input.question_id,
      p_answer: input.answer,
      p_time_spent: input.time_spent_sec ?? null,
    })

    if (result.error) {
      if (result.error.message?.includes('sinov_topilmadi')) {
        throw new NotFoundError('Imtihon topilmadi')
      }
      if (result.error.message?.includes('sinov_tugagan')) {
        const err: ExamSubmitError = { error: 'sinov_tugagan' }
        return err
      }
      if (result.error.message?.includes('vaqt_tugadi')) {
        const err: ExamSubmitError = { error: 'vaqt_tugadi' }
        return err
      }
      throw new AppError('Javobni saqlashda xatolik', 500, 'SUBMIT_ERROR')
    }

    return result.data as unknown as ExamSubmitResponse
  },

  /**
   * Finish an exam and calculate the final score.
   */
  async finish(examId: string, userToken: string): Promise<ExamFinishResponse> {
    const client = getAuthedClient(userToken)

    const result = await client.rpc('finish_exam', { p_exam_id: examId })

    if (result.error) {
      if (result.error.message?.includes('sinov_topilmadi')) {
        throw new NotFoundError('Imtihon topilmadi')
      }
      throw new AppError('Imtihonni yakunlashda xatolik', 500, 'FINISH_ERROR')
    }

    return result.data as unknown as ExamFinishResponse
  },

  /**
   * Get a full review of a finished exam with all answers and explanations.
   */
  async review(examId: string, userToken: string): Promise<Record<string, unknown>[]> {
    const client = getAuthedClient(userToken)

    const result = await client.rpc('get_review', { p_exam_id: examId })

    if (result.error) {
      if (result.error.message?.includes('sinov_topilmadi')) {
        throw new NotFoundError('Imtihon topilmadi')
      }
      if (result.error.message?.includes('sinov_tugamagan')) {
        throw new AppError('Imtihon hali tugamagan', 400, 'EXAM_NOT_FINISHED')
      }
      throw new AppError('Tahlilni olishda xatolik', 500, 'REVIEW_ERROR')
    }

    return result.data as Record<string, unknown>[]
  },

  /**
   * Get constructs due for spaced repetition review.
   */
  async getDueReviews(userToken: string): Promise<Record<string, unknown>[]> {
    const client = getAuthedClient(userToken)

    const result = await client.rpc('get_due_reviews')

    if (result.error) {
      throw new AppError('Takrorlash ma\'lumotlarini olishda xatolik', 500, 'DUE_REVIEWS_ERROR')
    }

    return result.data as Record<string, unknown>[]
  },
}
