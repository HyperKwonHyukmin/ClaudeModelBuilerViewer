import { useRef, useState } from 'react'
import { CheckCircle2, X, Sparkles } from 'lucide-react'
import { useHoistLayoutStore } from '../store/useHoistLayoutStore.js'
import { getHoistMaxGroups, getHoistMinNodesPerGroup, useEditStore } from '../store/useEditStore.js'
import { splitRegions, assignNodesToRegions, fitTransform, snapToNearestNode } from '../data/hoistAutoLayout.js'

const SVG_W = 1040, SVG_H = 600, PAD = 40
const NODE_CAP = 4000  // 너무 많은 노드는 표시용으로만 샘플링

export default function HoistAutoLayoutEditor() {
  const open = useHoistLayoutStore(s => s.open)
  const divX = useHoistLayoutStore(s => s.divX)
  const divY = useHoistLayoutStore(s => s.divY)
  const dividersX = useHoistLayoutStore(s => s.dividersX)
  const dividersY = useHoistLayoutStore(s => s.dividersY)
  const bbox = useHoistLayoutStore(s => s.bbox)
  const cog = useHoistLayoutStore(s => s.cog)
  const cogSource = useHoistLayoutStore(s => s.cogSource)
  const projectedNodes = useHoistLayoutStore(s => s.projectedNodes)
  const suggestions = useHoistLayoutStore(s => s.suggestions)
  const warnings = useHoistLayoutStore(s => s.warnings)
  const pointsPerRegion = useHoistLayoutStore(s => s.pointsPerRegion)
  const setDivX = useHoistLayoutStore(s => s.setDivX)
  const setDivY = useHoistLayoutStore(s => s.setDivY)
  const setDividerX = useHoistLayoutStore(s => s.setDividerX)
  const setDividerY = useHoistLayoutStore(s => s.setDividerY)
  const setRegionPointCount = useHoistLayoutStore(s => s.setRegionPointCount)
  const setRegionPoints = useHoistLayoutStore(s => s.setRegionPoints)
  const closeEditor = useHoistLayoutStore(s => s.closeEditor)
  const hoistMode = useEditStore(s => s.hoistMode)
  const optimizeHoistGroups = useEditStore(s => s.optimizeHoistGroups)
  const flashHoistGuide = useEditStore(s => s.flashHoistGuide)

  const svgRef = useRef(null)
  const dragRef = useRef(null)  // {type:'divX'|'divY'|'marker', index?, regionId?, slot?}
  const [applyError, setApplyError] = useState(null)
  const [optimizing, setOptimizing] = useState(false)

  if (!open) return null

  const ready = !!bbox && Array.isArray(projectedNodes) && projectedNodes.length > 0
  const t = ready ? fitTransform(bbox, SVG_W, SVG_H, PAD) : null
  const regions = ready ? splitRegions(bbox, dividersX, dividersY) : []
  const assign = ready ? assignNodesToRegions(projectedNodes, regions, dividersX, dividersY) : {}
  const byId = new Map((projectedNodes ?? []).map(p => [p.id, p]))
  const shownNodes = ready && projectedNodes.length > NODE_CAP
    ? projectedNodes.filter((_, i) => i % Math.ceil(projectedNodes.length / NODE_CAP) === 0)
    : (projectedNodes ?? [])
  const totalPoints = Object.values(suggestions).reduce((s, ids) => s + (ids?.length ?? 0), 0)
  const maxGroups = getHoistMaxGroups(hoistMode)
  const minNodes = getHoistMinNodesPerGroup(hoistMode)
  const canApply = ready && !!hoistMode && totalPoints > 0 && !optimizing
  const groupCount = Math.max(1, divX * divY)
  const setGroupCount = (n) => {
    setDivX(1)
    setDivY(Number(n))
  }

  const clientToModel = (evt) => {
    const svg = svgRef.current
    if (!svg || !t) return null
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY
    const m = svg.getScreenCTM(); if (!m) return null
    const p = pt.matrixTransform(m.inverse())
    return t.toModel(p.x, p.y)
  }
  const startDrag = (evt, payload) => {
    evt.stopPropagation()
    dragRef.current = payload
    try { svgRef.current.setPointerCapture(evt.pointerId) } catch { /* noop */ }
  }
  const onPointerMove = (evt) => {
    const d = dragRef.current
    if (!d) return
    const mp = clientToModel(evt); if (!mp) return
    if (d.type === 'divX') setDividerX(d.index, mp.x)
    else if (d.type === 'divY') setDividerY(d.index, mp.y)
    else if (d.type === 'marker') {
      const cands = (assign[d.regionId] ?? []).map(id => byId.get(id)).filter(Boolean)
      const snapId = snapToNearestNode(mp, cands)
      if (snapId != null) {
        const cur = (suggestions[d.regionId] ?? []).slice()
        if (cur[d.slot] !== snapId && !cur.includes(snapId)) { cur[d.slot] = snapId; setRegionPoints(d.regionId, cur) }
      }
    }
  }
  const endDrag = (evt) => {
    if (dragRef.current && svgRef.current) { try { svgRef.current.releasePointerCapture(evt.pointerId) } catch { /* noop */ } }
    dragRef.current = null
  }
  const onApply = async () => {
    if (!ready || optimizing) return
    const selectedRegions = regions
      .map(r => ({ region: r, suggested: suggestions[r.id] ?? [], assigned: assign[r.id] ?? [] }))
      .filter(x => x.suggested.length > 0)
    const nodeGroups = selectedRegions.map(x => x.suggested)
    const pointsPerGroup = Math.max(...nodeGroups.map(ids => ids.length), minNodes)
    const optimization = {
      desiredGroupCount: selectedRegions.length,
      pointsPerGroup,
      allowedNodeIds: projectedNodes.map(p => p.id),
    }
    setOptimizing(true)
    try {
      const r = await optimizeHoistGroups(nodeGroups, optimization)
      if (!r.ok) {
        setApplyError(r.error ?? '권상 위치 최적화 결과를 적용하지 못했습니다.')
        return
      }
      setApplyError(null)
      const score = r.report?.best?.score ?? r.report?.Best?.Score
      const scoreText = Number.isFinite(Number(score)) ? ` · score ${Number(score).toFixed(1)}` : ''
      flashHoistGuide(`자세안정성 기반 권상 위치 적용: ${r.appliedGroupCount}그룹 · 권상 포인트 ${r.appliedNodeCount}개${scoreText}`, 'success')
      closeEditor()
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(4,4,16,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 'min(1160px, 94vw)', height: 'min(800px, 92vh)', background: '#0b0b1e',
        border: '1px solid #25254a', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #1e1e38' }}>
          <Sparkles size={16} color="#90E8FF" />
          <span style={{ fontSize: 14, fontWeight: 900, color: '#90E8FF', letterSpacing: 0.6 }}>권상 위치 자동 선정</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
            <label style={{ fontSize: 11, color: '#8aa0b8' }}>권상 그룹</label>
            <input type="number" min={1} max={6} value={groupCount}
              onChange={e => setGroupCount(e.target.value)}
              style={numInput} />
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#60708a' }}>
            무게중심: {cogSource === 'bboxCenter' ? 'bbox 중심(질량 미확인)' : cogSource === 'unavailable' ? '없음' : '질량 기준'}
          </span>
          <button onClick={closeEditor} aria-label="닫기" style={iconBtn}><X size={16} /></button>
        </div>

        {/* SVG 영역 */}
        <div style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex' }}>
          {!ready ? (
            <div style={{ margin: 'auto', color: '#8aa0b8', fontSize: 13 }}>
              모델을 먼저 로드하세요. (노드가 있어야 구역 분할이 가능합니다)
            </div>
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{ width: '100%', height: '100%', background: '#07071a', borderRadius: 8, touchAction: 'none' }}
              onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
              {/* bbox */}
              {(() => { const a = t.toScreen(bbox.minX, bbox.maxY), b = t.toScreen(bbox.maxX, bbox.minY)
                return <rect x={a.sx} y={a.sy} width={b.sx - a.sx} height={b.sy - a.sy} fill="none" stroke="#1e2a44" strokeWidth={1} /> })()}
              {/* 노드 점 */}
              {shownNodes.map(p => { const s = t.toScreen(p.x, p.y)
                return <circle key={p.id} cx={s.sx} cy={s.sy} r={1.4} fill="#3a4566" /> })}
              {/* 구역 사각형 + 라벨/입력 */}
              {regions.map((r, i) => {
                const tl = t.toScreen(r.minX, r.maxY), br = t.toScreen(r.maxX, r.minY)
                const c = t.toScreen((r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2)
                const warn = warnings[r.id]
                return (
                  <g key={r.id}>
                    <rect x={tl.sx} y={tl.sy} width={br.sx - tl.sx} height={br.sy - tl.sy}
                      fill={i % 2 ? 'rgba(0,209,255,0.03)' : 'rgba(181,124,255,0.03)'} stroke="#2a2a4a" strokeWidth={1} />
                    <foreignObject x={c.sx - 52} y={c.sy - 18} width={104} height={36}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: '100%' }}>
                        <span style={{ fontSize: 10, color: '#8aa0b8', whiteSpace: 'nowrap' }}>구역 {i + 1}</span>
                        <input type="number" min={2} value={pointsPerRegion[r.id] ?? 2}
                          onChange={e => setRegionPointCount(r.id, Number(e.target.value))}
                          title="권상 포인트 개수(최소 2)"
                          style={{ width: 38, ...numInput, padding: '2px 4px' }} />
                        {warn && <span title={warn} style={{ color: '#FFC857', fontSize: 12 }}>⚠</span>}
                      </div>
                    </foreignObject>
                  </g>
                )
              })}
              {/* 수직 분할선(드래그) */}
              {dividersX.map((xv, i) => { const s = t.toScreen(xv, 0)
                return (
                  <g key={`vx${i}`} style={{ cursor: 'ew-resize' }}>
                    <line x1={s.sx} y1={t.toScreen(0, bbox.maxY).sy} x2={s.sx} y2={t.toScreen(0, bbox.minY).sy} stroke="#00D1FF" strokeWidth={1.5} />
                    <line x1={s.sx} y1={0} x2={s.sx} y2={SVG_H} stroke="transparent" strokeWidth={14}
                      onPointerDown={e => startDrag(e, { type: 'divX', index: i })} />
                  </g>
                )
              })}
              {/* 수평 분할선(드래그) */}
              {dividersY.map((yv, i) => { const s = t.toScreen(0, yv)
                return (
                  <g key={`hy${i}`} style={{ cursor: 'ns-resize' }}>
                    <line x1={t.toScreen(bbox.minX, 0).sx} y1={s.sy} x2={t.toScreen(bbox.maxX, 0).sx} y2={s.sy} stroke="#00D1FF" strokeWidth={1.5} />
                    <line x1={0} y1={s.sy} x2={SVG_W} y2={s.sy} stroke="transparent" strokeWidth={14}
                      onPointerDown={e => startDrag(e, { type: 'divY', index: i })} />
                  </g>
                )
              })}
              {/* 무게중심 G */}
              {cog && (() => { const s = t.toScreen(cog.x, cog.y)
                return (
                  <g>
                    <line x1={s.sx - 9} y1={s.sy} x2={s.sx + 9} y2={s.sy} stroke="#FFD700" strokeWidth={1.5} />
                    <line x1={s.sx} y1={s.sy - 9} x2={s.sx} y2={s.sy + 9} stroke="#FFD700" strokeWidth={1.5} />
                    <circle cx={s.sx} cy={s.sy} r={5} fill="none" stroke="#FFD700" strokeWidth={2} />
                    <text x={s.sx + 8} y={s.sy - 8} fontSize={11} fill="#FFD700" fontWeight={800}>G</text>
                  </g>
                )
              })()}
              {/* 제안 권상 포인트(드래그=노드 재스냅) */}
              {regions.map(r => (suggestions[r.id] ?? []).map((nid, slot) => {
                const p = byId.get(nid); if (!p) return null
                const s = t.toScreen(p.x, p.y)
                return (
                  <g key={`${r.id}_${slot}`} style={{ cursor: 'grab' }}
                    onPointerDown={e => startDrag(e, { type: 'marker', regionId: r.id, slot })}>
                    <rect x={s.sx - 5} y={s.sy - 5} width={10} height={10} transform={`rotate(45 ${s.sx} ${s.sy})`}
                      fill="#FF66AA" stroke="#fff" strokeWidth={1} />
                  </g>
                )
              }))}
            </svg>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderTop: '1px solid #1e1e38', fontSize: 11, color: '#8aa0b8' }}>
          <span>· 노드</span><span style={{ color: '#FFD700' }}>● 무게중심 G</span>
          <span style={{ color: '#00D1FF' }}>─ 분할선(드래그)</span>
          <span style={{ color: '#FF66AA' }}>◆ 권상 포인트(드래그=노드 재스냅)</span>
          <div style={{ flex: 1 }} />
          {applyError && <span style={{ color: '#FF99A6', fontWeight: 700 }}>{applyError}</span>}
          <span>권상 그룹 {regions.length}개 · 그룹당 {Math.max(...Object.values(suggestions).map(ids => ids?.length ?? 0), minNodes)}포인트 · 적용 상한 {maxGroups}그룹/{minNodes}개 이상</span>
          <button
            onClick={onApply}
            disabled={!canApply}
            style={{
              ...primaryBtn,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              opacity: canApply ? 1 : 0.45,
              cursor: canApply ? 'pointer' : 'not-allowed',
            }}>
            <CheckCircle2 size={14} />
            {optimizing ? '자세안정성 평가 중...' : '선정 결과 적용'}
          </button>
          <button onClick={closeEditor} style={primaryBtn}>닫기</button>
        </div>
      </div>
    </div>
  )
}

const numInput = {
  width: 46, background: '#101024', color: '#E8FBFF', border: '1px solid #2a2a4a',
  borderRadius: 5, padding: '3px 6px', fontSize: 11, textAlign: 'center',
}
const iconBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
  background: '#101024', color: '#8aa0b8', border: '1px solid #2a2a4a', borderRadius: 6, cursor: 'pointer',
}
const primaryBtn = {
  background: 'rgba(0,209,255,0.16)', color: '#E8FBFF', border: '1px solid #00D1FF',
  borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
}
