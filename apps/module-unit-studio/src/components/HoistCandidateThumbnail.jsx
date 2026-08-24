import { groupPointsXY, candidateBBoxXY, planViewProjector } from '../data/hoistCandidateShape.js'

// 그룹별 색 (3D 뷰 그룹 컬러와 유사 계열)
const GROUP_COLORS = ['#5AA0FF', '#B57BFF', '#37E08A', '#FFC447', '#FF7BAC', '#4FE0D0']

/**
 * 후보의 평면(top-view) 미니 도형. 모델 bbox 프레임 위에 각 그룹 폴리곤을 색으로 그린다.
 * 방향은 앱 3D 뷰어의 평면도('A' 뷰)와 동일하다: ↑ X(종) · ← Y(횡).
 */
export default function HoistCandidateThumbnail({ candidate, bbox, width = 96, height = 72 }) {
  const groups = candidate?.groups ?? []
  const frame = (bbox && Number.isFinite(bbox.minX)) ? bbox : candidateBBoxXY(candidate)
  if (!frame) return <div style={{ width, height, background: '#0a0a18', borderRadius: 6 }} />

  const { project: toPx, rect } = planViewProjector(frame, { width, height, pad: 6 })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', background: '#0a0a18', borderRadius: 6, flex: '0 0 auto' }}>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke="#2a2a4a" strokeWidth={1} rx={3} />
      {groups.map((g, gi) => {
        const pts = groupPointsXY(g).map(toPx)
        if (pts.length === 0) return null
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]
        const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        return (
          <g key={gi}>
            {pts.length >= 3 && (
              <polygon points={poly} fill={color} fillOpacity={0.30} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
            )}
            {pts.length === 2 && (
              <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={color} strokeWidth={1.6} />
            )}
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.7} fill={color} />)}
          </g>
        )
      })}
    </svg>
  )
}
