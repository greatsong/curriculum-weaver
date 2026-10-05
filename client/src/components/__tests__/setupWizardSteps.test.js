/**
 * 호스트 셋업 위자드 회귀 테스트 — 유령 설정 재발 방지
 *
 * 위자드 3단계 '워크플로우 설정'은 고른 절차 목록(hiddenProcedures)을 저장만 하고
 * 읽는 곳이 어디에도 없었다. 호스트가 '초등학교 간소화'를 골라도 프로젝트에는
 * 19절차가 그대로 떠서, 온보딩 부담을 줄이려던 유일한 장치가 무효였다.
 * 절차를 실제로 건너뛰는 기능은 프로젝트 화면의 절차 생략(project_procedure_skips)이다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WIZARD_STEPS, gradeOptionFromWizard } from '../HostSetupWizard.jsx'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.jsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

describe('위자드 단계 구성', () => {
  it('워크플로우 단계가 없다 (4단계: 기본정보 → AI설정 → 팀원초대 → 완료)', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual(['info', 'ai', 'invite', 'done'])
  })

  it('단계 번호 아이콘이 순서대로 매겨져 있다', () => {
    expect(WIZARD_STEPS.map((s) => s.icon)).toEqual(['1', '2', '3', '4'])
  })

  it('마지막 단계는 완료다 (초대 후 이동 대상)', () => {
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1].id).toBe('done')
  })
})

describe('위자드 렌더 조건', () => {
  const source = readFileSync(join(SRC, 'components/HostSetupWizard.jsx'), 'utf-8')

  it('단계 판정에 하드코딩된 인덱스를 쓰지 않는다', () => {
    // step === 2 같은 인덱스 비교가 남아 있으면 단계를 하나 지울 때마다 조용히 어긋난다
    expect(source).not.toMatch(/step === \d/)
    expect(source).not.toMatch(/step < \d/)
    expect(source).not.toMatch(/setStep\(\d\)/)
  })

  it('스텝 id로 판정한다', () => {
    for (const id of ['info', 'ai', 'invite', 'done']) {
      expect(source, `${id} 조건 누락`).toContain(`currentWizardStep.id === '${id}'`)
    }
  })
})

describe('유령 설정 재발 방지', () => {
  it('클라이언트 어디에도 hiddenProcedures가 남아 있지 않다', () => {
    const offenders = walk(SRC)
      .filter((f) => readFileSync(f, 'utf-8').includes('hiddenProcedures'))
      .map((f) => f.slice(SRC.length + 1))
    expect(offenders).toEqual([])
  })

  it('워크플로우 프리셋 상수도 제거됐다', () => {
    const source = readFileSync(join(SRC, 'components/HostSetupWizard.jsx'), 'utf-8')
    expect(source).not.toMatch(/WORKFLOW_PRESETS/)
  })
})

describe('첫 프로젝트 만들기 — 제목은 교사가 정한다(2026-10-06)', () => {
  const source = readFileSync(join(SRC, 'components/HostSetupWizard.jsx'), 'utf-8')

  it('마법사가 학년으로 제목을 지어 프로젝트를 직접 만들지 않는다', () => {
    // 예전: "고1, 고2 융합수업 설계"로 바로 생성 → 예전 프로젝트와 제목 중복, 교과 빈 프로젝트
    expect(source).not.toMatch(/createProject\(/)
    expect(source).not.toMatch(/융합수업 설계`/)
    expect(source).toMatch(/onCreateProject\?\.\(/)
  })

  it('작업 공간 화면이 그 요청으로 새 프로젝트 창을 연다', () => {
    const page = readFileSync(join(SRC, 'pages/WorkspaceDetailPage.jsx'), 'utf-8')
    expect(page).toMatch(/onCreateProject=\{/)
    expect(page).toMatch(/setShowCreateProject\(true\)\s*\n\s*\}\}\s*\n\s*onDismiss/)
  })

  it('세부 학년을 새 프로젝트 창의 학교급으로 바꾼다(하나일 때만)', () => {
    expect(gradeOptionFromWizard(['고1', '고2'])).toBe('고등학교')
    expect(gradeOptionFromWizard(['중3'])).toBe('중학교')
    expect(gradeOptionFromWizard(['초5', '초6'])).toBe('초등학교 5-6학년')
    expect(gradeOptionFromWizard(['중3', '고1'])).toBe('')
    expect(gradeOptionFromWizard([])).toBe('')
    expect(gradeOptionFromWizard(undefined)).toBe('')
  })
})
