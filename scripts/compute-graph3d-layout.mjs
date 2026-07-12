#!/usr/bin/env node
/**
 * 3D 쇼케이스용 레이아웃 사전계산 스크립트
 *
 * /api/standards/graph(published)를 받아 d3-force-3d 시뮬레이션을 오프라인으로 돌리고,
 * 결과 좌표를 server/data/graph3dLayout.json에 저장한다.
 * 서버의 /api/standards/graph3d 엔드포인트가 이 파일을 읽어 좌표를 제공하므로
 * 클라이언트는 force 시뮬레이션 없이 접속 즉시 완성된 성운을 보게 된다.
 *
 * 결정성: d3-force의 초기 배치(phyllotaxis)와 jiggle은 내부 LCG 기반이라
 * 동일 입력 순서 → 동일 결과. 임베딩(UMAP) 좌표를 시드로 쓰고 약한 복원력을 걸어
 * 의미 기반 클러스터 지형을 유지한 채 링크 구조만 정돈한다.
 *
 * 사용법:
 *   node scripts/compute-graph3d-layout.mjs                      # localhost:4007 대상
 *   node scripts/compute-graph3d-layout.mjs --url https://...    # 다른 서버 대상
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  forceSimulation, forceLink, forceManyBody, forceCenter,
  forceX, forceY, forceZ,
} from 'd3-force-3d'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'server', 'data', 'graph3dLayout.json')

const args = process.argv.slice(2)
const urlIdx = args.indexOf('--url')
const BASE_URL = urlIdx >= 0 ? args[urlIdx + 1] : 'http://localhost:4007'

const TICKS = 400
const SEED_SCALE = 1.6      // UMAP 좌표(-150~150)를 시뮬레이션 공간으로 확장
const SEED_PULL = 0.04      // 임베딩 시드 방향 복원력 (의미 지형 유지)
const TARGET_RADIUS = 170   // 최종 정규화 반경

async function main() {
  console.log(`📡 그래프 로드: ${BASE_URL}/api/standards/graph?status=published`)
  const res = await fetch(`${BASE_URL}/api/standards/graph?status=published`)
  if (!res.ok) throw new Error(`그래프 로드 실패: HTTP ${res.status}`)
  const graph = await res.json()
  console.log(`   노드 ${graph.nodes.length} / 링크 ${graph.links.length}`)

  // 쇼케이스 정의: 교과군 간(cross subject_group) published 연결만
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
  const links = graph.links.filter(l => {
    const src = nodeById.get(l.source)
    const tgt = nodeById.get(l.target)
    if (!src || !tgt) return false
    return (src.subject_group || src.subject) !== (tgt.subject_group || tgt.subject)
  })

  // 연결된 노드만 (고립 노드 제외)
  const linkedIds = new Set()
  links.forEach(l => { linkedIds.add(l.source); linkedIds.add(l.target) })
  const nodes = graph.nodes
    .filter(n => linkedIds.has(n.id))
    .map(n => ({
      id: n.id,
      code: n.code,
      // 임베딩 좌표를 시드로 (없으면 d3 phyllotaxis 기본 배치)
      ...(Number.isFinite(n.x) ? {
        x: n.x * SEED_SCALE, y: n.y * SEED_SCALE, z: n.z * SEED_SCALE,
        seedX: n.x * SEED_SCALE, seedY: n.y * SEED_SCALE, seedZ: n.z * SEED_SCALE,
      } : {}),
    }))
  const seededCount = nodes.filter(n => 'seedX' in n).length
  console.log(`🔧 시뮬레이션 대상: 노드 ${nodes.length} (시드 보유 ${seededCount}) / 링크 ${links.length}`)

  const simLinks = links.map(l => ({ source: l.source, target: l.target }))

  const sim = forceSimulation(nodes, 3)
    .force('link', forceLink(simLinks).id(n => n.id).distance(45).strength(0.25))
    .force('charge', forceManyBody().strength(-55).distanceMax(320))
    .force('center', forceCenter(0, 0, 0))
    // 임베딩 시드 방향 약한 복원력 — UMAP 의미 지형 보존
    .force('seedX', forceX(n => n.seedX ?? 0).strength(n => ('seedX' in n ? SEED_PULL : 0)))
    .force('seedY', forceY(n => n.seedY ?? 0).strength(n => ('seedY' in n ? SEED_PULL : 0)))
    .force('seedZ', forceZ(n => n.seedZ ?? 0).strength(n => ('seedZ' in n ? SEED_PULL : 0)))
    .stop()

  console.time('⏱️  force 시뮬레이션')
  for (let i = 0; i < TICKS; i++) {
    sim.tick()
    if ((i + 1) % 100 === 0) console.log(`   tick ${i + 1}/${TICKS} (alpha=${sim.alpha().toFixed(4)})`)
  }
  console.timeEnd('⏱️  force 시뮬레이션')

  // 반경 정규화 (95퍼센타일 반경을 TARGET_RADIUS에 맞춤 — 아웃라이어가 스케일 왜곡 방지)
  const radii = nodes.map(n => Math.hypot(n.x, n.y, n.z)).sort((a, b) => a - b)
  const p95 = radii[Math.floor(radii.length * 0.95)] || 1
  const scale = TARGET_RADIUS / p95
  console.log(`📐 정규화: p95 반경 ${p95.toFixed(1)} → ${TARGET_RADIUS} (scale ${scale.toFixed(3)})`)

  const coords = {}
  for (const n of nodes) {
    coords[n.code] = [
      Math.round(n.x * scale * 10) / 10,
      Math.round(n.y * scale * 10) / 10,
      Math.round(n.z * scale * 10) / 10,
    ]
  }

  const out = {
    version: 1,
    computedAt: new Date().toISOString(),
    source: BASE_URL,
    nodeCount: nodes.length,
    linkCount: links.length,
    params: { TICKS, SEED_SCALE, SEED_PULL, TARGET_RADIUS },
    coords,
  }
  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(out))
  const sizeKB = Math.round(JSON.stringify(out).length / 1024)
  console.log(`✅ 저장: ${OUT_PATH} (${sizeKB}KB, 노드 ${nodes.length})`)
}

main().catch(e => { console.error('❌ 실패:', e); process.exit(1) })
