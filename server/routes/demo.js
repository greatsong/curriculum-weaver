/**
 * 데모 라우트 — AI 자동 수업 설계 시뮬레이션
 *
 * 로그인 사용자 전용. 결과는 워크스페이스 프로젝트로 Supabase에 저장.
 * AI 생성을 2분할하여 토큰 초과 방지:
 *   1차: prep ~ A-2-2 (10개 절차) — 보드 + 채팅
 *   2차: Ds-1-1 ~ E-2-1 (9개 절차, 1차 요약 컨텍스트) — 보드 + 채팅
 * 채팅 기록: 교과별 교사 페르소나 + AI 공동설계자 대화 시뮬레이션
 * 결과물은 읽기 전용 (status: 'simulation')
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/auth.js'
import { createProject, updateProject, upsertDesign, createMessage, getMemberRole, addStandardToProject } from '../lib/supabaseService.js'
import { PROCEDURES, BOARD_TYPES, BOARD_TYPE_LABELS, PROCEDURE_LIST } from 'curriculum-weaver-shared/constants.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { getStandardsForSubjects } from '../lib/standardsValidator.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const demoRouter = Router()

// ── 절차 분할 정의 ──
const PHASE1_CODES = ['prep', 'T-1-1', 'T-1-2', 'T-2-1', 'T-2-2', 'T-2-3', 'A-1-1', 'A-1-2', 'A-2-1', 'A-2-2']
const PHASE2_CODES = ['Ds-1-1', 'Ds-1-2', 'Ds-1-3', 'Ds-2-1', 'Ds-2-2', 'DI-1-1', 'DI-2-1', 'E-1-1', 'E-2-1']
const ALL_CODES = [...PHASE1_CODES, ...PHASE2_CODES]
const procedureNameMap = Object.fromEntries(PROCEDURE_LIST.map((p) => [p.code, p.name]))
const MAX_DEMO_DESCRIPTION_LENGTH = 1500

// ── 교사 이름 풀 (교과별 자연스러운 한국 이름) ──
// 각 교과 첫 번째 이름은 "일반형", 두 번째는 "창의·모험형" 성향으로 우선 배치
const TEACHER_NAME_POOL = {
  국어: ['김하윤', '이서연', '박지민', '최예린'],
  수학: ['황수빈', '정민재', '김도현', '이하은'],
  사회: ['박소율', '김시우', '이지호', '정하린'],
  과학: ['정효진', '김태양', '이주원', '박서진'],
  영어: ['한소희', '이준서', '김하늘', '장예은'],
  도덕: ['윤서진', '김민서', '이채원', '박가을'],
  정보: ['오현우', '김서율', '이도윤', '장시현'],
  음악: ['송하람', '김율', '이소리', '박선율'],
  미술: ['홍채린', '김가온', '이단비', '최예솔'],
  체육: ['강민호', '김하준', '이시율', '박건우'],
  기술가정: ['신유진', '김도담', '이나윤', '정지안'],
  한문: ['조민경', '김지한', '이승현', '박서준'],
}
const DEFAULT_NAMES = ['서유라', '한지수', '노은서', '문하영']

// 성격 트레이트: 창의·모험형(bold), 신중·분석형(analytical), 실천·구현형(practical)
const PERSONALITY_TRAITS = {
  bold: {
    label: '창의·모험형',
    description: '틀을 깨는 아이디어를 자주 제시하고, 학생 중심 프로젝트 수업을 선호하며, "일단 해보자!"는 실험정신을 가진 교사',
    speech: '적극적이고 도전적인 제안을 하며, 다소 파격적인 아이디어도 주저하지 않음',
  },
  analytical: {
    label: '신중·분석형',
    description: '교육과정 성취기준을 꼼꼼히 분석하고, 근거 기반 설계를 중시하며, 체계적인 평가 설계를 강점으로 가진 교사',
    speech: '논리적이고 체계적인 발언을 하며, 교육과정과의 정합성을 자주 확인함',
  },
  practical: {
    label: '실천·구현형',
    description: '현장 적용 가능성을 항상 고려하고, 학생들의 실제 반응을 예측하며, 구체적인 활동 아이디어를 잘 내는 교사',
    speech: '현실적이고 구체적인 제안을 하며, "학생들이 실제로..."라는 표현을 자주 사용',
  },
}

function pickTeacherNames(subjects) {
  const used = new Set()
  // 교사 수에 따라 성격 배분: 반드시 1~2명은 bold(창의·모험형)
  const traitOrder = subjects.length <= 2
    ? ['bold', 'analytical']
    : subjects.length <= 3
      ? ['bold', 'analytical', 'practical']
      : ['bold', 'analytical', 'practical', 'bold', ...Array(subjects.length - 4).fill('practical')]

  return subjects.map((subj, idx) => {
    const pool = TEACHER_NAME_POOL[subj] || DEFAULT_NAMES
    let selectedName = null
    for (const name of pool) {
      if (!used.has(name)) {
        used.add(name)
        selectedName = name
        break
      }
    }
    if (!selectedName) {
      selectedName = DEFAULT_NAMES[idx % DEFAULT_NAMES.length]
      used.add(selectedName)
    }
    const trait = traitOrder[idx] || 'practical'
    return { name: selectedName, subject: subj, trait, personality: PERSONALITY_TRAITS[trait] }
  })
}

/**
 * JSON 파싱 (3단계 폴백 + 상세 로깅)
 */
function parseAIResponse(fullText, label) {
  const jsonMatch = fullText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].trim()) }
    catch (e) { console.warn(`[demo][${label}] 코드블록 JSON 파싱 실패:`, e.message) }
  }
  try { return JSON.parse(fullText.trim()) }
  catch (e) { console.warn(`[demo][${label}] 전체 텍스트 파싱 실패:`, e.message) }

  const start = fullText.indexOf('{')
  const end = fullText.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(fullText.slice(start, end + 1)) }
    catch (e) { console.warn(`[demo][${label}] 부분 파싱 실패:`, e.message) }
  }

  console.error(`[demo][${label}] 모든 파싱 실패. 응답 길이: ${fullText.length}`)
  console.error(`[demo][${label}] 응답 시작: ${fullText.slice(0, 300)}`)
  console.error(`[demo][${label}] 응답 끝: ${fullText.slice(-300)}`)
  return {}
}

/**
 * 보드 스키마 텍스트 생성 (테이블 데이터 형식 명시)
 */
function buildSchemaText(codes) {
  return codes
    .map((code) => {
      const boardType = BOARD_TYPES[code]
      const schema = BOARD_SCHEMAS[boardType]
      if (!schema) return `[${code}] ${procedureNameMap[code] || code}\n  자유 텍스트`

      const fieldDescs = schema.fields.map((f) => {
        let desc = `  - ${f.name} (${f.label}, ${f.type}): ${f.description || ''}`
        if (f.type === 'table' && f.columns) {
          const colNames = f.columns.map((c) => c.name)
          const colLabels = f.columns.map((c) => c.label)
          desc += `\n    열: ${colLabels.join(', ')}`
          // 테이블 데이터 형식 명시: 배열 of 객체
          const exampleRow = '{' + colNames.map((n) => `"${n}": "..."`).join(', ') + '}'
          desc += `\n    형식: [${exampleRow}, ...]  ← 반드시 이 배열 형식으로! 최소 2~4행`
        }
        if (f.type === 'list') {
          desc += '\n    형식: ["항목1", "항목2", ...]  ← 문자열 배열'
        }
        if (f.itemSchema) {
          const itemFields = Object.entries(f.itemSchema).map(([k, v]) => `"${k}": "${v.label}"`).join(', ')
          desc += `\n    형식: [{${itemFields}}, ...]  ← 객체 배열`
        }
        return desc
      }).join('\n')

      return `[${code}] ${procedureNameMap[code] || code}\n${fieldDescs}`
    })
    .join('\n\n')
}

/**
 * AI 스트리밍 호출 + 절차 감지 + SSE 전송
 */
async function streamAndParse({ systemPrompt, userPrompt, codes, startIndex, label, sendEvent }) {
  let fullText = ''
  let tokenCount = 0
  let lastTokenEvent = 0
  const detectedProcedures = new Set()

  console.log(`[demo][${label}] AI 스트리밍 시작 — ${codes.length}개 절차`)

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 64000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }, {
    headers: { 'anthropic-beta': 'output-128k-2025-02-19' },
  })

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text
        tokenCount++

        if (tokenCount - lastTokenEvent >= 300) {
          lastTokenEvent = tokenCount
          sendEvent({ type: 'heartbeat', tokens: tokenCount, phase: label })
        }

        for (const code of codes) {
          if (!detectedProcedures.has(code) && fullText.includes(`"${code}"`)) {
            detectedProcedures.add(code)
            const globalIndex = startIndex + detectedProcedures.size
            const nextIdx = codes.indexOf(code) + 1
            const nextCode = nextIdx < codes.length ? codes[nextIdx] : (label === '1차' ? PHASE2_CODES[0] : null)
            sendEvent({
              type: 'progress',
              procedure: code,
              name: procedureNameMap[code] || code,
              index: globalIndex,
              total: ALL_CODES.length,
              nextProcedure: nextCode || null,
              nextName: nextCode ? (procedureNameMap[nextCode] || nextCode) : null,
            })
          }
        }
      }
    }
  } catch (streamErr) {
    // 스트림 도중 에러 (disconnect 등) — 지금까지 수신한 데이터로 계속 진행
    console.warn(`[demo][${label}] 스트림 에러 (수집된 ${tokenCount}토큰으로 계속):`, streamErr?.message)
  }

  console.log(`[demo][${label}] AI 스트리밍 완료 — ${tokenCount}토큰, ${detectedProcedures.size}/${codes.length}개 절차 감지`)

  // 토큰이 충분하면 파싱 시도
  if (fullText.length < 100) {
    console.warn(`[demo][${label}] 응답이 너무 짧음 (${fullText.length}자) — 빈 결과 반환`)
    return {}
  }

  const result = parseAIResponse(fullText, label)
  console.log(`[demo][${label}] 파싱 결과: ${Object.keys(result).length}개 키 — [${Object.keys(result).join(', ')}]`)
  return result
}

/**
 * 1차 요약 생성 (2차 호출 컨텍스트용)
 * 보드 내용 + 핵심 대화 포인트를 포함하여 2차에서 자연스럽게 이어갈 수 있도록 함
 */
function buildPhase1Summary(phase1Data) {
  const parts = []
  const keyProcedures = ['prep', 'T-1-1', 'T-1-2', 'T-2-1', 'A-1-1', 'A-1-2', 'A-2-1', 'A-2-2']
  for (const code of keyProcedures) {
    const entry = phase1Data[code]
    if (!entry) continue
    const boardSummary = entry.board ? JSON.stringify(entry.board).slice(0, 300) : ''
    // 대화에서 핵심 발언 1~2개 추출
    const convoHighlights = (entry.conversation || [])
      .filter((t) => t.message?.length > 30)
      .slice(0, 2)
      .map((t) => `  "${t.speaker}: ${t.message.slice(0, 100)}..."`)
      .join('\n')
    parts.push(`### ${procedureNameMap[code] || code}\n보드: ${boardSummary}${convoHighlights ? `\n주요 논의:\n${convoHighlights}` : ''}`)
  }
  return parts.length > 0 ? parts.join('\n\n') : '(1차 결과 없음)'
}

function formatTeacherIntentBlock(text) {
  return text
    .trim()
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `| ${line}`)
    .join('\n')
}

/**
 * POST /api/demo/generate
 * 시뮬레이션 생성 (SSE 스트리밍)
 */
demoRouter.post('/generate', requireAuth, async (req, res) => {
  const { workspaceId, grade, subjects, topic, description } = req.body
  const userId = req.user.id
  const normalizedDescription = typeof description === 'string' ? description.trim() : ''

  if (!workspaceId) {
    return res.status(400).json({ error: '워크스페이스 ID가 필요합니다.' })
  }
  if (!grade || !subjects?.length || subjects.length < 2 || !topic?.trim()) {
    return res.status(400).json({
      error: '학년, 교과(2개 이상), 주제 키워드는 필수입니다.',
    })
  }

  // P0 #1: 워크스페이스 멤버십 검증
  const memberRole = await getMemberRole(workspaceId, userId)
  if (!memberRole) {
    return res.status(403).json({ error: '해당 워크스페이스의 멤버가 아닙니다.' })
  }

  // P2 #10: 입력 길이 제한
  if (topic.length > 100) {
    return res.status(400).json({ error: '주제 키워드는 100자 이내로 입력하세요.' })
  }
  if (normalizedDescription.length > MAX_DEMO_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `설계 의도/참고사항은 ${MAX_DEMO_DESCRIPTION_LENGTH.toLocaleString()}자 이내로 입력하세요.` })
  }

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let projectId = null
  let aborted = false

  const sendEvent = (data) => {
    if (aborted || res.writableEnded || res.destroyed) return
    try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch { aborted = true }
  }

  const safeEnd = () => {
    if (!res.writableEnded && !res.destroyed) {
      try { res.end() } catch {}
    }
  }

  res.on('close', () => {
    aborted = true
    console.log('[demo] 클라이언트 연결 끊김 (disconnect/취소) — 서버는 계속 진행')
  })

  try {
    // ── 1. 프로젝트 생성 (generating 상태) ──
    const projectTitle = `[시뮬레이션] ${topic}`
    console.log(`[demo] 프로젝트 생성 — workspace: ${workspaceId}, 주제: ${topic}`)

    // P0 #2: generating 상태로 생성 → 성공 시 simulation, 실패 시 failed
    const project = await createProject(workspaceId, {
      title: projectTitle,
      description: normalizedDescription || `AI 시뮬레이션으로 자동 생성된 ${grade} ${subjects.join('+')} 융합수업 설계`,
      current_procedure: 'prep',
      status: 'generating',
    })
    projectId = project.id
    console.log(`[demo] 프로젝트 생성 완료 — id: ${projectId}`)

    sendEvent({ type: 'started', projectId, workspaceId })

    // ── 1.5. 성취기준 선별: 전체 후보 → AI가 주제 기반 핵심 선별 → project_standards 저장 ──
    const { standards: allCandidates } = getStandardsForSubjects(subjects, grade)
    console.log(`[demo] 성취기준 후보: ${allCandidates.length}개 (${subjects.join(', ')} / ${grade})`)

    let selectedStandards = allCandidates
    let standardsText = ''

    // 후보가 20개 이상이면 AI로 주제 관련 핵심만 선별
    if (allCandidates.length > 20 && topic) {
      sendEvent({ type: 'heartbeat', phase: '성취기준 선별', tokens: 0 })
      try {
        const candidateList = allCandidates.map(s => {
          let line = `${s.code} [${s.subject}] ${s.content}`
          if (s.area) line += ` (영역: ${s.area})`
          return line
        }).join('\n')
        const selectionResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{ role: 'user', content: `당신은 2022 개정 교육과정 기반 융합수업 설계 전문가입니다.
아래 프로젝트에 가장 적합한 성취기준을 교과별 3~5개씩 선별하세요.

## 프로젝트 정보
대상: ${grade}
교과: ${subjects.join(', ')}
주제: ${topic}
${description ? `설계 의도: ${description}` : ''}

## 선별 기준 (5가지 — 모두 고려할 것)

1. **내용 연계성**: 주제 "${topic}"의 핵심 개념·지식과 직접 관련되는 성취기준
   - 표면적 키워드 일치가 아니라, 실질적으로 해당 주제를 다루는 데 필요한 지식인지 판단

2. **과정·기능 융합 가능성**: 다른 교과와 공유할 수 있는 탐구 과정·기능을 포함하는 성취기준
   - 예: "자료를 수집하고 분석하여"(과학) ↔ "통계적으로 해석하여"(수학) → 과정이 연결됨

3. **교과 간 시너지**: 교과 A에서 산출된 결과가 교과 B의 입력이 되는 관계
   - 예: 수학에서 데이터 분석 → 사회에서 해석 및 의사결정 → 국어에서 보고서 작성

4. **핵심 아이디어 연결**: 해당 단원/영역의 빅아이디어가 주제와 맞닿는 성취기준
   - 영역(area) 정보를 참고하여 단원의 큰 흐름과 주제의 연결점 확인

5. **학습 경험의 실제성**: 학생이 실제 맥락에서 체험할 수 있는 활동으로 이어지는 성취기준
   - 추상적 개념만이 아니라, 프로젝트 활동과 연결 가능한 것 우선

## 후보 성취기준 (${allCandidates.length}개) — 이 목록에서만 선택할 것!
${candidateList}

## 응답 형식
위 목록에 있는 코드만, 한 줄에 하나씩 나열하세요.
새로운 코드를 절대 만들지 마세요.

선택 코드:` }],
        })

        const aiText = selectionResponse.content[0]?.text || ''
        const codeMatches = aiText.match(/\[[\d\w가-힣 ]+-[\d]+-[\d]+\]/g) || []
        const selectedCodes = new Set(codeMatches)

        if (selectedCodes.size >= 4) {
          selectedStandards = allCandidates.filter(s => selectedCodes.has(s.code))
          console.log(`[demo] AI 선별: ${allCandidates.length}개 → ${selectedStandards.length}개`)
        } else {
          // AI 선별 실패 시 키워드 매칭 폴백
          const keywords = topic.split(/\s+/).map(k => k.toLowerCase())
          const scored = allCandidates.map(s => {
            const text = `${s.content} ${s.area || ''} ${(s.keywords || []).join(' ')}`.toLowerCase()
            let score = keywords.filter(k => text.includes(k)).length
            return { std: s, score }
          }).sort((a, b) => b.score - a.score)
          // 교과당 최대 5개
          const perSubject = {}
          selectedStandards = scored.filter(({ std }) => {
            const sg = std.subject_group || std.subject
            if (!perSubject[sg]) perSubject[sg] = 0
            if (perSubject[sg] >= 5) return false
            perSubject[sg]++
            return true
          }).map(({ std }) => std)
          console.log(`[demo] 키워드 폴백 선별: ${selectedStandards.length}개`)
        }
      } catch (e) {
        console.warn(`[demo] AI 선별 실패, 전체 사용:`, e.message)
      }
    }

    // 선별된 성취기준을 project_standards에 저장
    let linkedCount = 0
    for (const std of selectedStandards) {
      try { await addStandardToProject(projectId, std.id, userId, false); linkedCount++ } catch { /* 중복 무시 */ }
    }
    console.log(`[demo] 성취기준 ${linkedCount}개를 프로젝트에 연결`)

    // 프롬프트용 텍스트 생성 (선별된 것만)
    const bySubject = {}
    for (const s of selectedStandards) {
      const key = s.subject_group || s.subject
      if (!bySubject[key]) bySubject[key] = []
      bySubject[key].push(s)
    }
    standardsText = Object.entries(bySubject)
      .map(([subj, stds]) => `### ${subj} (${stds.length}개)\n${stds.map(s => `  ${s.code} ${s.content}`).join('\n')}`)
      .join('\n')

    // ── 2. 교사 페르소나 생성 ──
    const teachers = pickTeacherNames(subjects)
    const teacherListText = teachers.map((t) => `${t.name}(${t.subject})`).join(', ')
    console.log(`[demo] 교사 페르소나: ${teacherListText}`)

    // ── 3. 프롬프트 빌드 ──
    const teacherIntentBlock = normalizedDescription
      ? formatTeacherIntentBlock(normalizedDescription)
      : ''

    const teacherContext = teacherIntentBlock
      ? `\n\n## 교사의 설계 의도 (최우선 반영 사항)
교사가 아래 내용을 직접 남겼습니다. 아래 블록은 교사의 원문이므로, 요약 과정에서 빠뜨리지 말고 핵심 조건을 모든 절차에 반영하세요:
[교사 입력 시작]
${teacherIntentBlock}
[교사 입력 끝]

위 교사 의도를 반영하여:
- prep(학습자 맥락)에서 이 의도와 연결되는 학습자 상황을 구체적으로 서술하세요
- T 단계(팀 비전, 설계 방향)에서 이 의도가 팀의 핵심 가치로 드러나야 합니다
- A 단계(탐색, 연결)에서 이 의도와 관련된 교과 연결점을 중심으로 설계하세요
- D 단계(설계, 개발, 실행)에서 이 의도를 구현하는 구체적 활동과 산출물을 만드세요
- E 단계(평가, 성찰)에서 이 의도가 얼마나 달성되었는지 평가 기준에 반영하세요`
      : ''

    const teacherProfileText = teachers.map((t) =>
      `- ${t.name} (${t.subject} 교사) — [${t.personality.label}] ${t.personality.description}\n  대화 스타일: ${t.personality.speech}`
    ).join('\n')

    const baseSystemPrompt = `당신은 한국 교육과정 기반 융합수업 설계 전문가입니다.
TADDs-DIE 협력적 수업설계 모형에 따라, 교사들의 대화와 설계 결과물을 함께 생성하세요.

## 참여 교사 (각 교사의 성격과 대화 스타일을 반드시 반영할 것)
${teacherProfileText}

## 핵심 원칙
1. 교사가 제공한 학년, 교과, 주제, 설계 의도가 설계의 최상위 기준입니다.
2. 각 절차마다 교사들이 자연스럽게 대화하며 설계 결과에 도달하는 과정을 시뮬레이션합니다.
3. 교과 간 융합은 주제를 중심으로 유기적으로 연결되어야 합니다.
4. 교사들의 대화는 각자의 교과 전문성 + 고유 성격이 드러나야 합니다.
   - 창의·모험형 교사는 파격적인 아이디어, 학생 주도 활동, 새로운 시도를 적극 제안합니다.
   - 신중·분석형 교사는 교육과정 근거, 체계적 접근, 평가 기준 등을 꼼꼼히 챙깁니다.
   - 실천·구현형 교사는 현장 경험, 학생 반응 예측, 구체적 활동 방법을 제시합니다.
5. AI 공동설계자는 교사들의 논의를 정리하고, 교육학적 근거를 제시하며, 구체적 방안을 제안합니다.

## 대화 연속성 (매우 중요!)
절차가 순서대로 진행됩니다. 각 절차의 대화는 반드시 이전 절차의 논의를 참조해야 합니다:
- "아까 prep에서 말씀하신 것처럼...", "앞서 팀 비전으로 정한 ... 에 맞춰서..."
- 이전 절차에서 합의된 내용을 언급하며 자연스럽게 이어가세요.
- 교사들이 이전 대화 내용을 기억하고, 누적된 논의 위에 새로운 아이디어를 쌓아가는 느낌이어야 합니다.

## 형식 지침
각 절차마다 "board"(보드 데이터)와 "conversation"(대화 기록)을 포함하세요.
conversation은 4~7턴의 대화 배열이며, 각 턴은:
  { "speaker": "이름(교과)" 또는 "AI 공동설계자", "message": "대화 내용" }

- 대화는 해당 절차에서 실제로 논의할 법한 내용이어야 합니다.
- 각 교사가 최소 1번은 발언해야 합니다.
- AI 공동설계자는 교사들 논의 중간이나 끝에서 정리·제안 역할로 1~2회 등장합니다.
- 현실적이고 교육적으로 의미 있는 내용을 작성하세요.
- 응답은 반드시 유효한 JSON 객체여야 합니다. 마크다운 코드블록으로 감싸지 마세요.

## 성취기준 사용 규칙 (절대 준수 — 시스템이 자동 차단합니다!)
아래에 제공되는 "사용 가능한 성취기준 목록"에 있는 코드와 내용만 사용하세요.
- 성취기준 코드를 절대 임의로 만들지 마세요. DB에 없는 코드는 시스템이 자동 삭제합니다.
- 성취기준 내용을 변형하지 마세요. 원문 그대로 복사해야 합니다.
- A-2-1 보드의 code, content 필드는 아래 목록에서 그대로 복사하세요. AI가 분석할 부분은 knowledge/process/values 열뿐입니다.
- 대화에서 성취기준을 언급할 때도 아래 목록의 코드를 정확히 사용하세요.

## 보드 데이터 형식 주의 (매우 중요!)
- table 타입 필드: 반드시 객체 배열로 생성. 예: [{"phase":"T","goal":"...","result":"...","improvement":"..."}]
  빈 배열 []로 두지 마세요! 최소 2~4개 행을 채우세요.
- list 타입 필드: 문자열 배열. 예: ["항목1", "항목2"]
- itemSchema가 있는 필드: 해당 키를 포함하는 객체 배열
- text/textarea 필드: 문자열
${teacherContext}

## 사용 가능한 성취기준 목록 (이 목록에서만 선택할 것!)
${standardsText || '(해당 교과/학년의 성취기준 데이터가 없습니다. 성취기준 코드를 생성하지 마세요.)'}`

    const userPromptBase = `대상: ${grade}
교과: ${subjects.join(', ')}
주제: ${topic}
${teacherIntentBlock ? `교사 의도 원문:\n[교사 입력 시작]\n${teacherIntentBlock}\n[교사 입력 끝]` : ''}`

    // ── 4. 1차 호출: prep ~ A-2-2 ──
    console.log('[demo] === 1차 호출 시작 (prep ~ A-2-2) ===')
    const phase1Schema = buildSchemaText(PHASE1_CODES)
    const phase1System = `${baseSystemPrompt}\n\n## 보드 스키마\n${phase1Schema}`
    const phase1User = `다음 조건으로 융합수업 설계의 전반부(준비~분석)를 생성하세요:

${userPromptBase}

생성할 절차: ${PHASE1_CODES.join(', ')}

대화 흐름 가이드:
- prep: 교사들이 처음 만나 주제에 대해 논의하는 분위기. 학습자 실태에 대한 경험 공유.
- T-1-1~T-2-3: 팀 비전을 세우고, 설계 방향을 잡으며, 역할을 나누는 과정.
  이전 절차의 논의를 "아까 말씀하신 것처럼..."으로 자연스럽게 이어감.
- A-1-1~A-2-2: 성취기준을 탐색하고, 주제와 연결하며, 통합 목표를 세우는 과정.
  T 단계에서 정한 방향을 근거로 분석이 진행됨.

JSON 형식:
{
  "prep": {
    "board": { 보드 스키마에 맞는 데이터 },
    "conversation": [
      { "speaker": "${teachers[0].name}(${teachers[0].subject})", "message": "..." },
      { "speaker": "AI 공동설계자", "message": "..." }
    ]
  },
  "T-1-1": { "board": {...}, "conversation": [...] },
  ...
}

반드시 유효한 JSON만 응답하세요. 설명 텍스트나 마크다운 코드블록 없이 순수 JSON만 반환하세요.`

    const phase1Data = await streamAndParse({
      systemPrompt: phase1System,
      userPrompt: phase1User,
      codes: PHASE1_CODES,
      startIndex: 0,
      label: '1차',
      sendEvent,
    })

    // 1차 결과 저장 (보드 + 채팅) — 성취기준 검증은 upsertDesign 게이트키퍼가 처리
    let phase1Saved = 0
    for (const [code, data] of Object.entries(phase1Data)) {
      if (!BOARD_TYPES[code] || !data) continue
      const boardContent = data.board || data
      const conversation = data.conversation || []
      try {
        await upsertDesign(projectId, code, boardContent, userId)
        phase1Saved++
        // 채팅 기록 저장
        for (const turn of conversation) {
          const isAI = turn.speaker === 'AI 공동설계자' || turn.speaker?.includes('AI')
          await createMessage({
            project_id: projectId,
            sender_type: isAI ? 'ai' : 'teacher',
            content: turn.message,
            procedure_context: code,
            sender_name: turn.speaker?.replace(/\(.*\)/, '').trim() || null,
            sender_subject: turn.speaker?.match(/\((.+)\)/)?.[1] || null,
          }).catch((e) => console.warn(`[demo] 메시지 저장 실패 (${code}):`, e.message))
        }
        console.log(`[demo][1차] 저장 완료: ${code} (보드+${conversation.length}턴)`)
      } catch (err) {
        console.warn(`[demo][1차] 저장 실패 (${code}):`, err.message)
      }
    }
    console.log(`[demo] 1차 저장 완료: ${phase1Saved}/${PHASE1_CODES.length}개`)
    sendEvent({ type: 'phase_complete', phase: 1, saved: phase1Saved, total: PHASE1_CODES.length })

    // ── 5. 2차 호출: Ds-1-1 ~ E-2-1 ──
    // disconnect 되어도 서버에서 끝까지 생성 (모바일 백그라운드 전환 대응)
    if (aborted) {
      console.log('[demo] 클라이언트 disconnect — 서버에서 2차 호출 계속 진행')
    }
    console.log('[demo] === 2차 호출 시작 (Ds-1-1 ~ E-2-1) ===')
    const phase1Summary = buildPhase1Summary(phase1Data)
    const phase2Schema = buildSchemaText(PHASE2_CODES)
    const phase2System = `${baseSystemPrompt}

## 앞 단계 설계 결과 (반드시 이어서 설계할 것)
아래는 준비~분석 단계(prep ~ A-2-2)의 설계 결과와 주요 논의 내용입니다.
후반부 설계는 이 내용을 기반으로 일관성 있게 이어가야 합니다:
${phase1Summary}

## 대화 연속성 특별 지침 (2차 호출)
- 교사들은 위 1차 결과에서 합의된 내용을 기억하고 있습니다.
- "분석 단계에서 정리한 성취기준을 바탕으로...", "팀 비전에서 잡았던 방향대로..."
  등 이전 논의를 구체적으로 참조하며 대화를 이어가세요.
- 1차에서 제안된 아이디어가 2차에서 구체화되는 흐름이 자연스러워야 합니다.

## 보드 스키마
${phase2Schema}`

    const phase2User = `다음 조건으로 융합수업 설계의 후반부(설계~평가)를 생성하세요:

${userPromptBase}

생성할 절차: ${PHASE2_CODES.join(', ')}

앞 단계(준비~분석)의 설계 결과를 반영하여, 일관된 흐름으로 후반부를 생성하세요.

JSON 형식:
{
  "Ds-1-1": {
    "board": { 보드 스키마에 맞는 데이터 },
    "conversation": [
      { "speaker": "${teachers[0].name}(${teachers[0].subject})", "message": "..." },
      { "speaker": "AI 공동설계자", "message": "..." }
    ]
  },
  ...
}

반드시 유효한 JSON만 응답하세요. 설명 텍스트나 마크다운 코드블록 없이 순수 JSON만 반환하세요.`

    const phase2Data = await streamAndParse({
      systemPrompt: phase2System,
      userPrompt: phase2User,
      codes: PHASE2_CODES,
      startIndex: PHASE1_CODES.length,
      label: '2차',
      sendEvent,
    })

    // 2차 결과 저장 — 성취기준 검증은 upsertDesign 게이트키퍼가 처리
    let phase2Saved = 0
    for (const [code, data] of Object.entries(phase2Data)) {
      if (!BOARD_TYPES[code] || !data) continue
      const boardContent = data.board || data
      const conversation = data.conversation || []
      try {
        await upsertDesign(projectId, code, boardContent, userId)
        phase2Saved++
        for (const turn of conversation) {
          const isAI = turn.speaker === 'AI 공동설계자' || turn.speaker?.includes('AI')
          await createMessage({
            project_id: projectId,
            sender_type: isAI ? 'ai' : 'teacher',
            content: turn.message,
            procedure_context: code,
            sender_name: turn.speaker?.replace(/\(.*\)/, '').trim() || null,
            sender_subject: turn.speaker?.match(/\((.+)\)/)?.[1] || null,
          }).catch((e) => console.warn(`[demo] 메시지 저장 실패 (${code}):`, e.message))
        }
        console.log(`[demo][2차] 저장 완료: ${code} (보드+${conversation.length}턴)`)
      } catch (err) {
        console.warn(`[demo][2차] 저장 실패 (${code}):`, err.message)
      }
    }
    console.log(`[demo] 2차 저장 완료: ${phase2Saved}/${PHASE2_CODES.length}개`)

    const totalSaved = phase1Saved + phase2Saved
    console.log(`[demo] === 전체 완료: ${totalSaved}/${ALL_CODES.length}개 보드 저장 ===`)

    // P0 #3: 최소 저장 검증 — 5개 미만이면 부분 실패 처리
    const MIN_BOARDS = 5
    if (totalSaved < MIN_BOARDS) {
      await updateProject(projectId, { status: 'failed' })
      sendEvent({
        type: 'partial_failure',
        projectId,
        workspaceId,
        savedBoards: totalSaved,
        totalProcedures: ALL_CODES.length,
        message: `${totalSaved}개만 저장되어 생성에 실패했습니다. 다시 시도해 주세요.`,
      })
    } else {
      // P0 #2: generating → simulation 전환
      await updateProject(projectId, { status: 'simulation' })
      sendEvent({
        type: 'complete',
        projectId,
        workspaceId,
        savedBoards: totalSaved,
        totalProcedures: ALL_CODES.length,
      })
    }
    safeEnd()
  } catch (error) {
    console.error('[demo] 생성 오류:', error?.message || error)
    // disconnect로 인한 에러는 failed로 마킹하지 않음 (서버 작업은 이미 완료됐을 수 있음)
    if (projectId && !aborted) {
      await updateProject(projectId, { status: 'failed' }).catch(() => {})
    }
    sendEvent({ type: 'error', message: '데모 생성 중 오류가 발생했습니다.', projectId })
    safeEnd()
  }
})
