/**
 * 임베딩 3D 좌표 캐시(server/data/embeddings-cache.json) 재생성.
 *
 * 배경: 성취기준이 5,665개로 늘었는데 캐시는 4,856개 기준이라 hash 불일치 →
 *   캐시 미스. production은 OOM 방지로 UMAP 계산을 건너뛰고 "빈 좌표"를 반환하므로
 *   그래프/3D의 의미 좌표가 전부 사라진다. 오프라인에서 한 번 계산해 커밋한다.
 *
 * 실행: node --max-old-space-size=16384 scripts/regen-embeddings-cache.mjs
 */
import { Standards, initStore } from '../server/lib/store.js'
import { computeEmbedding3D } from '../server/services/embeddings.js'

await initStore()
const list = Standards.list()
console.log(`성취기준: ${list.length}개`)
console.time('UMAP 계산')
const coords = computeEmbedding3D(list)
console.timeEnd('UMAP 계산')
console.log(`좌표 생성: ${coords.size}개`)
if (coords.size !== list.length) {
  console.error(`❌ 좌표 수 불일치 (${coords.size} != ${list.length})`)
  process.exit(1)
}
console.log('✅ embeddings-cache.json 저장 완료 (computeEmbedding3D 내부에서 저장)')
