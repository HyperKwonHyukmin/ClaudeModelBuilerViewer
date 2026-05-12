/**
 * PickTooltip — floating tooltip shown after a node/element/mass click.
 *
 * Props:
 *   pickInfo   { type: 'node'|'element'|'mass', ... } | null
 *   position   { x, y } in viewport px (clientX/clientY)
 */
export default function PickTooltip({ pickInfo, position }) {
  if (!pickInfo || !position) return null

  let label
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
  }

  return (
    <div style={{
      position: 'fixed',
      left: position.x + 12,
      top:  position.y - 10,
      background: 'rgba(10,10,30,0.92)',
      color: '#e0e0e0',
      border: '1px solid #4682B4',
      borderRadius: 5,
      padding: '4px 10px',
      fontSize: 11,
      pointerEvents: 'none',
      zIndex: 9999,
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    }}>
      {label}
    </div>
  )
}

/**
 * 입력 mass는 kg 단위 (기존 InspectorPanel/HealthTab 표기와 일치).
 * 보기 좋게 자동 변환:
 *   ≥ 1000 kg → "X.XX t"
 *   ≥ 1 kg    → "X.XX kg"
 *   < 1 kg    → "X.X g"
 */
function formatMass(mass) {
  if (mass == null || isNaN(mass)) return '-'
  if (mass >= 1000) return `${(mass / 1000).toFixed(2)} t`
  if (mass >= 1)    return `${mass.toFixed(2)} kg`
  const g = mass * 1000
  return `${g.toFixed(1)} g`
}
