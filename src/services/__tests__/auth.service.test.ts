import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authService } from '../auth.service.js'

const { mockAuth, mockFrom } = vi.hoisted(() => {
  const mockAuth = {
    getUser: vi.fn(),
    admin: {
      createUser: vi.fn(),
      updateUserById: vi.fn(),
    },
  }
  const mockFrom = vi.fn()
  return { mockAuth, mockFrom }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: mockAuth,
  })),
}))

function buildProfileChain(profile: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue(profile ? { data: profile, error: null } : { data: null, error: null }),
    update: vi.fn().mockReturnThis(),
  }
}

const USER = { id: 'user-1', email: 'test@test.com' }

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(buildProfileChain({ display_name: 'Ali', role: 'user', is_blocked: false }))
  })

  it('register: rejects full_name longer than 100 chars without calling Supabase', async () => {
    await expect(
      authService.register({
        email: 'test@test.com',
        password: 'secret123',
        full_name: 'A'.repeat(101),
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })

    expect(mockAuth.admin.createUser).not.toHaveBeenCalled()
  })

  it('register: copies display_name into profiles on success', async () => {
    mockAuth.admin.createUser.mockResolvedValue({
      data: { user: USER },
      error: null,
    })

    const result = await authService.register({
      email: 'test@test.com',
      password: 'secret123',
      full_name: 'Ali Valiyev',
    })

    expect(result.user_id).toBe('user-1')
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(mockAuth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ user_metadata: { name: 'Ali Valiyev' } })
    )
  })

  it('updateProfile: throws PROFILE_UPDATE_ERROR when profiles update fails', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: USER }, error: null })
    mockAuth.admin.updateUserById.mockResolvedValue({ data: { user: USER }, error: null })
    mockFrom.mockReturnValue(
      Object.assign(buildProfileChain({ display_name: 'Ali', role: 'user', is_blocked: false }), {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
        }),
      })
    )

    await expect(
      authService.updateProfile({ full_name: 'Bobur Aliyev' }, 'token-1')
    ).rejects.toMatchObject({ code: 'PROFILE_UPDATE_ERROR' })
  })

  it('updateProfile: throws AuthError when token is invalid', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })

    await expect(
      authService.updateProfile({ full_name: 'Bobur Aliyev' }, 'bad-token')
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })

    expect(mockAuth.admin.updateUserById).not.toHaveBeenCalled()
  })
})
