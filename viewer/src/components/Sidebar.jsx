import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'

const LAYER_DEFS = [
  { key: 'structure',  label: '구조',  color: '#4682B4' },
  { key: 'pipe',       label: '배관',  color: '#FF8C00' },
  { key: 'nodes',      label: '노드',  color: '#888888' },
  { key: 'rigids',     label: 'RBE',   color: '#FF00FF' },
  { key: 'masses',     label: '질량',  color: '#FFD700' },
  { key: 'boundaries', label: '경계',  color: '#00AA00' },
  { key: 'welds',      label: '용접',  color: '#FF4444' },
]

export default function Sidebar() {
  const { layers, toggleLayer } = useViewerStore()
  const { stages } = useStageStore()

  return (
    <div style={{
      width: 160, flexShrink: 0, background: '#12122a',
      borderRight: '1px solid #2a2a4a', padding: '12px 8px',
      display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
    }}>
      {/* Layer toggles */}
      <section>
        <p style={sectionTitle}>레이어</p>
        {LAYER_DEFS.map(({ key, label, color }) => (
          <label key={key} style={layerRow}>
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => toggleLayer(key)}
              style={{ accentColor: color }}
            />
            <span style={{ color, fontSize: 12 }}>{label}</span>
          </label>
        ))}
      </section>

      {/* Stage count info */}
      {stages.length > 0 && (
        <section>
          <p style={sectionTitle}>단계 정보</p>
          <p style={{ fontSize: 11, color: '#666' }}>{stages.length}개 단계 로드됨</p>
        </section>
      )}
    </div>
  )
}

const sectionTitle = { fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, margin: '0 0 8px' }
const layerRow = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '3px 0' }
