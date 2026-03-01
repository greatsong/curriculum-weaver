/**
 * 커리큘럼 위버 로고 — 별자리 네트워크 모티프
 * 다색 노드가 빛의 선으로 연결된 3D 별자리
 */
import logoSrc from '/logo.png?url'

export default function Logo({ size = 32, className = '' }) {
  return (
    <img
      src={logoSrc}
      alt="커리큘럼 위버"
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    />
  )
}
