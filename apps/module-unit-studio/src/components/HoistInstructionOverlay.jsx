import { useEditStore } from '../store/useEditStore.js'

export default function HoistInstructionOverlay() {
  const mode = useEditStore(s => s.hoistMode)
  const activeGroupId = useEditStore(s => s.activeHoistGroupId)
  if (!mode) return null

  const modeLabel = mode === 'hydro'   ? 'Hydro / Hook'
                  : mode === 'goliat'  ? 'Goliat / Trolley'
                  : mode === 'ceiling' ? '천장 Crane'
                  : ''

  return (
    <div
      data-testid="hoist-instruction"
      style={{
      position: 'absolute',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 24,
      background: 'rgba(8, 6, 22, 0.88)',
      border: '1px solid rgba(0,209,255,0.45)',
      borderRadius: 8,
      padding: '8px 13px',
      color: '#E8FBFF',
      boxShadow: '0 8px 26px rgba(0,0,0,0.55)',
      pointerEvents: 'none',
      userSelect: 'none',
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 0,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: '#90E8FF' }}>{modeLabel}</span>
      <span style={{ color: '#7f8fa6', margin: '0 8px' }}>·</span>
      그룹 {activeGroupId}
      <span style={{ color: '#FFDD66', marginLeft: 10 }}>Shift + Node 클릭</span>
    </div>
  )
}
