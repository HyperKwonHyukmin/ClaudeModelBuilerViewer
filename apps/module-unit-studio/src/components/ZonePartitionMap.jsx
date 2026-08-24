/**
 * 구역 분할 미니맵(SVG, presentational). buildZonePartitionView 결과만 그린다.
 * 셀 클릭 → onCycle(bandIndex, subIndex)로 포인트 수 순환. store/three 비의존.
 * @param {{ view:object, onCycle:(bi:number,si:number)=>void, includePipe:boolean }} props
 */
export default function ZonePartitionMap({ view, onCycle, includePipe }) {
  if (!view) return null
  const { viewBox, cells, dots, cog } = view
  const cogArm = Math.max(24, viewBox.w * 0.05)   // COG 십자 팔 길이(viewBox 비례)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', maxHeight: 300, aspectRatio: `${viewBox.w} / ${viewBox.h}`, background: '#0a0a18', borderRadius: 6, border: '1px solid #25254a' }}
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
        {cells.map((c) => {
          // 0점 = 제외 구역(회색·점선), 노드 부족 = 주황, 정상 = 시안
          const stroke = c.excluded ? '#4a5a72' : c.thin ? '#FFC447' : '#00D1FF'
          const fill = c.excluded ? 'rgba(74,90,114,0.08)' : c.thin ? 'rgba(255,196,71,0.10)' : 'rgba(0,209,255,0.06)'
          return (
            <g key={`c-${c.bandIndex}-${c.subIndex}`} style={{ cursor: onCycle ? 'pointer' : 'default' }} onClick={() => onCycle?.(c.bandIndex, c.subIndex)}>
              <rect
                x={c.x} y={c.y} width={c.w} height={c.h}
                fill={fill}
                stroke={stroke} strokeWidth={2.5}
                strokeDasharray={c.excluded ? '8 6' : undefined}
              />
              <text x={c.x + c.w / 2} y={c.y + c.h / 2 - 54} textAnchor="middle" fontSize={44} fontWeight={800} fill={c.excluded ? '#5a6a82' : '#cfe6ff'}>{c.label}</text>
              {c.excluded ? (
                <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 40} textAnchor="middle" fontSize={54} fontWeight={900} fill="#6a7a92">제외</text>
              ) : (
                <>
                  {/* -1 = 자동(엔진이 방식 허용 점 수 스윕 후 순위 제안) — 보라색. 4점은 구역별 형상(▭/―) 병기. */}
                  <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 44} textAnchor="middle" fontSize={60} fontWeight={900} fill={c.thin ? '#FFC447' : c.points === -1 ? '#C9A0FF' : '#37E08A'}>
                    {c.points === -1 ? '자동' : c.points === 4 ? `4점 ${c.shape === 'line' ? '―' : '▭'}` : `${c.points}점`}
                  </text>
                  <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 96} textAnchor="middle" fontSize={30} fill="#6a7a92">노드 {c.nodeCount}</text>
                </>
              )}
            </g>
          )
        })}
        {/* 무게중심(COG) 마커 — 분할 기준점. 십자 + 원. */}
        {cog && (
          <g pointerEvents="none">
            <line x1={cog.x - cogArm} y1={cog.y} x2={cog.x + cogArm} y2={cog.y} stroke="#FF3DAE" strokeWidth={3.5} />
            <line x1={cog.x} y1={cog.y - cogArm} x2={cog.x} y2={cog.y + cogArm} stroke="#FF3DAE" strokeWidth={3.5} />
            <circle cx={cog.x} cy={cog.y} r={cogArm * 0.35} fill="none" stroke="#FF3DAE" strokeWidth={3.5} />
            <text x={cog.x + cogArm + 6} y={cog.y - 6} fontSize={30} fontWeight={900} fill="#FF3DAE">COG</text>
          </g>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8aa0b8', gap: 8 }}>
        <span>↑ X(종) · ← Y(횡) · 평면도(3D 뷰와 동일)</span>
        <span>셀 클릭=포인트 수 순환(0=제외·자동=엔진 추천) · 4점=사각형(▭)↔일직선(―) · 주황=노드 부족{cog ? ' · 핑크십자=무게중심' : ''}</span>
      </div>
    </div>
  )
}
