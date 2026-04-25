import { useViewerStore } from '../store/useViewerStore.js'

const LAYER_DEFS = [
  { key: 'structure',  label: '구조',    color: '#4682B4' },
  { key: 'pipe',       label: '배관',    color: '#FF8C00' },
  { key: 'nodes',      label: '노드',    color: '#FF4444' },
  { key: 'rigids',     label: 'RBE',     color: '#FF00FF' },
  { key: 'masses',     label: '질량',    color: '#FFD700' },
  { key: 'boundaries', label: '경계조건', color: '#00CC66' },
]

const FREE_NODE_DEFS = [
  { key: 'normal', label: '다중 요소', color: '#FF4444' },
  { key: 'free',   label: 'Free',     color: '#FFDD00' },
  { key: 'orphan', label: '고립',     color: '#CC44FF' },
]

/**
 * Floating layer toggle panel — overlaid at the bottom-left of the viewport area.
 * Uses pill-style buttons (lit = ON, dimmed = OFF) instead of checkboxes.
 */
export default function LayerPanel() {
  const { layers, toggleLayer, colorMode, freeNodeFilters, toggleFreeNodeFilter } = useViewerStore()

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 6,
      background: 'rgba(8, 6, 22, 0.78)',
      backdropFilter: 'blur(6px)',
      borderRadius: 10,
      padding: '10px 12px',
      border: '1px solid rgba(255,255,255,0.07)',
      userSelect: 'none',
    }}>
      {/* Section title */}
      <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
        레이어
      </div>

      {/* Layer pills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {LAYER_DEFS.map(({ key, label, color }) => {
          const on = layers[key] ?? true
          return (
            <Pill
              key={key}
              label={label}
              color={color}
              on={on}
              onClick={() => toggleLayer(key)}
            />
          )
        })}
      </div>

      {/* Free Node sub-filters (only shown in freeNode mode) */}
      {colorMode === 'freeNode' && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
            Node 타입
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {FREE_NODE_DEFS.map(({ key, label, color }) => {
              const on = freeNodeFilters[key] ?? true
              return (
                <Pill
                  key={key}
                  label={label}
                  color={color}
                  on={on}
                  onClick={() => toggleFreeNodeFilter(key)}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function Pill({ label, color, on, onClick }) {
  return (
    <button
      onClick={onClick}
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
        minWidth: 90,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: on ? color : '#2a2a3a',
        flexShrink: 0,
        boxShadow: on ? `0 0 5px ${color}88` : 'none',
        transition: 'all 0.15s ease',
      }} />
      {label}
    </button>
  )
}
