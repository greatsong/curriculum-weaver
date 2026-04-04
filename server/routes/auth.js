/**
 * 인증 라우트
 *
 * 이메일/비밀번호 기반 회원가입, 로그인, 로그아웃 + 프로필 관리.
 * Supabase Auth + users 테이블 연동.
 */
import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { createUser, getUser, updateUser } from '../lib/supabaseService.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/**
 * POST /api/auth/signup
 * 이메일/비밀번호 회원가입
 *
 * @body {{ email: string, password: string, display_name: string, school_name?: string, subject?: string }}
 * @returns {{ user: object, session: object }}
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, display_name, school_name, subject } = req.body

    // 입력값 검증
    if (!email || !password || !display_name) {
      return res.status(400).json({
        error: '이메일, 비밀번호, 표시 이름은 필수입니다.'
      })
    }
    if (password.length < 6) {
      return res.status(400).json({
        error: '비밀번호는 6자 이상이어야 합니다.'
      })
    }

    // Supabase Auth 회원가입
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 이메일 확인 생략 (개발 편의)
      user_metadata: { display_name }
    })

    if (authError) {
      console.error('[auth/signup] Auth 오류:', authError.message)
      // 이미 존재하는 이메일
      if (authError.message.includes('already')) {
        return res.status(409).json({ error: '이미 등록된 이메일입니다.' })
      }
      return res.status(400).json({ error: authError.message })
    }

    // users 테이블에 프로필 생성
    const profile = await createUser({
      id: authData.user.id,
      email,
      display_name,
      school_name: school_name || null,
      subject: subject || null,
    })

    // 세션 생성을 위해 로그인 수행
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    // 관리자 API로 직접 토큰 생성이 안 되므로, 클라이언트에서 로그인하도록 안내
    res.status(201).json({
      user: {
        id: authData.user.id,
        email,
        display_name,
        school_name,
        subject,
      },
      message: '회원가입이 완료되었습니다. 로그인해 주세요.'
    })
  } catch (err) {
    console.error('[auth/signup] 오류:', err.message)
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/auth/login
 * 이메일/비밀번호 로그인
 *
 * @body {{ email: string, password: string }}
 * @returns {{ user: object, session: { access_token: string, refresh_token: string, expires_in: number } }}
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' })
    }

    // Supabase Auth 로그인 (anon 키로 수행)
    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )

    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('[auth/login] 로그인 오류:', error.message)
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
    }

    // users 테이블에서 프로필 가져오기
    const profile = await getUser(data.user.id)

    res.json({
      user: profile || {
        id: data.user.id,
        email: data.user.email,
        display_name: data.user.user_metadata?.display_name || email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      }
    })
  } catch (err) {
    console.error('[auth/login] 오류:', err.message)
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' })
  }
})

/**
 * POST /api/auth/logout
 * 로그아웃 (서버 측 세션 무효화)
 *
 * @header Authorization: Bearer <token>
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Supabase Admin으로 사용자 세션 무효화
    const { error } = await supabaseAdmin.auth.admin.signOut(req.token)

    if (error) {
      // signOut 실패해도 클라이언트에서 토큰 제거하면 되므로 경고만
      console.warn('[auth/logout] 세션 무효화 경고:', error.message)
    }

    res.json({ message: '로그아웃되었습니다.' })
  } catch (err) {
    console.error('[auth/logout] 오류:', err.message)
    // 로그아웃은 실패해도 클라이언트에서 처리 가능
    res.json({ message: '로그아웃되었습니다.' })
  }
})

/**
 * GET /api/auth/me
 * 현재 사용자 프로필 조회
 *
 * @header Authorization: Bearer <token>
 * @returns {{ id, email, display_name, role, school_name, subject, created_at }}
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await getUser(req.user.id)

    if (!profile) {
      // users 테이블에 프로필이 없는 경우 (마이그레이션 이전 사용자 등)
      return res.json({
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.user_metadata?.display_name || req.user.email,
        role: 'teacher',
        school_name: null,
        subject: null,
      })
    }

    res.json(profile)
  } catch (err) {
    console.error('[auth/me] 오류:', err.message)
    res.status(500).json({ error: '프로필 조회 중 오류가 발생했습니다.' })
  }
})

/**
 * PUT /api/auth/me
 * 프로필 수정
 *
 * @header Authorization: Bearer <token>
 * @body {{ display_name?: string, school_name?: string, subject?: string }}
 * @returns {object} 수정된 프로필
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { display_name, school_name, subject } = req.body
    const updateData = {}

    if (display_name !== undefined) updateData.display_name = display_name
    if (school_name !== undefined) updateData.school_name = school_name
    if (subject !== undefined) updateData.subject = subject

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' })
    }

    const profile = await updateUser(req.user.id, updateData)
    res.json(profile)
  } catch (err) {
    console.error('[auth/me] 프로필 수정 오류:', err.message)
    res.status(500).json({ error: '프로필 수정 중 오류가 발생했습니다.' })
  }
})

export default router
