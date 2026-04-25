import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'

const LAYER_DEFS = [
  { key: 'structure',  label: '구조',    color: '#4682B4' },
  { key: 'pipe',       label: '배관',    color: '#FF8C00' },
  { key: 'nodes',      label: '노드',    color: '#FF4444' },
  { key: 'rigids',     label: 'RBE',     color: '#FF00FF' },
  { key: 'masses',     label: '질량',    color: '#FFD700' },
  { key: 'boundaries', label: '경계조건', color: '#00CC66' },
]

export default function Sidebar() {
  const { layers, toggleLayer } = useViewerStore()
  const { stages } = useStageStore()

  return (
    <div style={{
      width: 130, flexShrink: 0, background: '#0e0e20',
      borderRight: '1px solid #1e1e36',
      padding: '12px 10px',
      display: 'flex', flexDirection: 'column', gap: 4,
      overflowY: 'auto',
    }}>
      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
        레이어
      </div>

      {LAYER_DEFS.map(({ key, label, color }) => {
        const on = layers[key] ?? true
        return (
          <button
            key={key}
            onClick={() => toggleLayer(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: on ? `${color}18` : 'transparent',
              color: on ? color : '#343454',
              border: `1px solid ${on ? color + '88' : '#1e1e36'}`,
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              width: '100%',
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

      {stages.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e1e36' }}>
          <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>단계 정보</div>
          <p style={{ fontSize: 11, color: '#555' }}>{stages.length}개 단계</p>
        </div>
      )}
    </div>
  )
}
