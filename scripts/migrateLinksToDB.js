#!/usr/bin/env node
/**
 * 기존 generatedLinks.js → curriculum_links 테이블 마이그레이션 스크립트
 *
 * 기존 1,768개 AI 생성 링크를 Supabase curriculum_links 테이블에 삽입.
 * - status: 'published' (Claude Opus가 이미 평가한 링크)
 * - generation_method: 'ai'
 * - source_code < target_code 정규화 (CHECK 제약 충족)
 *
 * 사용법:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrateLinksToDB.js
 *
 * 또는 .env에 환경변수 설정 후:
 *   node scripts/migrateLinksToDB.js
 */

import { createClient } from '@supabase/supabase-js'
import { GENERATED_LINKS } from '../server/data/generatedLinks.js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// link_type 축약 매핑
const ltMap = {
  cs: 'cross_subject',
  sc: 'same_concept',
  ap: 'application',
  pr: 'prerequisite',
}

async function migrate() {
  console.log(`📦 마이그레이션 시작: ${GENERATED_LINKS.length}개 링크`)

  // 링크를 DB 형식으로 변환
  const rows = []
  const seen = new Set()
  let skipped = 0

  for (const link of GENERATED_LINKS) {
    const [src, tgt, ltShort, rationale] = Array.isArray(link)
      ? link
      : [link.source, link.target, link.link_type, link.rationale]

    const linkType = ltMap[ltShort] || ltShort

    // source_code < target_code 정규화
    const [sourceCode, targetCode] = src < tgt ? [src, tgt] : [tgt, src]

    // 중복 방지
    const key = `${sourceCode}|${targetCode}`
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)

    rows.push({
      source_code: sourceCode,
      target_code: targetCode,
      link_type: linkType,
      rationale: rationale || null,
      integration_theme: null,
      lesson_hook: null,
      semantic_score: null,
      quality_score: null,
      status: 'published',
      generation_method: 'ai',
    })
  }

  console.log(`  ✅ 변환 완료: ${rows.length}개 (중복 ${skipped}개 제외)`)

  // 배치 삽입 (500개씩)
  const BATCH_SIZE = 500
  let inserted = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('curriculum_links')
      .upsert(batch, { onConflict: 'source_code,target_code' })

    if (error) {
      console.error(`  ❌ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 오류:`, error.message)
      errors++
    } else {
      inserted += batch.length
      console.log(`  📥 배치 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}: ${batch.length}개 삽입`)
    }
  }

  console.log(`\n📊 마이그레이션 완료`)
  console.log(`  삽입: ${inserted}개`)
  console.log(`  오류: ${errors}개`)
  console.log(`  중복 스킵: ${skipped}개`)
}

migrate().catch(err => {
  console.error('마이그레이션 실패:', err)
  process.exit(1)
})
