import { useViewerStore } from '../store/useViewerStore.js'

function groupColor(index, total) {
  const hue = (index / Math.max(total, 1)) * 360
  return `hsl(${hue}, 65%, 55%)`
}

const FREE_NODE_DEFS = [
  { key: 'normal', label: 'Shared',  color: '#FF4455' },
  { key: 'free',   label: 'Free',    color: '#FFDD00' },
  { key: 'orphan', label: 'Orphan',  color: '#CC44FF' },
]

const MODE_DEFS = [
  { key: 'category', icon: '▬', label: '기본',       desc: '구조 / 배관 구분색' },
  { key: 'freeNode', icon: '○', label: 'Free Node',  desc: '노드 연결 상태' },
  { key: 'group',    icon: '⊞', label: 'Group',      desc: '연결 그룹' },
]

export default function LayerPanel({ stageData }) {
  const {
    colorMode, setColorMode,
    freeNodeFilters, toggleFreeNodeFilter,
    groupFilters, toggleGroupFilter, setAllGroupFilters,
  } = useViewerStore()

  const groups = stageData?.groups ?? []
  const maxIndividual = groups.length <= 5 ? groups.length : 10
  const totalOthers = groups.length > maxIndividual ? groups.length - maxIndividual : 0
  const othersElemCount = totalOthers > 0
    ? groups.slice(maxIndividual).reduce((s, g) => s + g.elementIds.length, 0)
    : 0

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 20,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(8, 6, 22, 0.92)',
      backdropFilter: 'blur(12px)',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.1)',
      userSelect: 'none',
      minWidth: 150,
      overflow: 'hidden',
      boxShadow: '0 6px 28px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px 6px',
        fontSize: 10, color: '#7ab2d4', letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 800,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        모델 확인
      </div>

      {/* Mode selector */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '5px 6px', gap: 2 }}>
        {MODE_DEFS.map(({ key, icon, label, desc }) => {
          const active = colorMode === key
          return (
            <button
              key={key}
              onClick={() => setColorMode(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px',
                background: active ? 'rgba(70,130,180,0.2)' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${active ? '#4682B4' : 'transparent'}`,
                borderRadius: '0 6px 6px 0',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s ease', width: '100%',
              }}
            >
              <span style={{ fontSize: 12, color: active ? '#5BA8E5' : '#3a3a6a', width: 15, textAlign: 'center' }}>{icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#e8e8f0' : '#555' }}>{label}</span>
                <span style={{ fontSize: 9, color: active ? '#7a9ab8' : '#3a3a5a' }}>{desc}</span>
              </div>
              {active && <span style={{ marginLeft: 'auto', color: '#4682B4', fontSize: 9 }}>▶</span>}
            </button>
          )
        })}
      </div>

      {/* Free Node 서브 컨트롤 */}
      {colorMode === 'freeNode' && (
        <SubSection title="Node 타입 필터">
          {FREE_NODE_DEFS.map(({ key, label, color }) => (
            <FilterBtn key={key} on={freeNodeFilters[key] ?? true} color={color} label={label} onClick={() => toggleFreeNodeFilter(key)} />
          ))}
        </SubSection>
      )}

      {/* Group 서브 컨트롤 */}
      {colorMode === 'group' && groups.length > 0 && (
        <SubSection title={`그룹 (${groups.length}개)`}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button onClick={() => setAllGroupFilters(true, groups, maxIndividual)}  style={allBtnStyle('#1e3a5a')}>전체 표시</button>
            <button onClick={() => setAllGroupFilters(false, groups, maxIndividual)} style={allBtnStyle('#2a1a3a')}>전체 숨김</button>
          </div>
          {groups.slice(0, maxIndividual).map((g, i) => {
            const color = groupColor(i, maxIndividual + (totalOthers > 0 ? 1 : 0))
            return (
              <FilterBtn key={g.id} on={groupFilters[i] !== false} color={color}
                label={`그룹 ${i + 1}`} sub={`${g.elementIds.length}개 요소`}
                onClick={() => toggleGroupFilter(i)} />
            )
          })}
          {totalOthers > 0 && (
            <FilterBtn on={groupFilters['others'] !== false}
              color={groupColor(maxIndividual, maxIndividual + 1)}
              label={`기타 (${totalOthers}개)`} sub={`${othersElemCount}개 요소`}
              onClick={() => toggleGroupFilter('others')} />
          )}
        </SubSection>
      )}

      {colorMode === 'group' && groups.length === 0 && (
        <div style={{ padding: '6px 12px 8px', fontSize: 10, color: '#444' }}>그룹 데이터 없음</div>
      )}
    </div>
  )
}

function SubSection({ title, children }) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '6px 8px 8px' }}>
      <div style={{ fontSize: 9, color: '#7ab2d4', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5, paddingLeft: 2, fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {children}
      </div>
    </div>
  )
}

function FilterBtn({ on, color, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: on ? `${color}1e` : 'transparent',
        color: on ? color : '#3a3a5a',
        border: `1px solid ${on ? color + '99' : '#252535'}`,
        borderRadius: 6,
        padding: sub ? '5px 8px' : '5px 10px',
        fontSize: 11, fontWeight: 700,
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s ease', width: '100%',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: on ? color : '#2a2a3a',
        boxShadow: on ? `0 0 5px ${color}aa` : 'none',
        transition: 'all 0.15s ease',
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span>{label}</span>
        {sub && <span style={{ fontSize: 9, color: on ? color : '#2a2a4a', opacity: on ? 0.65 : 1, fontWeight: 400 }}>{sub}</span>}
      </div>
    </button>
  )
}

const allBtnStyle = (bg) => ({
  flex: 1, padding: '4px 0',
  background: bg, color: '#aaa',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
})
