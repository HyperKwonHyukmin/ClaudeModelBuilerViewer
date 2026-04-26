import { useState, useEffect, useCallback, useRef } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { StageData } from '../data/StageData.js'

const TABS = ['메타', '모델지표', '연결성', '진단', '추적']
const TRACE_PAGE_SIZE = 50
const MIN_WIDTH = 200
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 300

export default function InspectorPanel() {
  const [tab, setTab] = useState('메타')
  const [tracePage, setTracePage] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef(null)

  const { stages } = useStageStore()
  const { viewports, activeViewportId, pickedEntity } = useViewerStore()

  useEffect(() => { setTracePage(0) }, [activeViewportId])

  const activeVp = viewports.find(v => v.id === activeViewportId)
  const stage = activeVp ? stages[activeVp.stageIndex] : null

  // ── Resize drag ───────────────────────────────────────────────────────
  const onDragMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width

    const onMove = (ev) => {
      const delta = startX - ev.clientX   // dragging left = wider
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  // ── Collapsed: just show a thin toggle strip ──────────────────────────
  if (collapsed) {
    return (
      <div style={{
        width: 20, flexShrink: 0,
        background: '#0e0e20', borderLeft: '1px solid #2a2a4a',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 8, cursor: 'pointer', userSelect: 'none',
      }} onClick={() => setCollapsed(false)} title="패널 열기">
        <span style={{ color: '#4682B4', fontSize: 12, writingMode: 'vertical-rl', letterSpacing: 1 }}>◀</span>
      </div>
    )
  }

  // ── Expanded panel ────────────────────────────────────────────────────
  return (
    <div style={{ width, flexShrink: 0, display: 'flex', position: 'relative' }}>
      {/* Drag handle — left edge */}
      <div
        ref={dragRef}
        onMouseDown={onDragMouseDown}
        style={{
          width: 4, flexShrink: 0, cursor: 'col-resize',
          background: 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#4682B488' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      />

      {/* Panel body */}
      <div style={{ flex: 1, background: '#12122a', borderLeft: '1px solid #2a2a4a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab bar + collapse button */}
        <div style={{ display: 'flex', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
          <div style={{ display: 'flex', flex: 1, overflowX: 'hidden' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setTracePage(0) }} style={tabStyle(tab === t)}>
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCollapsed(true)}
            title="패널 닫기"
            style={{ padding: '0 8px', background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
          >▶</button>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
          {!stage && <p style={{ color: '#444', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>파일을 로드하세요</p>}
          {stage && tab === '메타' && <MetaTab stage={stage} pickedEntity={pickedEntity} />}
          {stage && tab === '모델지표' && <HealthTab stage={stage} />}
          {stage && tab === '연결성' && <ConnectivityTab stage={stage} />}
          {stage && tab === '진단' && <DiagnosticsTab stage={stage} />}
          {stage && tab === '추적' && <TraceTab stage={stage} page={tracePage} setPage={setTracePage} pickedEntity={pickedEntity} />}
        </div>
      </div>
    </div>
  )
}

// ── Tab components ──────────────────────────────────────────

function MetaTab({ stage, pickedEntity }) {
  const m = stage.meta ?? {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {pickedEntity && <PickedEntitySection entity={pickedEntity} stage={stage} />}
      <Row label="단계명" value={m.stageName} />
      <Row label="Phase" value={m.phase} />
      <Row label="스키마" value={m.schemaVersion} />
      <Row label="단위" value={m.unit} />
      <Row label="타임스탬프" value={m.timestamp ? new Date(m.timestamp).toLocaleString('ko-KR') : '-'} />
    </div>
  )
}

function HealthTab({ stage }) {
  const t = stage.healthMetrics?.totals ?? {}
  const issues = stage.healthMetrics?.issues ?? {}
  const diagCounts = stage.healthMetrics?.diagnosticCounts ?? {}
  const lenCat = t.lengthByCategoryMm ?? {}

  // Total mass from pointMasses
  const totalMass = stage.pointMasses?.reduce((s, pm) => s + (pm.mass ?? 0), 0) ?? 0

  return (
    <div>
      <Section title="통계">
        <Row label="노드" value={fmt(t.nodeCount)} />
        <Row label="요소 (전체)" value={fmt(t.elementCount)} />
        <Row label="요소 (구조)" value={fmt(t.elementsByCategory?.Structure)} highlight="#4682B4" />
        <Row label="요소 (배관)" value={fmt(t.elementsByCategory?.Pipe)} highlight="#FF8C00" />
        <Row label="RBE" value={fmt(t.rigidCount)} />
        <Row label="집중질량" value={`${fmt(t.pointMassCount)}개 (${totalMass.toFixed(2)} kg)`} />
      </Section>

      <Section title="길이">
        {t.totalLengthMm != null && <Row label="총 길이" value={`${(t.totalLengthMm / 1000).toFixed(1)} m`} />}
        {lenCat.Structure != null && <Row label="구조 길이" value={`${(lenCat.Structure / 1000).toFixed(1)} m`} highlight="#4682B4" />}
        {lenCat.Pipe != null && <Row label="배관 길이" value={`${(lenCat.Pipe / 1000).toFixed(1)} m`} highlight="#FF8C00" />}
      </Section>

      <Section title="이슈">
        <Row label="자유단 노드" value={fmt(issues.freeEndNodes)} warn={issues.freeEndNodes > 0} />
        <Row label="Orphan 노드" value={fmt(issues.orphanNodes)} warn={issues.orphanNodes > 0} />
        <Row label="단락 요소" value={fmt(issues.shortElements)} warn={issues.shortElements > 0} />
        <Row label="미연결 그룹" value={fmt(issues.disconnectedGroups)} warn={issues.disconnectedGroups > 0} />
        <Row label="미해결 U-bolt" value={fmt(issues.unresolvedUbolts)} warn={issues.unresolvedUbolts > 0} />
      </Section>

      {Object.keys(diagCounts.byCode ?? {}).length > 0 && (
        <Section title="진단 코드 요약">
          {Object.entries(diagCounts.byCode).map(([code, cnt]) => (
            <Row key={code} label={code} value={fmt(cnt)} warn />
          ))}
        </Section>
      )}

      {/* 재질 정보 */}
      {stage.materials?.length > 0 && (
        <Section title="재질">
          {stage.materials.map(m => (
            <div key={m.id} style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>
              {m.name} — E={fmt(m.E)} MPa, ν={m.nu}, ρ={m.rho}
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

function ConnectivityTab({ stage }) {
  const c = stage.connectivity ?? {}
  const ratio = c.largestGroupNodeRatio
  return (
    <div>
      <Section title="연결성">
        <Row label="그룹 수" value={fmt(c.groupCount)} />
        <Row label="최대 그룹 노드" value={fmt(c.largestGroupNodeCount)} />
        <Row label="최대 그룹 요소" value={fmt(c.largestGroupElementCount)} />
        {ratio != null && <Row label="최대 그룹 비율" value={`${(ratio * 100).toFixed(1)}%`} />}
        <Row label="Orphan 노드 수" value={fmt(c.isolatedNodeCount)} warn={c.isolatedNodeCount > 0} />
      </Section>

      {/* 단면 종류 분포 */}
      {stage.properties?.length > 0 && (() => {
        const kindCounts = {}
        for (const e of stage.elements ?? []) {
          const prop = stage.getProperty?.(e.propertyId)
          if (prop) kindCounts[prop.kind] = (kindCounts[prop.kind] ?? 0) + 1
        }
        return (
          <Section title="단면 분포">
            {Object.entries(kindCounts).sort((a, b) => b[1] - a[1]).map(([kind, cnt]) => (
              <Row key={kind} label={kind} value={fmt(cnt)} />
            ))}
          </Section>
        )
      })()}
    </div>
  )
}

function DiagnosticsTab({ stage }) {
  const diags = stage.diagnostics ?? []
  if (diags.length === 0) {
    return <p style={{ color: '#555', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>진단 항목 없음</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {diags.map((d, i) => (
        <div key={i} style={{ background: '#1a1a3a', borderRadius: 4, padding: '6px 8px', borderLeft: `3px solid ${sevColor(d.severity)}` }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: sevColor(d.severity), fontWeight: 700 }}>{d.severity}</span>
            <span style={{ fontSize: 10, color: '#666' }}>{d.code}</span>
          </div>
          <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>{d.msg}</p>
        </div>
      ))}
    </div>
  )
}

// stage 이름 순서 (생애 추적 정렬용)
const STAGE_ORDER = ['initial','Meshing','NodeEquivalence','Intersection','DanglingShortRemove','CollinearNodeMerge','ExtendToIntersect','SplitByExistingNodes','UboltRbe']
const ACTION_COLOR = {
  ElementCreated: '#44cc88', ElementRemoved: '#ff4444',
  ElementSplit: '#ffaa00', NodeMerged: '#4488ff', NodeMoved: '#cc44ff',
}
const ALL_ACTIONS = ['ElementCreated','ElementRemoved','ElementSplit','NodeMerged','NodeMoved']

function TraceTab({ stage, page, setPage, pickedEntity }) {
  const [mode, setMode] = useState('pipeline')  // 'pipeline' | 'lifecycle' | 'filter'
  const [actionFilter, setActionFilter] = useState('all')
  const [stageFilter,  setStageFilter]  = useState('all')
  const [searchQuery,  setSearchQuery]  = useState('')
  const { setPickedEntity } = useViewerStore()

  const trace = stage.trace ?? []

  if (trace.length === 0) {
    return <p style={{ color: '#555', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>추적 항목 없음</p>
  }

  const stageNames = STAGE_ORDER.filter(s => trace.some(t => t.stage === s))

  const switchToFilter = (stageName) => {
    setStageFilter(stageName)
    setMode('filter')
    setPage(0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 2, background: '#1a1a3a', borderRadius: 6, padding: 2 }}>
        {[['pipeline', '파이프라인'], ['lifecycle', '생애 추적'], ['filter', '필터 테이블']].map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)} style={{
            flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 600,
            background: mode === key ? '#2a3a6a' : 'transparent',
            color: mode === key ? '#e0e0e0' : '#555',
            border: 'none', borderRadius: 5, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {mode === 'pipeline' && (
        <PipelineView trace={trace} stageNames={stageNames} onStageClick={switchToFilter} />
      )}
      {mode === 'lifecycle' && (
        <LifecycleView trace={trace} pickedEntity={pickedEntity} stage={stage} setPickedEntity={setPickedEntity} />
      )}
      {mode === 'filter' && (
        <FilterTableView
          trace={trace} page={page} setPage={setPage}
          actionFilter={actionFilter} setActionFilter={setActionFilter}
          stageFilter={stageFilter} setStageFilter={setStageFilter}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          stageNames={stageNames} stage={stage} setPickedEntity={setPickedEntity}
        />
      )}
    </div>
  )
}

// ── 파이프라인 요약 ────────────────────────────────────────────────────────

function PipelineView({ trace, stageNames, onStageClick }) {
  // 단계별 액션 카운트
  const byStage = {}
  for (const t of trace) {
    if (!byStage[t.stage]) byStage[t.stage] = {}
    byStage[t.stage][t.action] = (byStage[t.stage][t.action] ?? 0) + 1
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <p style={{ fontSize: 9, color: '#444', margin: '0 0 4px', letterSpacing: 0.5 }}>
        단계별 모델 변경 이력 · 클릭하면 필터 테이블로 이동
      </p>
      {stageNames.map((stageName, idx) => {
        const counts  = byStage[stageName] ?? {}
        const created = counts.ElementCreated ?? 0
        const removed = counts.ElementRemoved ?? 0
        const split   = counts.ElementSplit   ?? 0
        const merged  = counts.NodeMerged     ?? 0
        const moved   = counts.NodeMoved      ?? 0
        const netElem = created - removed
        const total   = created + removed + split + merged + moved

        const bars = [
          { cnt: created, color: '#44cc88' },
          { cnt: removed, color: '#ff4444' },
          { cnt: split,   color: '#ffaa00' },
          { cnt: merged,  color: '#4488ff' },
          { cnt: moved,   color: '#cc44ff' },
        ].filter(x => x.cnt > 0)

        return (
          <div
            key={stageName}
            onClick={() => onStageClick(stageName)}
            style={{ background: '#1a1a3a', borderRadius: 5, padding: '6px 8px', cursor: 'pointer', border: '1px solid transparent', transition: 'border-color 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4682B4' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: '#4682B4', background: 'rgba(70,130,180,0.15)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 10, color: '#ccc', fontWeight: 600 }}>{stageName}</span>
              </div>
              {total > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: netElem > 0 ? '#44cc88' : netElem < 0 ? '#ff6666' : '#888' }}>
                  {netElem > 0 ? '+' : ''}{netElem} 요소
                </span>
              )}
            </div>

            {/* 비율 바 */}
            {total > 0 && (
              <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 4, background: '#0d0d1a' }}>
                {bars.map(({ cnt, color }, i) => (
                  <div key={i} style={{ flex: cnt, background: color }} />
                ))}
              </div>
            )}

            {/* 카운트 태그 */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {created > 0 && <span style={{ fontSize: 9, color: '#44cc88' }}>+{created} 생성</span>}
              {removed > 0 && <span style={{ fontSize: 9, color: '#ff6666' }}>−{removed} 삭제</span>}
              {split   > 0 && <span style={{ fontSize: 9, color: '#ffaa00' }}>÷{split} 분할</span>}
              {merged  > 0 && <span style={{ fontSize: 9, color: '#4488ff' }}>⊕{merged} 병합</span>}
              {moved   > 0 && <span style={{ fontSize: 9, color: '#cc44ff' }}>↔{moved} 이동</span>}
              {total  === 0 && <span style={{ fontSize: 9, color: '#333' }}>변경 없음</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 생애 추적 ──────────────────────────────────────────────────────────────

function LifecycleView({ trace, pickedEntity, stage, setPickedEntity }) {
  if (!pickedEntity || pickedEntity.type !== 'element') {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#444', fontSize: 11 }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>↖</div>
        3D 뷰에서 요소를 클릭하면<br />전체 생애를 추적합니다
      </div>
    )
  }

  const targetId  = pickedEntity.id
  const currentEl = stage.elements?.find(e => e.id === targetId)  // 현재 단계 존재 여부

  // 직접 이벤트: E3635 자신이 주체이거나 대상인 행
  const primary = trace.filter(t => t.elemId === targetId || t.relatedElemId === targetId)
  // 파생 이벤트: 직접 이벤트에서 생성된 자식 요소들의 이력
  const childIds = new Set(
    primary.flatMap(t => [t.relatedElemId]).filter(id => id != null && id !== targetId)
  )
  const secondary = childIds.size > 0
    ? trace.filter(t =>
        (childIds.has(t.elemId) || childIds.has(t.relatedElemId)) &&
        !primary.includes(t)
      )
    : []

  const sortByStage = arr => [...arr].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
  const primarySorted   = sortByStage([...new Map(primary.map(t => [JSON.stringify(t), t])).values()])
  const secondarySorted = sortByStage([...new Map(secondary.map(t => [JSON.stringify(t), t])).values()])

  const trySelect = (elemId) => {
    if (elemId == null) return
    const elem = stage.elements?.find(e => e.id === elemId)
    if (elem) setPickedEntity({ type: 'element', id: elem.id, category: elem.category, startNode: elem.startNode, endNode: elem.endNode, propertyId: elem.propertyId })
  }

  if (primarySorted.length === 0 && secondarySorted.length === 0) {
    return <p style={{ color: '#555', fontSize: 11, textAlign: 'center', paddingTop: 12 }}>추적 기록 없음 (E#{targetId})</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── 현재 단계 요소 정보 박스 ── */}
      <div style={{
        background: currentEl ? 'rgba(70,130,180,0.1)' : 'rgba(80,40,40,0.2)',
        border: `1px solid ${currentEl ? '#4682B4' : '#664444'}`,
        borderRadius: 6, padding: '7px 10px',
      }}>
        <div style={{ fontSize: 10, color: currentEl ? '#4682B4' : '#aa6666', fontWeight: 700, marginBottom: 4 }}>
          E#{targetId} — {currentEl ? '현재 단계에 존재' : '현재 단계에 없음 (삭제/분할됨)'}
        </div>
        {currentEl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Row label="카테고리" value={currentEl.category} />
            <Row label="시작 노드" value={currentEl.startNode} />
            <Row label="끝 노드"   value={currentEl.endNode} />
            <Row label="Property" value={currentEl.propertyId} />
          </div>
        ) : (
          <p style={{ fontSize: 10, color: '#666', margin: 0 }}>
            이 요소는 이전 단계에서 분할·삭제되어 현재 단계에서 더 이상 존재하지 않습니다.
            아래 이력에서 어떤 요소로 이어졌는지 확인하세요.
          </p>
        )}
      </div>

      {/* ── 직접 이벤트 (E3635 자신) ── */}
      {primarySorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#4682B4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
            E#{targetId} 직접 이력 ({primarySorted.length}건)
          </div>
          <EventList events={primarySorted} targetId={targetId} stage={stage} trySelect={trySelect} isDerived={false} />
        </div>
      )}

      {/* ── 파생 이벤트 (분할로 생성된 자식들) ── */}
      {secondarySorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
            파생 요소 이력 ({secondarySorted.length}건) — 분할로 생성된 자식 요소
          </div>
          <EventList events={secondarySorted} targetId={targetId} stage={stage} trySelect={trySelect} isDerived={true} />
        </div>
      )}
    </div>
  )
}

function EventList({ events, targetId, stage, trySelect, isDerived }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 16 }}>
      <div style={{ position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, background: isDerived ? 'rgba(100,100,120,0.2)' : 'rgba(70,130,180,0.2)', borderRadius: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((t, i) => {
          const ac      = ACTION_COLOR[t.action] ?? '#888'
          const clickId = t.elemId ?? t.relatedElemId
          const exists  = stage.elements?.some(e => e.id === clickId)

          // 이 이벤트에서 무슨 일이 일어났는지 한국어 요약
          const summary = (() => {
            if (t.action === 'ElementCreated')  return `E#${t.elemId} 생성${t.relatedElemId ? ` (원본 E#${t.relatedElemId})` : ''}`
            if (t.action === 'ElementRemoved')  return `E#${t.elemId} 삭제`
            if (t.action === 'ElementSplit')    return `E#${t.elemId} 분할 → E#${t.relatedElemId} 생성`
            if (t.action === 'NodeMerged')      return `N#${t.nodeId} → N#${t.relatedNodeId} 로 병합`
            if (t.action === 'NodeMoved')       return `N#${t.nodeId} 위치 이동`
            return t.action
          })()

          return (
            <div
              key={i}
              onClick={() => trySelect(clickId)}
              title={exists ? `E#${clickId} 클릭 시 3D 선택` : '현재 단계에 없는 요소'}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: exists ? 'pointer' : 'default', opacity: exists ? 1 : 0.5 }}
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: ac, flexShrink: 0, marginTop: 2, boxShadow: `0 0 5px ${ac}88`, zIndex: 1 }} />
              <div
                style={{ background: isDerived ? '#141428' : '#1a1a3a', borderRadius: 4, padding: '4px 7px', flex: 1, transition: 'background 0.1s' }}
                onMouseEnter={e => { if (exists) e.currentTarget.style.background = '#222244' }}
                onMouseLeave={e => { e.currentTarget.style.background = isDerived ? '#141428' : '#1a1a3a' }}
              >
                {/* 한국어 요약 한 줄 */}
                <div style={{ fontSize: 10, color: '#ccc', fontWeight: 600, marginBottom: 2 }}>{summary}</div>
                {/* 상세: 단계 + note */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: '#4682B4', background: 'rgba(70,130,180,0.12)', padding: '1px 5px', borderRadius: 3 }}>{t.stage}</span>
                  {!exists && <span style={{ fontSize: 8, color: '#555' }}>현 단계 없음</span>}
                </div>
                {t.note && <p style={{ fontSize: 9, color: '#666', margin: '2px 0 0', wordBreak: 'break-all' }}>{t.note}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 필터 테이블 ────────────────────────────────────────────────────────────

function FilterTableView({ trace, page, setPage, actionFilter, setActionFilter, stageFilter, setStageFilter, searchQuery, setSearchQuery, stageNames, stage, setPickedEntity }) {
  const filtered = trace.filter(t => {
    if (actionFilter !== 'all' && t.action !== actionFilter) return false
    if (stageFilter  !== 'all' && t.stage  !== stageFilter)  return false
    if (searchQuery) {
      const q = searchQuery.trim()
      if (!String(t.elemId ?? '').includes(q) && !String(t.nodeId ?? '').includes(q) &&
          !String(t.relatedElemId ?? '').includes(q) && !String(t.relatedNodeId ?? '').includes(q)) return false
    }
    return true
  })

  const total     = filtered.length
  const pageCount = Math.ceil(total / TRACE_PAGE_SIZE)
  const safePage  = Math.min(page, Math.max(0, pageCount - 1))
  const slice     = filtered.slice(safePage * TRACE_PAGE_SIZE, (safePage + 1) * TRACE_PAGE_SIZE)

  // 전체 액션 카운트 (필터 미적용 기준)
  const counts = {}
  for (const t of trace) counts[t.action] = (counts[t.action] ?? 0) + 1

  // 행 클릭 → 3D 선택
  const trySelect = (t) => {
    const elemId = t.elemId ?? t.relatedElemId
    if (elemId == null) return
    const elem = stage.elements?.find(e => e.id === elemId)
    if (elem) setPickedEntity({ type: 'element', id: elem.id, category: elem.category, startNode: elem.startNode, endNode: elem.endNode, propertyId: elem.propertyId })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* 요약 태그 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {ALL_ACTIONS.map(a => (
          <button
            key={a}
            onClick={() => { setActionFilter(actionFilter === a ? 'all' : a); setPage(0) }}
            style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
              color: ACTION_COLOR[a],
              background: actionFilter === a ? `${ACTION_COLOR[a]}33` : `${ACTION_COLOR[a]}12`,
              border: `1px solid ${actionFilter === a ? ACTION_COLOR[a] : 'transparent'}`,
            }}
          >
            {a.replace('Element', 'E.').replace('Node', 'N.')}: {counts[a] ?? 0}
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <select value={stageFilter} onChange={e => { setStageFilter(e.target.value); setPage(0) }} style={filterSelect}>
          <option value="all">단계: 전체</option>
          {stageNames.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(0) }}
          placeholder="ID 검색 (elemId, nodeId…)"
          style={{ ...filterSelect, outline: 'none' }}
        />
      </div>

      {/* 결과 수 */}
      <p style={{ fontSize: 10, color: '#555', margin: 0 }}>
        {fmt(total)}건 ({safePage + 1}/{Math.max(1, pageCount)} 페이지) · <span style={{ color: '#4682B4' }}>행 클릭 시 3D 선택</span>
      </p>

      {/* 행 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {slice.map((t, i) => {
          const ac     = ACTION_COLOR[t.action] ?? '#888'
          const elemId = t.elemId ?? t.relatedElemId
          const exists = elemId != null && stage.elements?.some(e => e.id === elemId)
          return (
            <div
              key={i}
              onClick={() => trySelect(t)}
              title={exists ? `E#${elemId} 3D 선택` : undefined}
              style={{ background: '#1a1a3a', borderRadius: 3, padding: '4px 7px', fontSize: 10, borderLeft: `2px solid ${ac}`, cursor: exists ? 'pointer' : 'default', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (exists) e.currentTarget.style.background = '#222244' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1a1a3a' }}
            >
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: ac, fontWeight: 700 }}>{t.action}</span>
                <span style={{ color: '#4682B4', fontSize: 9 }}>[{t.stage}]</span>
                {t.elemId        != null && <span style={{ color: '#aaa' }}>E:{t.elemId}</span>}
                {t.nodeId        != null && <span style={{ color: '#aaa' }}>N:{t.nodeId}</span>}
                {t.relatedElemId != null && <span style={{ color: '#666' }}>→E:{t.relatedElemId}</span>}
                {t.relatedNodeId != null && <span style={{ color: '#666' }}>→N:{t.relatedNodeId}</span>}
              </div>
              {t.note && <p style={{ color: '#666', margin: '2px 0 0', wordBreak: 'break-all' }}>{t.note}</p>}
            </div>
          )
        })}
      </div>

      {pageCount > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} style={navBtn}>◀</button>
          <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} style={navBtn}>▶</button>
        </div>
      )}
    </div>
  )
}

const filterSelect = {
  background: '#1a1a3a', color: '#aaa', border: '1px solid #2a2a4a',
  borderRadius: 4, padding: '3px 6px', fontSize: 10, width: '100%',
}

// ── Helpers ──────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>{title}</p>
      {children}
    </div>
  )
}

function PickedEntitySection({ entity, stage }) {
  const isNode = entity.type === 'node'

  // Element detail lookups
  let prop = null, mat = null, elemLength = null, sourceName = null
  if (!isNode && stage) {
    const fullElem = stage.elements?.find(e => e.id === entity.id)
    prop = stage.getProperty?.(entity.propertyId)
    mat  = prop ? stage.getMaterial?.(prop.materialId) : null
    sourceName = fullElem?.sourceName
    // Compute element length
    const a = stage.nodeMap?.get(entity.startNode)
    const b = stage.nodeMap?.get(entity.endNode)
    if (a && b) elemLength = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)
  }

  // Node detail: check if mass node
  let nodeMass = null, nodeData = null
  if (isNode && stage) {
    nodeMass = stage.getPointMass?.(entity.nodeId)
    nodeData = stage.nodeMap?.get(entity.nodeId)
  }

  return (
    <div style={{ marginBottom: 10, padding: '6px 8px', background: '#1a1a3a', borderRadius: 5, border: '1px solid #4682B4' }}>
      <div style={{ fontSize: 10, color: '#4682B4', fontWeight: 700, marginBottom: 4 }}>
        {isNode ? '선택된 노드' : '선택된 요소'}
      </div>
      {isNode ? (
        <>
          <Row label="Node ID" value={entity.nodeId} />
          {nodeData && <Row label="좌표 (mm)" value={`${nodeData.x.toFixed(1)}, ${nodeData.y.toFixed(1)}, ${nodeData.z.toFixed(1)}`} />}
          {nodeData?.tags?.length > 0 && <Row label="태그" value={nodeData.tags.join(', ')} />}
          {nodeMass && <Row label="질량" value={`${nodeMass.mass.toFixed(4)} kg`} highlight="#FFD700" />}
          {nodeMass?.sourceName && <Row label="CAD 출처" value={nodeMass.sourceName} />}
        </>
      ) : (
        <>
          <Row label="Element ID" value={entity.id} />
          <Row label="유형" value={entity.category} />
          <Row label="시작 노드" value={entity.startNode} />
          <Row label="끝 노드" value={entity.endNode} />
          {elemLength != null && <Row label="길이" value={`${elemLength.toFixed(1)} mm`} />}
          {prop && <Row label="단면" value={`${prop.kind} — ${StageData.formatDims(prop)}`} />}
          {mat && <Row label="재질" value={`${mat.name} (E=${fmt(mat.E)} MPa)`} />}
          {sourceName && <Row label="CAD 출처" value={sourceName} />}
        </>
      )}
    </div>
  )
}

function Row({ label, value, warn, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #1a1a2e' }}>
      <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
      <span style={{ fontSize: 11, color: warn ? '#FF8C00' : highlight ?? '#e0e0e0', fontWeight: 600 }}>
        {value ?? '-'}
      </span>
    </div>
  )
}

function fmt(n) { return n != null ? Number(n).toLocaleString('ko-KR') : '-' }
function sevColor(sev) { return sev === 'error' ? '#FF4444' : sev === 'warning' ? '#FF8C00' : '#4682B4' }

const tabStyle = (active) => ({ flex: 1, padding: '6px 2px', background: active ? '#1a1a3a' : 'transparent', color: active ? '#e0e0e0' : '#555', border: 'none', borderBottom: active ? '2px solid #4682B4' : '2px solid transparent', fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 0 })
const navBtn = { padding: '3px 10px', background: '#1a1a3a', color: '#aaa', border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: 12 }
