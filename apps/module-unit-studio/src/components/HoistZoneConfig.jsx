import { useMemo } from 'react'
import { Layers, Minus, Plus } from 'lucide-react'
import { buildZonePartitionView, reconcilePointsPerZone, reconcileShapePerZone, countActiveZones, SHAPE_QUAD, SHAPE_LINE } from '../data/hoistZonePartition.js'
import ZonePartitionMap from './ZonePartitionMap.jsx'

/**
 * 구역 기반 권상 선정 설정 폼 (controlled).
 * @param {{ value:{bandAxis,bands,pointsPerZone,includePipe}, onChange:Function, mode:string, maxGroups:number, partitionInput:object|null }} props
 */
export default function HoistZoneConfig({ value, onChange, mode, maxGroups, partitionInput }) {
  const ceiling = mode === 'ceiling'
  const goliat = mode === 'goliat'
  // 셀 클릭 순환 순서. 0 = 제외(권상 포인트 없음), -1 = 자동(엔진이 방식 허용 점 수 스윕 후 순위 제안).
  // 천장 Crane 은 1그룹 고정이라 제외 개념 없음. Goliat(Trolley)은 3점 미지원 → 2·4점만
  // (사용자 규칙 2026-07-03).
  const validPoints = ceiling ? [3, 4, -1] : goliat ? [2, 4, -1, 0] : [2, 3, 4, -1, 0]
  const bands = value.bands
  // 방식별 기본 점 수 — 천장 Crane 은 4점(사용자 지시 2026-07-31), 그 외는 2점.
  // ⚠️ 기본값이 validPoints 에 없으면 reconcilePointsPerZone 이 validPoints[0] 으로 떨어진다.
  //    천장 Crane 의 validPoints[0] 은 3 이라, 여기서 4 를 명시하지 않으면 기본이 3점으로 돌아간다.
  const defaultPoints = ceiling ? 4 : 2

  // bands 모양에 맞춰 정규화한 pointsPerZone·shapePerZone 로 작업(누락/형상 불일치 방어).
  const ppz = reconcilePointsPerZone(bands, value.pointsPerZone, validPoints, defaultPoints)
  const spz = reconcileShapePerZone(bands, value.shapePerZone)

  // 실제 권상 그룹 수 = 0점(제외) 아닌 셀 수. 9구역(3×3) 중 일부만 활성화하는 흐름을 지원.
  const groupCount = countActiveZones(bands, ppz)
  const over = groupCount > maxGroups
  const noneActive = groupCount === 0

  // 무게중심(COG) 기준 분할(기본 on).
  const cogOn = value.cogAnchor !== false
  const hasCog = !!partitionInput?.cog

  // 셀 클릭 순환 상태 — 4점은 형상(사각형/일직선) 2개 하위 상태로 분리해 '구역별 4점 형상'을 지정한다
  // (사용자 규칙 2026-07-03). 천장 Crane 은 형상 선택 없이 4점 단일 상태. 각 상태 = {points, shape?}.
  const cycleStates = ceiling
    ? validPoints.map(p => ({ points: p }))
    : validPoints.flatMap(p => p === 4
      ? [{ points: 4, shape: SHAPE_QUAD }, { points: 4, shape: SHAPE_LINE }]
      : [{ points: p }])

  const patch = (p) => onChange({ ...value, ...p })
  const commitBands = (nextBands) => onChange({
    ...value,
    bands: nextBands,
    pointsPerZone: reconcilePointsPerZone(nextBands, ppz, validPoints, defaultPoints),
    shapePerZone: reconcileShapePerZone(nextBands, spz),
  })
  const setBand = (i, v) => {
    const next = [...bands]
    next[i] = Math.max(1, Math.min(maxGroups, v))
    commitBands(next)
  }
  const addBand = () => { if (!ceiling && bands.length < maxGroups) commitBands([...bands, 1]) }
  const removeBand = (i) => { if (!ceiling && bands.length > 1) commitBands(bands.filter((_, j) => j !== i)) }
  const cycleCell = (bi, si) => {
    const curP = ppz[bi]?.[si] ?? validPoints[0]
    const curS = spz[bi]?.[si] ?? SHAPE_QUAD
    // 현재 상태 index — 4점(비-천장)은 형상까지 일치해야 정확히 다음 상태로 넘어간다.
    const idx = cycleStates.findIndex(s =>
      s.points === curP && (s.points !== 4 || ceiling || s.shape === curS))
    const next = cycleStates[(idx + 1) % cycleStates.length] ?? cycleStates[0]
    const nextPpz = ppz.map(row => [...row])
    const nextSpz = spz.map(row => [...row])
    nextPpz[bi][si] = next.points
    if (next.points === 4 && !ceiling && next.shape) nextSpz[bi][si] = next.shape
    patch({ pointsPerZone: nextPpz, shapePerZone: nextSpz })
  }

  const view = useMemo(
    () => {
      if (!partitionInput) return null
      // 무게중심 분할 on 이고 COG 가 있으면 anchor 로 넘겨 미니맵도 COG 기준 격자로 그린다.
      const anchor = (cogOn && partitionInput.cog) ? partitionInput.cog : undefined
      return buildZonePartitionView(partitionInput.bbox, { ...value, pointsPerZone: ppz, shapePerZone: spz, anchor }, partitionInput.nodeEntries, partitionInput.pipeNodes)
    },
    // ppz/spz 는 매 렌더 새 배열이라 dep 식별자로 못 쓴다 → 원본 입력값들로 추적
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partitionInput, value.bandAxis, value.bands, value.pointsPerZone, value.shapePerZone, value.includePipe, cogOn],
  )

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

      {/* 무게중심 기준 분할 — 2×2면 분할선 교점이 COG, 그 이상도 격자 중심이 COG. */}
      <Row label="분할 기준">
        <Seg active={cogOn} onClick={() => patch({ cogAnchor: true })} disabled={ceiling}>무게중심(COG)</Seg>
        <Seg active={!cogOn} onClick={() => patch({ cogAnchor: false })} disabled={ceiling}>기하 중심</Seg>
        {cogOn && !hasCog && (
          <span style={{ fontSize: 10, color: '#FFC447', alignSelf: 'center' }}>COG 미확인 → 기하 중심 사용</span>
        )}
      </Row>

      {/* 4점 형상은 구역별로 지정한다(전역 설정 제거, 사용자 규칙 2026-07-03) — 미니맵에서 4점 셀을
          클릭해 사각형(▭)↔일직선(―)을 순환한다. 같은 4점이라도 구역마다 형상을 다르게 둘 수 있다. */}
      {!ceiling && (
        <div style={{ fontSize: 10.5, color: '#7a8aa2', lineHeight: 1.5, marginTop: -2 }}>
          <b style={{ color: '#90E8FF' }}>4점 형상</b>은 미니맵에서 <b>4점 구역을 클릭</b>해 구역별로 <b>사각형(▭)↔일직선(―)</b>을 지정합니다.
        </div>
      )}

      {/* groupCount 표시 — 0점(제외) 셀을 뺀 실제 권상 그룹 수 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: (over || noneActive) ? '#FF99A6' : '#9fe6c2' }}>
        <Layers size={13} />
        권상 그룹 {groupCount}개 / 최대 {maxGroups}개 <span style={{ color: '#6a7a92' }}>(0점=제외 · 자동=점 수 엔진 추천)</span>
        {over && <span style={{ fontWeight: 800 }}> · 초과! 일부 구역을 0점(제외)으로</span>}
        {noneActive && <span style={{ fontWeight: 800 }}> · 활성 구역이 없습니다</span>}
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
