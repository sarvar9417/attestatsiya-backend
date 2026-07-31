import { supabase } from '../lib/supabase.js'
import { AppError, AuthError, ForbiddenError, NotFoundError } from '../lib/errors.js'
import { resolveLessonUuid } from '../lib/resolveIds.js'
import type {
  AttemptDetail,
  AttemptSummary,
  ListAttemptsResponse,
} from '../schemas/admin.js'

interface ListAttemptsFilters {
  kind?: string
  lesson_id?: string
  user_id?: string
  from?: string
  to?: string
  page: number
  page_size: number
}

/**
 * Token egaligi admin roli bilan tekshiriladi. Qaytarilgan id — adminning o'zi.
 */
async function requireAdminId(userToken: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser(userToken)
  if (error || !data.user) throw new AuthError()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') {
    throw new ForbiddenError('Bu amal uchun admin huquqi kerak')
  }
  return data.user.id
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * GET /api/admin/attempts — urinishlar ro'yxati (admin).
 * Filterlar: kind, lesson_id (UUID yoki kod), user_id, from, to + pagination.
 */
export const adminService = {
  async listAttempts(filters: ListAttemptsFilters, userToken: string): Promise<ListAttemptsResponse> {
    await requireAdminId(userToken)

    let lessonId = filters.lesson_id
    if (lessonId && !isUuid(lessonId)) {
      const resolved = await resolveLessonUuid(lessonId)
      if (!resolved) throw new NotFoundError('Dars topilmadi')
      lessonId = resolved
    }
    const resolvedLessonId: string | undefined = lessonId

    let query = supabase.from('exams').select('*', { count: 'exact' })
    if (filters.kind) query = query.eq('kind', filters.kind)
    if (resolvedLessonId) query = query.eq('lesson_id', resolvedLessonId)
    if (filters.user_id) query = query.eq('user_id', filters.user_id)
    if (filters.from) query = query.gte('started_at', filters.from)
    if (filters.to) query = query.lte('started_at', filters.to)

    const offset = (filters.page - 1) * filters.page_size
    const { data: exams, count, error } = await query
      .order('started_at', { ascending: false })
      .range(offset, offset + filters.page_size - 1)

    if (error) throw new AppError('So\'rov bajarilmadi', 500, 'ADMIN_QUERY_ERROR')

    const examRows = exams || []
    const items: AttemptSummary[] = []

    if (examRows.length > 0) {
      const examIds = examRows.map(e => e.id)
      const lessonIds = [...new Set(examRows.map(e => e.lesson_id).filter(Boolean))] as string[]
      const userIds = [...new Set(examRows.map(e => e.user_id))] as string[]

      const [{ data: lessons }, { data: itemsRows }, { data: profiles }] = await Promise.all([
        lessonIds.length > 0
          ? supabase.from('lessons').select('id, slug, title_uz').in('id', lessonIds)
          : Promise.resolve({ data: [] }),
        supabase.from('exam_items').select('exam_id').in('exam_id', examIds).not('answered_at', 'is', null),
        supabase.from('profiles').select('id, display_name').in('id', userIds),
      ])

      const lessonBy = new Map((lessons || []).map(l => [l.id, l]))
      const profileBy = new Map((profiles || []).map(p => [p.id, p]))
      const answeredBy = new Map<string, number>()
      for (const row of itemsRows || []) {
        answeredBy.set(row.exam_id, (answeredBy.get(row.exam_id) ?? 0) + 1)
      }

      const emails = new Map<string, string>()
      for (const uid of userIds) {
        const { data: user } = await supabase.auth.admin.getUserById(uid)
        if (user?.user?.email) emails.set(uid, user.user.email)
      }

      for (const exam of examRows) {
        const lesson = exam.lesson_id ? lessonBy.get(exam.lesson_id) : undefined
        items.push({
          exam_id: exam.id,
          user_id: exam.user_id,
          email: emails.get(exam.user_id) ?? null,
          display_name: profileBy.get(exam.user_id)?.display_name ?? null,
          kind: exam.kind,
          lesson_id: exam.lesson_id,
          lesson_slug: lesson?.slug ?? null,
          started_at: exam.started_at,
          finished_at: exam.finished_at,
          total_score: exam.total_score,
          max_score: exam.max_score,
          passed: exam.passed,
          answered_count: answeredBy.get(exam.id) ?? 0,
          breakdown: exam.breakdown,
        })
      }
    }

    return {
      items,
      total: count ?? 0,
      page: filters.page,
      page_size: filters.page_size,
    }
  },

  /**
   * GET /api/admin/attempts/:id — bitta urinishning to'liq detali (admin).
   * Savol matni, ko'rsatilgan variant tartibi, foydalanuvchi javobi,
   * to'g'ri javob va izoh server tomonda biriktiriladi.
   */
  async getAttemptDetail(examId: string, userToken: string): Promise<AttemptDetail> {
    await requireAdminId(userToken)

    const { data: exam } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .maybeSingle()
    if (!exam) throw new NotFoundError('Sinov topilmadi')

    const [lessonRow, profileRow, itemsResult] = await Promise.all([
      exam.lesson_id
        ? supabase.from('lessons').select('slug').eq('id', exam.lesson_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('profiles').select('display_name').eq('id', exam.user_id).maybeSingle(),
      supabase.from('exam_items').select('*').eq('exam_id', exam.id).order('order_idx', { ascending: true }),
    ])

    const { data: user } = await supabase.auth.admin.getUserById(exam.user_id)

    const itemRows = itemsResult.data || []
    const items: AttemptDetail['items'] = []

    if (itemRows.length > 0) {
      const questionIds = itemRows.map(i => i.question_id)
      const [{ data: questions }, { data: options }, { data: keys }] = await Promise.all([
        supabase.from('questions').select('id, group_code, format, stem_md').in('id', questionIds),
        supabase.from('question_options').select('id, question_id, side, content_md, order_idx').in('question_id', questionIds),
        supabase.from('question_keys').select('question_id, payload, explanation_md').in('question_id', questionIds),
      ])

      const questionBy = new Map((questions || []).map(q => [q.id, q]))
      const optionsBy = new Map<string, Array<{ id: string; side: string | null; content_md: string | null; order_idx: number }>>()
      for (const opt of options || []) {
        const list = optionsBy.get(opt.question_id) ?? []
        list.push({ id: opt.id, side: opt.side, content_md: opt.content_md, order_idx: opt.order_idx })
        optionsBy.set(opt.question_id, list)
      }
      const keyBy = new Map((keys || []).map(k => [k.question_id, k]))

      for (const row of itemRows) {
        const question = questionBy.get(row.question_id)
        const rawOptions = optionsBy.get(row.question_id) ?? []
        const order = (row.option_order as string[] | null) ?? null
        const ordered = order
          ? [...rawOptions].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
          : [...rawOptions].sort((a, b) => (a.side ?? '').localeCompare(b.side ?? '') || a.order_idx - b.order_idx)

        const key = keyBy.get(row.question_id)
        const payload = key?.payload as { correct_option_id?: string } | null

        items.push({
          item_id: row.id,
          order_idx: row.order_idx,
          question_id: row.question_id,
          group_code: question?.group_code ?? null,
          format: question?.format ?? null,
          stem_md: question?.stem_md ?? null,
          options: ordered.map(o => ({ id: o.id, side: o.side, content_md: o.content_md })),
          user_answer: row.user_answer,
          is_correct: row.is_correct,
          score: row.score,
          time_spent_sec: row.time_spent_sec,
          flagged: row.flagged,
          answered_at: row.answered_at,
          correct_option_id: payload?.correct_option_id ?? null,
          explanation_md: key?.explanation_md ?? null,
        })
      }
    }

    return {
      exam_id: exam.id,
      user_id: exam.user_id,
      email: user?.user?.email ?? null,
      display_name: profileRow.data?.display_name ?? null,
      kind: exam.kind,
      lesson_id: exam.lesson_id,
      lesson_slug: lessonRow.data?.slug ?? null,
      started_at: exam.started_at,
      finished_at: exam.finished_at,
      total_score: exam.total_score,
      max_score: exam.max_score,
      passed: exam.passed,
      breakdown: exam.breakdown,
      items,
    }
  },
}
