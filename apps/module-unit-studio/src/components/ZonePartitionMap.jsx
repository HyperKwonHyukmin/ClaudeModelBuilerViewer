/**
 * 구역 분할 미니맵(SVG, presentational). buildZonePartitionView 결과만 그린다.
 * 셀 클릭 → onCycle(bandIndex, subIndex)로 포인트 수 순환. store/three 비의존.
 * @param {{ view:object, onCycle:(bi:number,si:number)=>void, includePipe:boolean }} props
 */
export default function ZonePartitionMap({ view, onCycle, includePipe }) {
  if (!view) return null
  const { viewBox, cells, dots } = view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', maxHeight: 240, aspectRatio: `${viewBox.w} / ${viewBox.h}`, background: '#0a0a18', borderRadius: 6, border: '1px solid #25254a' }}
      >
        <rect x={0} y={0} width={viewBox.w} height={viewBox.h} fill="none" stroke="#2a2a4a" strokeWidth={2} />
        {dots.map((d, i) => (
          <circle
            key={`d${i}`}
            cx={d.x} cy={d.y} r={4}
            fill={d.pipe ? (includePipe ? '#6aa0ff' : '#33405a') : '#8aa0b8'}
            opacity={d.pipe && !includePipe ? 0.35 : 0.7}
          />
        ))}
        {cells.map((c, i) => (
          <g key={`c${i}`} style={{ cursor: onCycle ? 'pointer' : 'default' }} onClick={() => onCycle?.(c.bandIndex, c.subIndex)}>
            <rect
              x={c.x} y={c.y} width={c.w} height={c.h}
              fill={c.thin ? 'rgba(255,196,71,0.10)' : 'rgba(0,209,255,0.06)'}
              stroke={c.thin ? '#FFC447' : '#00D1FF'} strokeWidth={2}
            />
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 - 10} textAnchor="middle" fontSize={30} fontWeight="800" fill="#cfe6ff">{c.label}</text>
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 24} textAnchor="middle" fontSize={36} fontWeight="900" fill={c.thin ? '#FFC447' : '#37E08A'}>{c.points}점</text>
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 52} textAnchor="middle" fontSize={20} fill="#6a7a92">노드 {c.nodeCount}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#6a7a92' }}>
        <span>↑ Y · → X (평면도)</span>
        <span>셀 클릭 = 포인트 수 변경 · 주황 = 노드 부족</span>
      </div>
    </div>
  )
}
