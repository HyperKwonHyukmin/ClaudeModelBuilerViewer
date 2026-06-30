import { Layers, Minus, Plus } from 'lucide-react'
import { buildZonePartitionView, reconcilePointsPerZone } from '../data/hoistZonePartition.js'
import ZonePartitionMap from './ZonePartitionMap.jsx'

/**
 * 구역 기반 권상 선정 설정 폼 (controlled).
 * @param {{ value:{bandAxis,bands,pointsPerZone,includePipe}, onChange:Function, mode:string, maxGroups:number, partitionInput:object|null }} props
 */
export default function HoistZoneConfig({ value, onChange, mode, maxGroups, partitionInput }) {
  const ceiling = mode === 'ceiling'
  const validPoints = ceiling ? [3, 4] : [2, 3, 4]
  const bands = value.bands
  const groupCount = bands.reduce((n, b) => n + Math.max(1, b), 0)
  const over = groupCount > maxGroups

  // bands 모양에 맞춰 정규화한 pointsPerZone 로 작업(누락/형상 불일치 방어)
  const ppz = reconcilePointsPerZone(bands, value.pointsPerZone, validPoints, 3)

  const patch = (p) => onChange({ ...value, ...p })
  const commitBands = (nextBands) => onChange({
    ...value,
    bands: nextBands,
    pointsPerZone: reconcilePointsPerZone(nextBands, ppz, validPoints, 3),
  })
  const setBand = (i, v) => {
    const next = [...bands]
    next[i] = Math.max(1, Math.min(maxGroups, v))
    commitBands(next)
  }
  const addBand = () => { if (!ceiling && bands.length < maxGroups) commitBands([...bands, 1]) }
  const removeBand = (i) => { if (!ceiling && bands.length > 1) commitBands(bands.filter((_, j) => j !== i)) }
  const cycleCell = (bi, si) => {
    const cur = ppz[bi]?.[si] ?? validPoints[0]
    const next = validPoints[(validPoints.indexOf(cur) + 1) % validPoints.length]
    const nextPpz = ppz.map(row => [...row])
    if (!nextPpz[bi]) nextPpz[bi] = []
    nextPpz[bi][si] = next
    patch({ pointsPerZone: nextPpz })
  }

  const view = partitionInput
    ? buildZonePartitionView(partitionInput.bbox, { ...value, bands, pointsPerZone: ppz }, partitionInput.nodeEntries, partitionInput.pipeNodes)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: '#0f0f22', border: '1px solid #25254a', borderRadius: 8 }}>
      {/* 밴드축 */}
      <Row label="분할 축">
        <Seg active={value.bandAxis === 'y'} onClick={() => patch({ bandAxis: 'y' })} disabled={ceiling}>Y (행)</Seg>
        <Seg active={value.bandAxis === 'x'} onClick={() => patch({ bandAxis: 'x' })} disabled={ceiling}>X (열)</Seg>
      </Row>

      {/* 밴드별 하위구역 */}
      <Row label="밴드별 구역 수">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
          {bands.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, color: '#8aa0b8', width: 44 }}>{value.bandAxis === 'y' ? `${i + 1}행` : `${i + 1}열`}</span>
              <Stepper value={b} min={1} max={maxGroups} onChange={(v) => setBand(i, v)} disabled={ceiling} />
              {!ceiling && bands.length > 1 && (
                <button onClick={() => removeBand(i)} title="이 밴드 삭제" style={iconBtn}><Minus size={13} /></button>
              )}
            </div>
          ))}
          {!ceiling && bands.length < maxGroups && (
            <button onClick={addBand} style={{ ...dashBtn }}><Plus size={12} /> 밴드 추가</button>
          )}
        </div>
      </Row>

      {/* 미니맵(구역 도식 + 구역별 포인트 편집) */}
      {view
        ? <ZonePartitionMap view={view} onCycle={cycleCell} includePipe={value.includePipe} />
        : <div style={{ fontSize: 11, color: '#6a7a92', padding: '8px 2px' }}>모델이 로드되면 구역 도식이 표시됩니다.</div>}

      {/* 배관 토글 */}
      <Row label="배관 포함">
        <Seg active={!value.includePipe} onClick={() => patch({ includePipe: false })}>제외</Seg>
        <Seg active={value.includePipe} onClick={() => patch({ includePipe: true })}>포함</Seg>
      </Row>

      {/* groupCount 표시 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: over ? '#FF99A6' : '#9fe6c2' }}>
        <Layers size={13} />
        총 권상 그룹 {groupCount}개 / 최대 {maxGroups}개
        {over && <span style={{ fontWeight: 800 }}> · 초과! 구역 수를 줄이세요</span>}
      </div>
    </div>
  )
}

const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'rgba(224,112,112,0.12)', border: '1px solid #c14a4a55', borderRadius: 5, color: '#E07070', cursor: 'pointer', padding: 0 }
const dashBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 8px', background: '#101024', color: '#90E8FF', border: '1px dashed #00D1FF66', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 700 }

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#90E8FF', width: 78, flexShrink: 0, paddingTop: 4 }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>{children}</div>
    </div>
  )
}

function Seg({ active, disabled, onClick, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: active ? 'rgba(0,209,255,0.20)' : '#101024',
      color: disabled ? '#3a3a52' : active ? '#E8FBFF' : '#8aa0b8',
      border: `1px solid ${active ? '#00D1FF' : '#2a2a4a'}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  )
}

function Stepper({ value, min, max, onChange, disabled }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button disabled={disabled || value <= min} onClick={() => onChange(value - 1)} style={stepBtn(disabled || value <= min)}><Minus size={12} /></button>
      <span style={{ minWidth: 18, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#e8f4ff' }}>{value}</span>
      <button disabled={disabled || value >= max} onClick={() => onChange(value + 1)} style={stepBtn(disabled || value >= max)}><Plus size={12} /></button>
    </div>
  )
}
const stepBtn = (dis) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: dis ? '#0a0a18' : '#101024', border: '1px solid #2a2a4a', borderRadius: 5, color: dis ? '#3a3a52' : '#90E8FF', cursor: dis ? 'not-allowed' : 'pointer', padding: 0 })
