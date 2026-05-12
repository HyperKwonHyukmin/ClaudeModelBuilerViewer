import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'

// dock 높이(px) 영구화 — 사용자가 드래그한 높이를 다음 세션에서도 유지.
const HEIGHT_STORAGE_KEY = 'unit_structural_result_dock_height_v1'
const DEFAULT_HEIGHT = 320
const MIN_HEIGHT = 120
// MAX 는 viewport height 의 80% 로 동적 clamp (mousemove 시 계산).

/**
 * UnitStructuralResultDock — Unit 구조 해석 결과(F06 파싱 + 매핑)를 화면 하단에
 * 테이블 형태로 보여주는 dock.
 *
 * 두 탭:
 *   1. 부재 응력 — members[] 의 elementId / type / maxStressMPa / utilization / exceedsLimit
 *   2. Wire 장력 — wires[] 의 wireElementId / groupId / lugNodeId / axialForceN / 상태
 *
 * 동작:
 *   - 컬럼 헤더 클릭 → 정렬 (asc/desc 토글)
 *   - 부재 탭: "초과만" 체크박스 / element id 검색
 *   - row 클릭 → 해당 element/lug 노드를 viewer 에서 picked entity 로 설정 (focus)
 *   - 닫기 버튼 → useUnitStructuralStore.closePanel() 영향 없이 dock 만 접음 (로컬 state)
 *
 * Renders only when useUnitStructuralStore.result 가 있을 때.
 */
export default function UnitStructuralResultDock() {
  const result = useUnitStructuralStore(s => s.result)
  const summary = useUnitStructuralStore(s => s.summary)
  const allowable = result?.evaluation?.structuralAllowableMPa ?? 220

  // Sidebar / InspectorPanel 의 현재 폭 — dock 가 좌·우를 비워 두 패널을 안 가리게 사용.
  const sidebarWidth   = useViewerStore(s => s.layoutBounds.sidebarWidth)
  const inspectorWidth = useViewerStore(s => s.layoutBounds.inspectorWidth)

  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState('members')   // 'members' | 'wires'

  // 사용자가 드래그로 조절한 dock 높이(px). localStorage 에 영구화.
  const [height, setHeight] = useState(() => {
    try {
      const v = Number(localStorage.getItem(HEIGHT_STORAGE_KEY))
      if (Number.isFinite(v) && v >= MIN_HEIGHT) return v
    } catch {}
    return DEFAULT_HEIGHT
  })
  useEffect(() => {
    try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(height)) } catch {}
  }, [height])

  // 헤더 위 얇은 grip 을 잡고 위/아래로 드래그하면 dock 크기 조정.
  // 화면 80% 까지 확장, 최소 MIN_HEIGHT 까지 축소. 접혀있을 때는 비활성.
  const dragStateRef = useRef(null)  // { startY, startHeight }
  const onResizeMouseDown = useCallback((e) => {
    if (collapsed) return
    e.preventDefault()
    dragStateRef.current = { startY: e.clientY, startHeight: height }
    const onMove = (ev) => {
      const ds = dragStateRef.current
      if (!ds) return
      // 위로 드래그하면 dock 이 커지므로 (startY - currentY) 만큼 height 증가.
      const delta = ds.startY - ev.clientY
      const maxH = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * 0.8))
      const next = Math.max(MIN_HEIGHT, Math.min(maxH, ds.startHeight + delta))
      setHeight(next)
    }
    const onUp = () => {
      dragStateRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [collapsed, height])

  if (!result) return null

  return (
    <div style={{
      background: '#12122a',
      borderTop: '1px solid #2a2a4a',
      // dock 위치를 Sidebar / InspectorPanel 폭에 동적으로 맞춰 두 패널을 가리지 않게 한다.
      //   left  = Sidebar 현재 폭 → 좌측 메뉴 옆부터 시작
      //   right = InspectorPanel 현재 폭 → 우측 패널 펼침/접힘에 따라 자동 갱신
      // 두 패널이 자기 폭을 useViewerStore.layoutBounds 에 publish 한다.
      position: 'fixed',
      left: sidebarWidth,
      right: inspectorWidth,
      bottom: 0,
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      height: collapsed ? 38 : height,
      transition: dragStateRef.current ? 'none' : 'left 0.18s ease, right 0.18s ease, height 0.18s ease',
      boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.6)',
    }}>
      {!collapsed && <ResizeHandle onMouseDown={onResizeMouseDown} />}
      <Header
        summary={summary}
        allowable={allowable}
        tab={tab}
        setTab={setTab}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />
      {!collapsed && (
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px 10px' }}>
          {tab === 'members' ? (
            <MembersTable members={result.members ?? []} allowable={allowable} />
          ) : (
            <WiresTable wires={result.wires ?? []} />
          )}
        </div>
      )}
    </div>
  )
}

// dock 상단 얇은 영역 — 잡고 드래그하면 dock 높이 조정.
function ResizeHandle({ onMouseDown }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="드래그로 결과 패널 크기 조정"
      style={{
        height: 6,
        flexShrink: 0,
        cursor: 'ns-resize',
        background: hover ? 'rgba(70,130,180,0.55)' : 'transparent',
        borderTop: '1px solid #2a2a4a',
        position: 'relative',
        transition: 'background 0.15s',
      }}
    >
      {/* 가운데 작은 grip 표시 (시각적 hint) */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 32, height: 2,
        background: hover ? '#90E8FF' : '#3a3a58',
        borderRadius: 2,
        transition: 'background 0.15s',
      }} />
    </div>
  )
}

function Header({ summary, allowable, tab, setTab, collapsed, onToggleCollapse }) {
  const memberExceed = summary?.memberExceedCount ?? 0
  const memberCount = summary?.memberElementCount ?? 0
  const wireCount = summary?.wireCount ?? 0
  const wireComp = summary?.wireCompressionCount ?? 0
  const wireMissing = summary?.wireMissingResultCount ?? 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 12px',
      borderBottom: '1px solid #1e1e36', flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: '#1a1300',
        padding: '4px 12px',
        background: 'linear-gradient(180deg, #FFC447 0%, #ff9d3a 100%)',
        borderRadius: 4,
      }}>
        Unit 구조 해석 결과
      </span>

      <TabBtn active={tab === 'members'} onClick={() => setTab('members')}>
        부재 응력 ({memberCount.toLocaleString()}, 초과 {memberExceed})
      </TabBtn>
      <TabBtn active={tab === 'wires'} onClick={() => setTab('wires')}>
        Wire 장력 ({wireCount}{wireComp > 0 ? `, 압축 ${wireComp}` : ''}{wireMissing > 0 ? `, 누락 ${wireMissing}` : ''})
      </TabBtn>

      <span style={{ fontSize: 11, color: '#7aa6c8', marginLeft: 'auto' }}>
        허용 {allowable} MPa
      </span>
      <button
        onClick={onToggleCollapse}
        title={collapsed ? '결과 패널 펼치기' : '결과 패널 접기'}
        style={{
          width: 22, height: 22,
          background: 'transparent', border: '1px solid #2a2a4a',
          borderRadius: 4, color: '#7aa6c8', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, padding: 0,
        }}
      >{collapsed ? '▲' : '▼'}</button>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11.5, padding: '4px 10px',
        background: active ? '#243a66' : 'transparent',
        color: active ? '#e8f2ff' : '#90A4B0',
        border: `1px solid ${active ? '#4682B4' : '#2a2a4a'}`,
        borderRadius: 4, cursor: 'pointer',
        fontWeight: active ? 700 : 500,
      }}
    >{children}</button>
  )
}

// ── Members table ────────────────────────────────────────────────

function MembersTable({ members, allowable }) {
  const [sortKey, setSortKey] = useState('maxStressMPa')
  const [sortDir, setSortDir] = useState('desc')
  const [exceedOnly, setExceedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const setPickedEntity = useViewerStore(s => s.setPickedEntity)
  const focusPickedEntity = useViewerStore(s => s.focusPickedEntity)
  const stages = useStageStore(s => s.stages)

  const filtered = useMemo(() => {
    let rows = members
    if (exceedOnly) rows = rows.filter(m => m.exceedsLimit)
    const q = search.trim()
    if (q) rows = rows.filter(m => String(m.elementId).includes(q) || (m.type ?? '').toUpperCase().includes(q.toUpperCase()))
    rows = [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      const sign = sortDir === 'asc' ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
      return String(va ?? '').localeCompare(String(vb ?? '')) * sign
    })
    return rows
  }, [members, exceedOnly, search, sortKey, sortDir])

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  const handleRowClick = (m) => {
    // 마지막 stage 의 element 매핑으로 PickTooltip 활성화 + viewer 카메라 focus.
    // focusPickedEntity 는 카운터를 증가시켜 ViewportContainer 의 useEffect 가 활성 viewport 의
    // focusEntity API 를 호출하도록 신호한다 — 같은 element 를 다시 클릭해도 매번 확대 동작.
    const stage = stages[stages.length - 1]
    const elem = stage?.elements?.find(e => e.id === m.elementId)
    if (!elem) return
    setPickedEntity({
      type: 'element',
      id: elem.id,
      category: elem.category,
      startNode: elem.startNode,
      endNode: elem.endNode,
      propertyId: elem.propertyId,
      source: 'unitStructuralResult',
    })
    focusPickedEntity()
  }

  return (
    <div>
      <Toolbar>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#cad8e8' }}>
          <input type="checkbox" checked={exceedOnly} onChange={e => setExceedOnly(e.target.checked)} />
          초과만 ({members.filter(m => m.exceedsLimit).length}건)
        </label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Element ID 또는 Type 검색"
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: '#7aa6c8', marginLeft: 'auto' }}>
          표시 {filtered.length.toLocaleString()} / 총 {members.length.toLocaleString()}
        </span>
      </Toolbar>

      <table style={tableStyle}>
        <thead>
          <tr style={trHeadStyle}>
            <Th onClick={() => handleSort('elementId')} active={sortKey === 'elementId'} dir={sortDir} width={90}>Element ID</Th>
            <Th onClick={() => handleSort('type')} active={sortKey === 'type'} dir={sortDir} width={70}>Type</Th>
            <Th onClick={() => handleSort('maxStressMPa')} active={sortKey === 'maxStressMPa'} dir={sortDir} width={120} align="right">σ max (MPa)</Th>
            <Th onClick={() => handleSort('utilization')} active={sortKey === 'utilization'} dir={sortDir} width={90} align="right">Util</Th>
            <Th onClick={() => handleSort('exceedsLimit')} active={sortKey === 'exceedsLimit'} dir={sortDir} width={70}>판정</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 1000).map(m => (
            <tr
              key={m.elementId}
              onClick={() => handleRowClick(m)}
              style={trBodyStyle(m.exceedsLimit)}
              title="클릭 → 뷰어에서 선택"
            >
              <td style={tdStyle}>{m.elementId}</td>
              <td style={tdStyle}>{m.type}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                {Number(m.maxStressMPa).toFixed(2)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                {Number.isFinite(m.utilization) ? `${(m.utilization * 100).toFixed(1)}%` : '-'}
              </td>
              <td style={tdStyle}>
                {m.exceedsLimit
                  ? <span style={badgeStyle('#FF5566')}>초과</span>
                  : <span style={badgeStyle('#4488FF')}>정상</span>}
              </td>
            </tr>
          ))}
          {filtered.length > 1000 && (
            <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#7aa6c8' }}>
              ... {(filtered.length - 1000).toLocaleString()}개 더 있음 (검색/필터로 좁혀주세요)
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Wires table ──────────────────────────────────────────────────

function WiresTable({ wires }) {
  const [sortKey, setSortKey] = useState('axialForceN')
  const [sortDir, setSortDir] = useState('desc')
  const setPickedEntity = useViewerStore(s => s.setPickedEntity)
  const focusPickedEntity = useViewerStore(s => s.focusPickedEntity)

  const sorted = useMemo(() => {
    const rows = [...wires]
    rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      const sign = sortDir === 'asc' ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
      if (va == null && vb == null) return 0
      if (va == null) return 1   // null 은 항상 뒤로
      if (vb == null) return -1
      return String(va).localeCompare(String(vb)) * sign
    })
    return rows
  }, [wires, sortKey, sortDir])

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  const handleRowClick = (w) => {
    if (!Number.isInteger(w.lugNodeId)) return
    setPickedEntity({
      type: 'node',
      nodeId: w.lugNodeId,
      source: 'unitStructuralResult',
    })
    focusPickedEntity()
  }

  return (
    <div>
      <Toolbar>
        <span style={{ fontSize: 11, color: '#7aa6c8' }}>
          행 클릭 → 해당 lug 노드를 뷰어에서 선택
        </span>
      </Toolbar>
      <table style={tableStyle}>
        <thead>
          <tr style={trHeadStyle}>
            <Th onClick={() => handleSort('wireElementId')} active={sortKey === 'wireElementId'} dir={sortDir} width={100}>Wire EID</Th>
            <Th onClick={() => handleSort('groupId')} active={sortKey === 'groupId'} dir={sortDir} width={70}>Group</Th>
            <Th onClick={() => handleSort('lugNodeId')} active={sortKey === 'lugNodeId'} dir={sortDir} width={90}>Lug Node</Th>
            <Th onClick={() => handleSort('apexNodeId')} active={sortKey === 'apexNodeId'} dir={sortDir} width={90}>Apex Node</Th>
            <Th onClick={() => handleSort('axialForceN')} active={sortKey === 'axialForceN'} dir={sortDir} width={140} align="right">Axial Force (N)</Th>
            <Th onClick={() => handleSort('isCompression')} active={sortKey === 'isCompression'} dir={sortDir} width={90}>상태</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(w => (
            <tr
              key={w.wireElementId}
              onClick={() => handleRowClick(w)}
              style={trBodyStyle(w.isCompression || !w.hasResult)}
              title="클릭 → 해당 lug 노드 선택"
            >
              <td style={tdStyle}>{w.wireElementId}</td>
              <td style={tdStyle}>G{w.groupId}</td>
              <td style={tdStyle}>{w.lugNodeId}</td>
              <td style={tdStyle}>{w.apexNodeId}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                {w.axialForceN == null ? '-' : Number(w.axialForceN).toLocaleString()}
              </td>
              <td style={tdStyle}>
                {!w.hasResult
                  ? <span style={badgeStyle('#90A4B0')}>누락</span>
                  : w.isCompression
                    ? <span style={badgeStyle('#FFC447')}>압축</span>
                    : <span style={badgeStyle('#37E08A')}>인장</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 공용 스타일/컴포넌트 ─────────────────────────────────────────

function Toolbar({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 0 8px', flexWrap: 'wrap',
    }}>{children}</div>
  )
}

function Th({ children, onClick, active, dir, width, align }) {
  return (
    <th
      onClick={onClick}
      style={{
        ...thStyle,
        textAlign: align ?? 'left',
        width,
        minWidth: width,
        cursor: 'pointer',
        color: active ? '#90E8FF' : '#cad8e8',
        userSelect: 'none',
      }}
    >
      {children}
      {active && <span style={{ marginLeft: 4 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

const inputStyle = {
  fontSize: 11, padding: '3px 8px',
  background: 'rgba(8,6,22,0.65)',
  color: '#e6f1ff',
  border: '1px solid #2a2a4a', borderRadius: 4,
  outline: 'none', width: 200,
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11.5,
  color: '#cad8e8',
}

const thStyle = {
  padding: '6px 8px',
  background: '#1a1a36',
  borderBottom: '1px solid #2a2a4a',
  fontSize: 11,
  fontWeight: 700,
  position: 'sticky',
  top: 0,
  zIndex: 1,
}

const trHeadStyle = {}

const trBodyStyle = (highlight) => ({
  background: highlight ? 'rgba(255,85,102,0.06)' : 'transparent',
  cursor: 'pointer',
  transition: 'background 0.1s',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
})

const tdStyle = { padding: '4px 8px' }

function badgeStyle(color) {
  return {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    background: `${color}1a`,
    color,
    border: `1px solid ${color}66`,
    borderRadius: 3,
  }
}
