import { useViewerStore } from '../store/useViewerStore.js'

const FREE_NODE_DEFS = [
  { key: 'normal', label: '다중 요소', color: '#FF4444' },
  { key: 'free',   label: 'Free',     color: '#FFDD00' },
  { key: 'orphan', label: '고립',     color: '#CC44FF' },
]

/**
 * Floating panel inside the viewport (bottom-left).
 * Shows only the 모델 확인 combo + Free Node filters when active.
 */
export default function LayerPanel() {
  const { colorMode, setColorMode, freeNodeFilters, toggleFreeNodeFilter } = useViewerStore()

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 6,
      background: 'rgba(8, 6, 22, 0.80)',
      backdropFilter: 'blur(6px)',
      borderRadius: 10,
      padding: '10px 12px',
      border: '1px solid rgba(255,255,255,0.07)',
      userSelect: 'none',
      minWidth: 140,
    }}>
      {/* 모델 확인 콤보 */}
      <select
        value={colorMode}
        onChange={e => setColorMode(e.target.value)}
        style={{
          background: '#1a1a3a', color: '#e0e0e0',
          border: '1px solid #333', borderRadius: 6,
          padding: '4px 8px', fontSize: 11, cursor: 'pointer',
          width: '100%',
        }}
      >
        <option value="category">모델 확인</option>
        <option value="freeNode">Free Node 확인</option>
      </select>

      {/* Free Node 필터 (freeNode 모드일 때만) */}
      {colorMode === 'freeNode' && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Node 타입
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {FREE_NODE_DEFS.map(({ key, label, color }) => {
              const on = freeNodeFilters[key] ?? true
              return (
                <button
                  key={key}
                  onClick={() => toggleFreeNodeFilter(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: on ? `${color}1a` : 'transparent',
                    color: on ? color : '#3a3a5a',
                    border: `1px solid ${on ? color + '99' : '#2a2a3a'}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: on ? color : '#2a2a3a',
                    boxShadow: on ? `0 0 5px ${color}88` : 'none',
                    transition: 'all 0.15s ease',
                  }} />
                  {label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
