/**
 * PickTooltip — floating tooltip shown after a node/element click.
 *
 * Props:
 *   pickInfo   { type: 'node'|'element', nodeId?, elementId?, ... } | null
 *   position   { x, y } in viewport px (clientX/clientY)
 */
export default function PickTooltip({ pickInfo, position }) {
  if (!pickInfo || !position) return null

  let label
  if (pickInfo.type === 'node') {
    label = `Node #${pickInfo.nodeId}`
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
