import { useMemo } from 'react'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { utilizationCss, COLOR_EXCEEDED } from '../utils/stressColorRamp.js'

const COLOR_CSS_EXCEEDED = '#' + COLOR_EXCEEDED.toString(16).padStart(6, '0')

/**
 * PickTooltip — floating tooltip shown after a node/element/mass click.
 *
 * Props:
 *   pickInfo   { type: 'node'|'element'|'mass', ... } | null
 *   position   { x, y } in viewport px (clientX/clientY)
 *
 * Element 클릭 시 Unit 구조 해석 결과(useUnitStructuralStore.result)에 해당
 * element 의 stress/axial force 가 있으면 라인에 함께 표시한다.
 */
export default function PickTooltip({ pickInfo, position, editEnabled }) {
  const unitResult = useUnitStructuralStore(s => s.result)

  // Map 캐시 — render 마다 result 가 바뀌지 않으면 재구성 안 함.
  const lookups = useMemo(() => {
    const memberMap = new Map()
    const wireMap   = new Map()
    if (unitResult) {
      for (const m of (unitResult.members ?? [])) {
        if (Number.isInteger(m?.elementId)) memberMap.set(m.elementId, m)
      }
      for (const w of (unitResult.wires ?? [])) {
        if (Number.isInteger(w?.wireElementId)) wireMap.set(w.wireElementId, w)
      }
    }
    return { memberMap, wireMap, allowableMPa: unitResult?.evaluation?.structuralAllowableMPa ?? 220 }
  }, [unitResult])

  if (!pickInfo || !position) return null

  let label
  let resultBadge = null  // 응력/장력 색배지 (element 일 때만)
  if (pickInfo.type === 'node') {
    label = `Node #${pickInfo.nodeId}`
  } else if (pickInfo.type === 'mass') {
    label = `Mass #${pickInfo.id} | Node #${pickInfo.nodeId} | ${formatMass(pickInfo.mass)}`
  } else if (pickInfo.type === 'rigid') {
    const dep = pickInfo.dependentNodes?.length ?? 0
    const tag = pickInfo.remark ? ` ${pickInfo.remark}` : ''
    const cm  = pickInfo.cm ? ` cm=${pickInfo.cm}` : ''
    label = `RBE #${pickInfo.id}${tag} | ind ${pickInfo.independentNode} ↔ dep ${dep}개${cm}`
  } else if (pickInfo.type === 'sourceName') {
    const matched = (pickInfo.elementCount ?? 0) + (pickInfo.pointMassCount ?? 0)
    label = `CSV: ${pickInfo.sourceName} | ${pickInfo.kind ?? '-'} | ${pickInfo.status ?? '-'} | 매칭 ${matched}`
  } else {
    label = `Element #${pickInfo.id} | ${pickInfo.category} | ${pickInfo.startNode} → ${pickInfo.endNode}`
    // Unit 구조 해석 결과 lookup
    const wire = lookups.wireMap.get(pickInfo.id)
    const member = wire ? null : lookups.memberMap.get(pickInfo.id)
    if (wire) {
      resultBadge = renderWireBadge(wire)
    } else if (member) {
      resultBadge = renderMemberBadge(member, lookups.allowableMPa)
    }
  }

  const editHint = editEnabled && pickInfo.type === 'element'

  return (
    <div style={{
      position: 'fixed',
      left: Math.max(8, Math.min(position.x + 16, window.innerWidth - 396)),
      top: Math.max(8, Math.min(position.y + 16, window.innerHeight - 110)),
      background: 'rgba(10,10,30,0.92)',
      color: '#e0e0e0',
      border: '1px solid #4682B4',
      borderRadius: 5,
      padding: '4px 10px',
      fontSize: 11,
      pointerEvents: 'none',
      zIndex: 9999,
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      maxWidth: 'min(380px, calc(100vw - 32px))',
    }}>
      <span>{label}</span>
      {resultBadge}
      {editHint && (
        <span style={{
          fontSize: 10, color: '#e88a8a',
          borderTop: '1px dashed rgba(255,100,100,0.25)',
          paddingTop: 3,
        }}>
          Del — 삭제  ·  Ctrl+클릭 — 다중 선택
        </span>
      )}
    </div>
  )
}

function renderMemberBadge(member, allowable) {
  const exceeds = !!member.exceedsLimit
  // 툴팁 색을 3D 오버레이와 같은 활용도 램프에서 가져온다. 예전에는 여기만 파랑/빨강
  // 2색이라, 화면에서 주황으로 칠해진 부재를 클릭하면 툴팁은 파란색으로 떴다.
  const color = exceeds ? COLOR_CSS_EXCEEDED : utilizationCss(Number(member.utilization))
  const stress = Number(member.maxStressMPa)
  const util = Number(member.utilization)
  const utilPct = Number.isFinite(util) ? Math.round(util * 100) : null
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color,
      borderTop: '1px dashed rgba(255,255,255,0.15)',
      paddingTop: 3,
    }}>
      <span style={{ fontWeight: 800 }}>σ {Number.isFinite(stress) ? stress.toFixed(1) : '-'} MPa</span>
      {utilPct !== null && (
        <span style={{ color: '#90A4B0' }}>
          ({utilPct}% / {allowable} MPa{exceeds ? ', 초과' : ''})
        </span>
      )}
    </span>
  )
}

function renderWireBadge(wire) {
  const isComp = !!wire.isCompression
  const isSlack = !!wire.isSlack
  const noResult = !wire.hasResult
  const color = noResult ? '#90A4B0' : isComp ? '#FFC447' : '#37E08A'
  const force = wire.axialForceN
  const tag = noResult ? '결과 누락' : isComp ? '압축 — 슬랙 가능' : isSlack ? '슬랙' : '인장'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color,
      borderTop: '1px dashed rgba(255,255,255,0.15)',
      paddingTop: 3,
    }}>
      <span style={{ fontWeight: 800 }}>
        Wire F {force == null ? '-' : Number(force).toLocaleString()} N
      </span>
      <span style={{ color: '#90A4B0' }}>({tag})</span>
      {Number.isInteger(wire.groupId) && (
        <span style={{ color: '#90A4B0' }}>
          · G{wire.groupId} L{wire.lugNodeId}
        </span>
      )}
    </span>
  )
}

// 입력 mass 는 NASTRAN consistent units (mm·N·s·t) 의 ton.
// kg 으로 환산해 보기 좋은 단위로 표시: ≥1 t → "X.XX t", ≥1 kg → "X.XX kg", 그 외 "X.X g".
function formatMass(massTon) {
  if (massTon == null || isNaN(massTon)) return '-'
  const kg = massTon * 1000
  if (kg >= 1000) return `${massTon.toFixed(2)} t`
  if (kg >= 1)    return `${kg.toFixed(2)} kg`
  return `${(kg * 1000).toFixed(1)} g`
}
