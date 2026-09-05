/**
 * "안내는 처음 한 번만" 회귀 테스트 (소스 계약 검사)
 *
 * 온보딩 오버레이가 다시 뜨던 경로가 세 갈래 있었다.
 *   1) 투어를 끝내면 레거시 Tutorial(9스텝)이 뒤이어 한 번 더 떴다.
 *   2) 코치·링크 가이드가 localStorage만 봐서, 다른 PC나 캐시 삭제 후 다시 떴다.
 *   3) 투어 '다시 보기' 버튼이 완료 기록을 지워, 새로고침하면 투어가 되살아났다.
 * 렌더 테스트 대신 소스 계약으로 고정한다 — 위 셋은 전부 "어떤 API를 쓰는가"의 문제다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(join(SRC, rel), 'utf-8')

/** 주석을 걷어낸 코드만 검사 대상으로 (설명 문구가 통과/실패를 좌우하지 않게) */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

describe('투어는 프로젝트 화면에서 한 번만 뜬다', () => {
  const page = codeOnly(read('pages/ProjectPage.jsx'))

  it('레거시 Tutorial을 더 이상 렌더하지 않는다', () => {
    expect(page).not.toMatch(/from\s+'\.\.\/components\/Tutorial'/)
    expect(page).not.toMatch(/<Tutorial\b/)
    expect(page).not.toMatch(/showTutorial/)
  })

  it('투어 표시 판정이 로컬 캐시와 계정 기록을 모두 확인한다', () => {
    expect(page).toMatch(/localStorage\.getItem\('cw_tour_done'\)/)
    expect(page).toMatch(/onboarding_tour_done/)
  })

  it('투어를 닫으면 계정에 영구 저장한다', () => {
    expect(page).toMatch(/markTourDone\(\)/)
  })

  it('다시 보기 버튼이 완료 기록을 지우지 않는다', () => {
    // removeItem('cw_tour_done')이 부활하면 다시 본 뒤 새로고침에 투어가 되살아난다
    expect(page).not.toMatch(/removeItem\(\s*'cw_tour_done'\s*\)/)
  })
})

describe('안내 오버레이는 계정 기록을 경유한다', () => {
  const overlays = [
    ['설계 모드 코치', 'components/DesignModeCoach.jsx'],
    ['링크 가이드', 'components/LinkGuideOverlay.jsx'],
  ]

  for (const [name, rel] of overlays) {
    describe(name, () => {
      const source = codeOnly(read(rel))

      it('표시 여부를 isOnboardingDone으로 판정한다', () => {
        expect(source).toMatch(/isOnboardingDone\(STORAGE_KEY\)/)
        // localStorage만 보고 판정하던 옛 코드가 남아 있으면 기기가 바뀔 때 다시 뜬다
        expect(source).not.toMatch(/localStorage\.getItem\(STORAGE_KEY\)/)
      })

      it('닫을 때 markOnboardingDone으로 저장한다', () => {
        expect(source).toMatch(/markOnboardingDone\(STORAGE_KEY\)/)
        expect(source).not.toMatch(/localStorage\.setItem\(STORAGE_KEY/)
      })

      it("닫기 문구가 '다시 보지 않기'다 (동작과 일치)", () => {
        expect(source).toContain('다시 보지 않기')
        expect(source).not.toContain('>건너뛰기<')
      })
    })
  }
})

describe('authStore 온보딩 기록 API', () => {
  const store = codeOnly(read('stores/authStore.js'))

  it('로컬 캐시와 계정(user_metadata) 양쪽에 기록한다', () => {
    expect(store).toMatch(/markOnboardingDone:\s*async/)
    expect(store).toMatch(/onboarding_flags/)
    expect(store).toMatch(/localStorage\.setItem\(key, '1'\)/)
  })

  it('판정은 로컬 캐시 → 계정 기록 순으로 확인한다', () => {
    const fn = store.slice(store.indexOf('isOnboardingDone:'))
    expect(fn).toMatch(/localStorage\.getItem\(key\)/)
    expect(fn).toMatch(/onboarding_flags\?\.\[key\]/)
  })

  it('서버 저장이 실패해도 예외를 밖으로 던지지 않는다', () => {
    // 저장 실패로 오버레이 닫기 자체가 깨지면 안 된다
    const fn = store.slice(store.indexOf('markOnboardingDone:'), store.indexOf('isOnboardingDone:'))
    expect(fn).toMatch(/catch/)
  })
})
