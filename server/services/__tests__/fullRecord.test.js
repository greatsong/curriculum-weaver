/**
 * 전체 기록(보고서 + 대화 전문) 테스트 (인메모리 폴백 경로)
 *
 * 고정하는 것:
 *   - 대화 전문이 시간순으로 전부 들어가고, 보드 내용(보고서 본문)도 같은 파일에 있다
 *   - 익명화: 교사 이름이 대화·보드·참여자 어디에도 남지 않고 "교사 A/B"로 바뀐다, 이메일은 지워진다
 *   - 익명화를 켜도 원본 데이터(인메모리 저장소)는 바뀌지 않는다
 *   - 절차 소제목은 표시 코드(T-1)로, 내부 코드(T-1-1)는 노출되지 않는다
 *   - AI 메시지의 XML 마커(<procedure_advance/> 등)는 제거된다
 *   - 절차 이동 기록은 메시지가 아니라 이동 표시로 나온다
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createProject, upsertDesign, createMessage, getMessages } from '../../lib/supabaseService.js'
import { generateFullRecord, cleanMessageText, anonymizeRecord, generateReportDoc, generateTranscriptDoc, generatePackageZip } from '../fullRecord.js'
import JSZip from 'jszip'
import { collectReportData, generateHTML, generateMarkdown } from '../reportGenerator.js'
import { MOVE_NOTE_SENDER, encodeMoveMeta } from 'curriculum-weaver-shared/procedureMove.js'

let projectId

beforeAll(async () => {
  const project = await createProject('ws-test', { title: '전체 기록 테스트', owner_id: 'user-1' })
  projectId = project.id

  await upsertDesign(projectId, 'T-1-1', {
    commonVision: '김민수 선생님과 박지영 선생님이 함께 그리는 융합 수업',
    individualVisions: [{ name: '김민수', vision: '데이터로 말하는 학생' }, { name: '박지영', vision: '지도로 읽는 동네' }],
  }, 'user-1')
  await upsertDesign(projectId, 'T-2-1', {
    roles: [
      { memberName: '김민수', subject: '정보', strengths: '데이터 분석', role: '기록' },
      { memberName: '박지영', subject: '사회', strengths: '지도', role: '진행' },
    ],
  }, 'user-1')

  await createMessage({ project_id: projectId, user_id: 'user-1', sender_type: 'teacher', sender_name: '김민수', sender_subject: '정보', content: '우리 팀 비전을 정해 봅시다. 연락은 minsu@example.com', procedure_context: 'T-1-1' })
  await createMessage({ project_id: projectId, sender_type: 'ai', content: '좋습니다. **공동 비전**을 제안합니다.\n\n- 데이터\n- 지도\n<procedure_advance current="T-1" suggested="T-2" reason="비전 확정"/>', procedure_context: 'T-1-1' })
  await createMessage({ project_id: projectId, sender_type: 'ai', sender_name: MOVE_NOTE_SENDER, sender_subject: encodeMoveMeta({ from: 'T-1-1', to: 'T-2-1' }), content: 'T-1 비전을 마치고 T-3 역할 배분으로 이동했습니다.', procedure_context: 'T-2-1' })
  await createMessage({ project_id: projectId, user_id: 'user-2', sender_type: 'teacher', sender_name: '박지영', sender_subject: '사회', content: '김민수 선생님이 기록을 맡아 주세요.', procedure_context: 'T-2-1' })
})

describe('cleanMessageText', () => {
  it('XML 마커를 걷어내고 내부 코드를 표시 코드로 바꾼다', () => {
    const out = cleanMessageText('본문 <procedure_advance current="T-1" suggested="T-2" reason="x"/> 끝 T-1-1')
    expect(out).not.toContain('<procedure_advance')
    expect(out).not.toContain('T-1-1')
    expect(out).toContain('본문')
  })
})

describe('generateFullRecord — 기본', () => {
  it('HTML: 보드 내용과 대화 전문이 한 파일에, 실명 그대로', async () => {
    const { title, body } = await generateFullRecord(projectId, { format: 'html' })
    expect(title).toBe('전체 기록 테스트')
    expect(body).toContain('대화 전문')
    expect(body).toContain('함께 그리는 융합 수업')          // 보드(보고서 본문)
    expect(body).toContain('우리 팀 비전을 정해 봅시다')     // 교사 메시지
    expect(body).toContain('<strong>공동 비전</strong>')     // AI 마크다운 렌더
    expect(body).toContain('김민수 · 정보')                  // 발신자 표시
    expect(body).toContain('chat-move')                      // 이동 기록은 표시로
    expect(body).not.toContain('<procedure_advance')
    expect(body).not.toMatch(/\bT-1-1\b/)                    // 내부 코드 미노출
  })

  it('MD: 같은 내용이 마크다운으로', async () => {
    const { body } = await generateFullRecord(projectId, { format: 'md' })
    expect(body).toContain('## 대화 전문')
    expect(body).toContain('**김민수 · 정보**')
    expect(body).toContain('우리 팀 비전을 정해 봅시다')
    expect(body).toContain('↪ ')
    expect(body).not.toMatch(/\bT-1-1\b/)
  })
})

describe('generateFullRecord — 익명화', () => {
  it('이름·이메일이 대화·보드·참여자 어디에도 남지 않는다', async () => {
    for (const format of ['html', 'md']) {
      const { body } = await generateFullRecord(projectId, { format, anonymize: true })
      expect(body).not.toContain('김민수')
      expect(body).not.toContain('박지영')
      expect(body).not.toContain('minsu@example.com')
      expect(body).toContain('[이메일]')
      expect(body).toContain('교사 A')
      expect(body).toContain('교사 B')
      expect(body).toContain('이름 가리기를 적용한 기록')
      // 교과명·내용은 유지
      expect(body).toContain('정보')
      expect(body).toContain('함께 그리는 융합 수업')
    }
  })

  it('원본 저장소는 바뀌지 않는다', async () => {
    await generateFullRecord(projectId, { format: 'html', anonymize: true })
    const data = await collectReportData(projectId)
    expect(data.designMap['T-2-1'].content.roles[0].memberName).toBe('김민수')
    const msgs = await getMessages(projectId, 100, 0)
    expect(msgs[0].sender_name).toBe('김민수')
    expect(msgs[0].content).toContain('minsu@example.com')
  })

  it('긴 이름을 먼저 치환해 부분 겹침이 깨지지 않는다', async () => {
    const data = await collectReportData(projectId)
    const messages = [
      { sender_type: 'teacher', sender_name: '김민', content: '김민수 선생님과 김민 선생님', created_at: new Date().toISOString() },
      { sender_type: 'teacher', sender_name: '김민수', content: '안녕하세요', created_at: new Date().toISOString() },
    ]
    const { messages: out } = anonymizeRecord(data, messages, null)
    expect(out[0].content).not.toContain('김민')
    expect(out[0].content).toMatch(/교사 [A-Z] 선생님과 교사 [A-Z] 선생님/)
  })
})

describe('범위별 문서 — 보고서만 / 대화 기록만 / 둘 다', () => {
  it('보고서만(익명 끔)은 기존 보고서와 완전히 같다', async () => {
    const data = await collectReportData(projectId)
    const html = await generateReportDoc(projectId, { format: 'html' })
    const md = await generateReportDoc(projectId, { format: 'md' })
    // 생성일 문구는 같은 날이면 같다
    expect(html.body).toBe(generateHTML(data))
    expect(md.body).toBe(generateMarkdown(data))
    expect(html.body).not.toContain('대화 전문')
  })

  it('보고서만(익명 켬)은 보드의 이름이 가려지고 안내가 붙는다', async () => {
    const { body } = await generateReportDoc(projectId, { format: 'html', anonymize: true })
    expect(body).not.toContain('김민수')
    expect(body).toContain('교사 A')
    expect(body).toContain('이름 가리기를 적용한 기록')
    expect(body).not.toContain('대화 전문')
  })

  it('대화 기록만: 보드 없이 대화 전문만, 표지·푸터 포함', async () => {
    const html = await generateTranscriptDoc(projectId, { format: 'html' })
    expect(html.body).toContain('<!DOCTYPE html>')
    expect(html.body).toContain('대화 기록')
    expect(html.body).toContain('우리 팀 비전을 정해 봅시다')
    expect(html.body).not.toContain('함께 그리는 융합 수업')   // T-1 보드 내용은 없다
    expect(html.body).not.toContain('참여 선생님')
    expect(html.body).not.toMatch(/\bT-1-1\b/)
    const md = await generateTranscriptDoc(projectId, { format: 'md', anonymize: true })
    expect(md.body).toContain('## 대화 전문')
    expect(md.body).not.toContain('김민수')
    expect(md.body).toContain('교사 A')
  })

  it('둘 다: zip 안에 보고서·대화 기록 두 파일, 익명 글자 배정이 두 파일에서 같다', async () => {
    const pkg = await generatePackageZip(projectId, { format: 'html', anonymize: true })
    expect(pkg.files).toHaveLength(2)
    expect(pkg.files[0]).toMatch(/_보고서_익명\.html$/)
    expect(pkg.files[1]).toMatch(/_대화기록_익명\.html$/)
    const zip = await JSZip.loadAsync(pkg.buffer)
    const report = await zip.file(pkg.files[0]).async('string')
    const transcript = await zip.file(pkg.files[1]).async('string')
    expect(report).toContain('함께 그리는 융합 수업')
    expect(report).not.toContain('대화 전문')
    expect(transcript).toContain('대화 전문')
    expect(transcript).not.toContain('함께 그리는 융합 수업')
    for (const doc of [report, transcript]) {
      expect(doc).not.toContain('김민수')
      expect(doc).not.toContain('박지영')
    }
    // 같은 사람은 두 문서에서 같은 글자: 역할표의 첫 교사(정보·기록)와 첫 메시지 발신자(정보)
    expect(report).toMatch(/교사 A[\s\S]*정보/)
    expect(transcript).toContain('교사 A · 정보')
  })

  it('둘 다(md, 실명): zip 두 파일에 실명이 그대로', async () => {
    const pkg = await generatePackageZip(projectId, { format: 'md' })
    const zip = await JSZip.loadAsync(pkg.buffer)
    const transcript = await zip.file(pkg.files[1]).async('string')
    expect(pkg.files[1]).toMatch(/_대화기록\.md$/)
    expect(transcript).toContain('**김민수 · 정보**')
  })
})
