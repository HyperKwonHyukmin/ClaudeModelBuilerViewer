import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Crosshair, Eye, EyeOff, X } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { StageData } from '../data/StageData.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'
import EditPanel from './EditPanel.jsx'

const TABS = ['메타', '모델지표', '연결성', '진단', '추적', '편집']
const TRACE_PAGE_SIZE = 50
const MIN_WIDTH = 200
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 300

export default function InspectorPanel() {
  const [tracePage, setTracePage] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef(null)

  const { stages } = useStageStore()
  const {
    viewports, activeViewportId, pickedEntity,
    setPickedEntity,
    clearPickedEntity, focusPickedEntity,
    isolateSelection, toggleIsolateSelection,
    inspectorTab: tab, setInspectorTab: setTab,
  } = useViewerStore()
  const editEnabled = useEditStore(s => s.enabled)

  useEffect(() => {
    if (tab === '편집') setCollapsed(false)
  }, [tab])

  useEffect(() => {
    const id = requestAnimationFrame(() => setTracePage(0))
    return () => cancelAnimationFrame(id)
  }, [activeViewportId])

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

        {stage && pickedEntity && (
          <div style={{
            flexShrink: 0,
            padding: '10px 12px 0',
            borderBottom: '1px solid #202040',
            background: '#101024',
          }}>
            <PickedEntitySection
              entity={pickedEntity}
              stage={stage}
              clearPickedEntity={clearPickedEntity}
              focusPickedEntity={focusPickedEntity}
              isolateSelection={isolateSelection}
              toggleIsolateSelection={toggleIsolateSelection}
            />
          </div>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
          {!stage && <p style={{ color: '#444', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>파일을 로드하세요</p>}
          {stage && tab === '메타' && <MetaTab stage={stage} />}
          {stage && tab === '모델지표' && <HealthTab stage={stage} />}
          {stage && tab === '연결성' && <ConnectivityTab stage={stage} />}
          {stage && tab === '진단' && <DiagnosticsTab stage={stage} setPickedEntity={setPickedEntity} focusPickedEntity={focusPickedEntity} />}
          {stage && tab === '추적' && <TraceTab stage={stage} page={tracePage} setPage={setTracePage} pickedEntity={pickedEntity} />}
          {stage && tab === '편집' && (
            editEnabled
              ? <EditPanel />
              : <EmptyEditTab />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab components ──────────────────────────────────────────

function MetaTab({ stage }) {
  const m = stage.meta ?? {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Row label="단계명" value={m.stageName} />
      <Row label="Phase" value={m.phase} />
      <Row label="스키마" value={m.schemaVersion} />
      <Row label="단위" value={m.unit} />
      <Row label="타임스탬프" value={m.timestamp ? new Date(m.timestamp).toLocaleString('ko-KR') : '-'} />
    </div>
  )
}

function EmptyEditTab() {
  return (
    <div style={{
      marginTop: 8,
      padding: '14px 12px',
      background: '#101024',
      border: '1px solid #242448',
      borderRadius: 6,
      color: '#7a8aaa',
      fontSize: 12,
      lineHeight: 1.6,
    }}>
      <div style={{ color: '#cad8e8', fontWeight: 700, marginBottom: 4 }}>편집 모드가 꺼져 있습니다</div>
      <div>왼쪽 패널의 편집 모드를 켜면 편집 의도, 충돌, 최종 모델 출력 상태가 여기에 표시됩니다.</div>
    </div>
  )
}

function HealthTab({ stage }) {
  const t = stage.healthMetrics?.totals ?? {}
  const issues = stage.healthMetrics?.issues ?? {}
  const diagCounts = stage.healthMetrics?.diagnosticCounts ?? {}
  const lenCat = t.lengthByCategoryMm ?? {}

  // 편집 모드 deleteMask — 활성일 때만 "편집 후" 컬럼을 보여줌
  const editEnabled = useEditStore(s => s.enabled)
  const editIntents = useEditStore(s => s.intents)
  const deleteMask = useMemo(() => computeDeleteMask(stage, editIntents), [stage, editIntents])
  const showEdit = editEnabled && (deleteMask.deletedNodeIds.size > 0 || deleteMask.addedRigids.length > 0)

  // Total mass from pointMasses
  const totalMass = stage.pointMasses?.reduce((s, pm) => s + (pm.mass ?? 0), 0) ?? 0
  const totalMassAfter = showEdit
    ? stage.pointMasses
        .filter(pm => !deleteMask.deletedMassIds.has(pm.id))
        .reduce((s, pm) => s + (pm.mass ?? 0), 0)
    : totalMass

  // 카테고리별 derived element 수 (delete mask 가 BEAM 만 영향)
  const structAfter = showEdit
    ? (stage.elements ?? []).filter(e => e.type === 'BEAM' && e.category === 'Structure' && !deleteMask.deletedElementIds.has(e.id)).length
    : t.elementsByCategory?.Structure
  const pipeAfter = showEdit
    ? (stage.elements ?? []).filter(e => e.type === 'BEAM' && e.category === 'Pipe' && !deleteMask.deletedElementIds.has(e.id)).length
    : t.elementsByCategory?.Pipe

  return (
    <div>
      <Section title={showEdit ? '통계 (원본 → 편집 후)' : '통계'}>
        <Row label="노드"        value={fmtBeforeAfter(t.nodeCount,                deleteMask.derivedNodeCount,      showEdit)} />
        <Row label="요소 (전체)" value={fmtBeforeAfter(t.elementCount,             deleteMask.derivedElementCount,   showEdit)} />
        <Row label="요소 (구조)" value={fmtBeforeAfter(t.elementsByCategory?.Structure, structAfter, showEdit)} highlight="#4682B4" />
        <Row label="요소 (배관)" value={fmtBeforeAfter(t.elementsByCategory?.Pipe,      pipeAfter,   showEdit)} highlight="#FF8C00" />
        <Row label="RBE"         value={fmtBeforeAfter(t.rigidCount,               deleteMask.derivedRigidCount,     showEdit)} />
        <Row label="집중질량"    value={
          showEdit
            ? `${fmt(t.pointMassCount)} → ${fmt(deleteMask.derivedPointMassCount)}개 (${totalMass.toFixed(2)} → ${totalMassAfter.toFixed(2)} kg)`
            : `${fmt(t.pointMassCount)}개 (${totalMass.toFixed(2)} kg)`
        } />
        {showEdit && deleteMask.brokenRbeCount > 0 && (
          <Row label="끊기는 RBE" value={fmt(deleteMask.brokenRbeCount)} warn />
        )}
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

function DiagnosticsTab({ stage, setPickedEntity, focusPickedEntity }) {
  const diags = stage.diagnostics ?? []
  const [severityFilter, setSeverityFilter] = useState('all')
  const [codeFilter, setCodeFilter] = useState('all')
  const codes = [...new Set(diags.map(d => d.code).filter(Boolean))].sort()
  const visible = diags.filter(d =>
    (severityFilter === 'all' || d.severity === severityFilter) &&
    (codeFilter === 'all' || d.code === codeFilter)
  )

  const selectDiagnostic = (d) => {
    if (d.elemId != null) {
      const elem = stage.elements?.find(e => e.id === d.elemId)
      if (elem) {
        setPickedEntity({ type: 'element', id: elem.id, category: elem.category, startNode: elem.startNode, endNode: elem.endNode, propertyId: elem.propertyId })
        setTimeout(focusPickedEntity, 0)
      }
      return
    }
    if (d.nodeId != null && stage.nodeMap?.has(d.nodeId)) {
      setPickedEntity({ type: 'node', nodeId: d.nodeId })
      setTimeout(focusPickedEntity, 0)
    }
  }

  if (diags.length === 0) {
    return <p style={{ color: '#555', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>진단 항목 없음</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={filterSelect}>
          <option value="all">Severity: 전체</option>
          <option value="error">error</option>
          <option value="warning">warning</option>
          <option value="info">info</option>
        </select>
        <select value={codeFilter} onChange={e => setCodeFilter(e.target.value)} style={filterSelect}>
          <option value="all">Code: 전체</option>
          {codes.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </div>
      <p style={{ fontSize: 10, color: '#555', margin: 0 }}>{fmt(visible.length)} / {fmt(diags.length)}건</p>
      {visible.map((d, i) => {
        const selectable = d.elemId != null || d.nodeId != null
        return (
        <div
          key={i}
          onClick={() => selectDiagnostic(d)}
          title={selectable ? '3D에서 선택' : undefined}
          style={{
            background: '#1a1a3a', borderRadius: 4, padding: '6px 8px',
            borderLeft: `3px solid ${sevColor(d.severity)}`,
            cursor: selectable ? 'pointer' : 'default',
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: sevColor(d.severity), fontWeight: 700 }}>{d.severity}</span>
            <span style={{ fontSize: 10, color: '#666' }}>{d.code}</span>
            {d.elemId != null && <span style={{ fontSize: 9, color: '#aaa' }}>E:{d.elemId}</span>}
            {d.nodeId != null && <span style={{ fontSize: 9, color: '#aaa' }}>N:{d.nodeId}</span>}
          </div>
          <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>{d.message}</p>
        </div>
      )})}
    </div>
  )
}

// stage 이름 순서 (생애 추적 정렬용)
// trace stage 정렬 순서 — phase 흐름 기준 (Preprocess → ElementSplit → NodeMerge → Connectivity → RigidPostProc → Validation)
const STAGE_ORDER = [
  'initial',
  'SanityPreprocess', 'Meshing', 'NodeEquivalence',
  'Intersection', 'DanglingShortRemove', 'CollinearNodeMerge', 'ExtendToIntersect', 'SplitByExistingNodes',
  'GroupConnect', 'UboltRbe', 'BoxUboltConnection',
  'RigidProximityMerge', 'PointMassReattach', 'FreeEndRbe',
  'UboltAnchorVerticalize', 'OrphanNodeRemove',
]

// trace 에 실제 등장한 단계만 STAGE_ORDER 기준 정렬 후 1-based phase 번호로 부여.
// 'initial' 는 알고리즘 시작 전 상태라 phase 번호에서 제외.
function makeStageIndexMap(trace) {
  const seen = new Set(trace.map(t => t.stage).filter(s => s && s !== 'initial'))
  const ordered = STAGE_ORDER.filter(s => seen.has(s))
  return new Map(ordered.map((s, i) => [s, i + 1]))
}

// 부모 체인 재귀 추적 — "이 요소가 어디서 왔는지".
//   ElementSplit  : t.elemId = 자식, t.relatedElemId = 부모 (분할 전 요소)
//   ElementCreated: t.elemId = 새 요소, t.relatedElemId = 대체된 이전 요소(있으면 부모로 간주)
// 부모로 거슬러 올라가며 그 부모도 더 이전 부모가 있으면 계속 재귀. 사이클은 visited 로 방어.
//
// 반환: trace 이벤트 배열 (가장 최근 분할이 마지막에 오도록 STAGE_ORDER 기준 호출자가 정렬).
function findElementAncestors(targetId, trace) {
  const events = []
  const visited = new Set([targetId])

  const walkUp = (childId) => {
    const parents = trace.filter(t =>
      (t.action === 'ElementSplit' || t.action === 'ElementCreated') &&
      t.elemId === childId &&
      t.relatedElemId != null &&
      t.relatedElemId !== childId
    )
    for (const ev of parents) {
      events.push(ev)
      const parentId = ev.relatedElemId
      if (!visited.has(parentId)) {
        visited.add(parentId)
        walkUp(parentId)
      }
    }
  }
  walkUp(targetId)
  return events
}

// 노드 출처 — "이 노드는 어떻게 만들어졌나".
//   NodeCreated : 자기 자신이 생성된 사건
//   NodeMerged  : 다른 노드(t.nodeId) 가 이 노드(t.relatedNodeId === targetId) 로 흡수된 사건 → 출처로 간주
function findNodeAncestors(targetId, trace) {
  return trace.filter(t =>
    (t.action === 'NodeCreated' && t.nodeId === targetId) ||
    (t.action === 'NodeMerged'  && t.relatedNodeId === targetId)
  )
}

// trace 이벤트 동등성 키 (dedup / 차집합 비교용).
function traceKey(t) {
  return `${t.stage}|${t.action}|${t.elemId ?? ''}|${t.relatedElemId ?? ''}|${t.nodeId ?? ''}|${t.relatedNodeId ?? ''}`
}
const ACTION_COLOR = {
  ElementCreated:  '#44cc88', ElementRemoved:  '#ff4444', ElementSplit: '#ffaa00', ElementPreserved: '#888888',
  NodeCreated:     '#88dd44', NodeRemoved:     '#ff8866',
  NodeMerged:      '#4488ff', NodeMoved:       '#cc44ff',
}
const ALL_ACTIONS = [
  'ElementCreated','ElementRemoved','ElementSplit','ElementPreserved',
  'NodeCreated','NodeRemoved','NodeMerged','NodeMoved',
]

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
        const counts    = byStage[stageName] ?? {}
        const eCreated  = counts.ElementCreated   ?? 0
        const eRemoved  = counts.ElementRemoved   ?? 0
        const eSplit    = counts.ElementSplit     ?? 0
        const ePreserve = counts.ElementPreserved ?? 0
        const nCreated  = counts.NodeCreated      ?? 0
        const nRemoved  = counts.NodeRemoved      ?? 0
        const nMerged   = counts.NodeMerged       ?? 0
        const nMoved    = counts.NodeMoved        ?? 0
        const netElem   = eCreated - eRemoved
        const total     = eCreated + eRemoved + eSplit + ePreserve + nCreated + nRemoved + nMerged + nMoved

        const bars = [
          { cnt: eCreated,  color: ACTION_COLOR.ElementCreated },
          { cnt: eRemoved,  color: ACTION_COLOR.ElementRemoved },
          { cnt: eSplit,    color: ACTION_COLOR.ElementSplit },
          { cnt: ePreserve, color: ACTION_COLOR.ElementPreserved },
          { cnt: nCreated,  color: ACTION_COLOR.NodeCreated },
          { cnt: nRemoved,  color: ACTION_COLOR.NodeRemoved },
          { cnt: nMerged,   color: ACTION_COLOR.NodeMerged },
          { cnt: nMoved,    color: ACTION_COLOR.NodeMoved },
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
              {eCreated  > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.ElementCreated }}>+E{eCreated} 요소생성</span>}
              {eRemoved  > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.ElementRemoved }}>−E{eRemoved} 요소삭제</span>}
              {eSplit    > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.ElementSplit }}>÷E{eSplit} 분할</span>}
              {ePreserve > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.ElementPreserved }}>·E{ePreserve} 보존</span>}
              {nCreated  > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.NodeCreated }}>+N{nCreated} 노드생성</span>}
              {nRemoved  > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.NodeRemoved }}>−N{nRemoved} 노드삭제</span>}
              {nMerged   > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.NodeMerged }}>⊕N{nMerged} 병합</span>}
              {nMoved    > 0 && <span style={{ fontSize: 9, color: ACTION_COLOR.NodeMoved }}>↔N{nMoved} 이동</span>}
              {total    === 0 && <span style={{ fontSize: 9, color: '#333' }}>변경 없음</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 생애 추적 ──────────────────────────────────────────────────────────────

function LifecycleView({ trace, pickedEntity, stage, setPickedEntity }) {
  if (!pickedEntity) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#444', fontSize: 11 }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>↖</div>
        3D 뷰에서 요소 또는 노드를 클릭하면<br />전체 생애를 추적합니다
      </div>
    )
  }

  const sortByStage = arr => [...arr].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
  const dedup = arr => [...new Map(arr.map(t => [traceKey(t), t])).values()]
  const stageIndex = makeStageIndexMap(trace)

  if (pickedEntity.type === 'element') {
    return <ElementLifecycle trace={trace} targetId={pickedEntity.id} stage={stage} setPickedEntity={setPickedEntity} sortByStage={sortByStage} dedup={dedup} stageIndex={stageIndex} />
  }
  if (pickedEntity.type === 'node') {
    return <NodeLifecycle trace={trace} targetId={pickedEntity.nodeId} stage={stage} setPickedEntity={setPickedEntity} sortByStage={sortByStage} dedup={dedup} stageIndex={stageIndex} />
  }
  return null
}

function ElementLifecycle({ trace, targetId, stage, setPickedEntity, sortByStage, dedup, stageIndex }) {
  const currentEl = stage.elements?.find(e => e.id === targetId)

  // ── ▲ 출처: 부모 체인 (재귀적으로 분할 거슬러 올라감) ──────────────────
  const ancestors        = findElementAncestors(targetId, trace)
  const ancestorsSorted  = sortByStage(dedup(ancestors))
  const ancestorKeys     = new Set(ancestorsSorted.map(traceKey))
  const ancestorParentIds = new Set(ancestors.map(t => t.relatedElemId).filter(id => id != null))

  // ── 자기 이력: 자신이 주체이거나 대상인 행에서 출처와 중복되는 것 제외 ─
  const primary = trace.filter(t => t.elemId === targetId || t.relatedElemId === targetId)
  const primarySorted = sortByStage(dedup(primary)).filter(t => !ancestorKeys.has(traceKey(t)))

  // ── ▼ 자식: 분할로 생긴 자식 요소들의 이력 (현행 로직 유지, 부모는 제외) ─
  const childIds = new Set(
    primary.flatMap(t => [t.relatedElemId]).filter(id => id != null && id !== targetId)
  )
  for (const id of ancestorParentIds) childIds.delete(id)

  const secondary = childIds.size > 0
    ? trace.filter(t =>
        (childIds.has(t.elemId) || childIds.has(t.relatedElemId)) &&
        !primary.includes(t)
      )
    : []
  const secondarySorted = sortByStage(dedup(secondary))

  const trySelect = (elemId) => {
    if (elemId == null) return
    const elem = stage.elements?.find(e => e.id === elemId)
    if (elem) setPickedEntity({ type: 'element', id: elem.id, category: elem.category, startNode: elem.startNode, endNode: elem.endNode, propertyId: elem.propertyId })
  }

  if (ancestorsSorted.length === 0 && primarySorted.length === 0 && secondarySorted.length === 0) {
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

      {/* ── ▲ 출처 (부모 체인) ────────────────────────────────────────── */}
      {ancestorsSorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#A99CFF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3, fontWeight: 700 }}>
            ▲ 이 요소의 출처 ({ancestorsSorted.length}건)
          </div>
          <p style={{ fontSize: 9, color: '#666', margin: '0 0 5px', lineHeight: 1.4 }}>
            위에서 아래로 시간 흐름. 클릭하면 그 부모 요소로 이동해 더 거슬러 올라갈 수 있습니다.
          </p>
          <EventList events={ancestorsSorted} stage={stage} trySelect={trySelect} isDerived={false} mode="element" stageIndex={stageIndex} variant="ancestor" />
        </div>
      )}

      {/* ── 이 요소의 이력 ──────────────────────────────────────────── */}
      {primarySorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#4682B4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
            E#{targetId} 의 이력 ({primarySorted.length}건)
          </div>
          <EventList events={primarySorted} stage={stage} trySelect={trySelect} isDerived={false} mode="element" stageIndex={stageIndex} />
        </div>
      )}

      {/* ── ▼ 자식 요소 ──────────────────────────────────────────────── */}
      {secondarySorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
            ▼ 자식 요소 이력 ({secondarySorted.length}건) — 이 요소가 분할되어 만든 자식
          </div>
          <EventList events={secondarySorted} stage={stage} trySelect={trySelect} isDerived={true} mode="element" stageIndex={stageIndex} />
        </div>
      )}
    </div>
  )
}

function NodeLifecycle({ trace, targetId, stage, setPickedEntity, sortByStage, dedup, stageIndex }) {
  const currentNode = stage.nodeMap?.get(targetId)  // 현재 단계 존재 여부

  // ── ▲ 출처: 이 노드가 어떻게 만들어졌는지 ─────────────────────────────
  //   NodeCreated: 자기 자신이 생성된 사건
  //   NodeMerged where relatedNodeId === targetId: 다른 노드가 이 노드로 흡수된 사건
  const ancestors       = findNodeAncestors(targetId, trace)
  const ancestorsSorted = sortByStage(dedup(ancestors))
  const ancestorKeys    = new Set(ancestorsSorted.map(traceKey))

  // ── 노드 직접 이력 (출처와 중복 제외) ─────────────────────────────────
  const nodePrimary = trace.filter(t => t.nodeId === targetId || t.relatedNodeId === targetId)
  const primarySorted = sortByStage(dedup(nodePrimary)).filter(t => !ancestorKeys.has(traceKey(t)))

  // ── 연결된 요소 이력 (현재 stage 에 이 노드를 양 끝으로 가지는 요소들의 이력) ─
  const incidentElemIds = new Set(
    (stage.elements ?? [])
      .filter(e => e.startNode === targetId || e.endNode === targetId)
      .map(e => e.id)
  )
  const elemSecondary = incidentElemIds.size > 0
    ? trace.filter(t =>
        (incidentElemIds.has(t.elemId) || incidentElemIds.has(t.relatedElemId)) &&
        !nodePrimary.includes(t)
      )
    : []
  const secondarySorted = sortByStage(dedup(elemSecondary))

  const trySelectNode = (nodeId) => {
    if (nodeId == null) return
    if (stage.nodeMap?.has(nodeId)) setPickedEntity({ type: 'node', nodeId })
  }
  const trySelectElem = (elemId) => {
    if (elemId == null) return
    const elem = stage.elements?.find(e => e.id === elemId)
    if (elem) setPickedEntity({ type: 'element', id: elem.id, category: elem.category, startNode: elem.startNode, endNode: elem.endNode, propertyId: elem.propertyId })
  }

  if (ancestorsSorted.length === 0 && primarySorted.length === 0 && secondarySorted.length === 0) {
    return <p style={{ color: '#555', fontSize: 11, textAlign: 'center', paddingTop: 12 }}>추적 기록 없음 (N#{targetId})</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ── 현재 단계 노드 정보 박스 ── */}
      <div style={{
        background: currentNode ? 'rgba(70,130,180,0.1)' : 'rgba(80,40,40,0.2)',
        border: `1px solid ${currentNode ? '#4682B4' : '#664444'}`,
        borderRadius: 6, padding: '7px 10px',
      }}>
        <div style={{ fontSize: 10, color: currentNode ? '#4682B4' : '#aa6666', fontWeight: 700, marginBottom: 4 }}>
          N#{targetId} — {currentNode ? '현재 단계에 존재' : '현재 단계에 없음 (병합/삭제됨)'}
        </div>
        {currentNode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Row label="좌표 (mm)" value={`${currentNode.x.toFixed(1)}, ${currentNode.y.toFixed(1)}, ${currentNode.z.toFixed(1)}`} />
            {currentNode.tags?.length > 0 && <Row label="태그" value={currentNode.tags.join(', ')} />}
            <Row label="연결 요소" value={incidentElemIds.size > 0 ? [...incidentElemIds].slice(0, 6).join(', ') + (incidentElemIds.size > 6 ? ` 외 ${incidentElemIds.size - 6}개` : '') : '-'} />
          </div>
        ) : (
          <p style={{ fontSize: 10, color: '#666', margin: 0 }}>
            이 노드는 이전 단계에서 다른 노드에 병합되거나 삭제되어 현재 단계에서 더 이상 존재하지 않습니다.
            아래 이력에서 어떤 노드로 이어졌는지 확인하세요.
          </p>
        )}
      </div>

      {/* ── ▲ 출처 ────────────────────────────────────────────────────── */}
      {ancestorsSorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#A99CFF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3, fontWeight: 700 }}>
            ▲ 이 노드의 출처 ({ancestorsSorted.length}건)
          </div>
          <p style={{ fontSize: 9, color: '#666', margin: '0 0 5px', lineHeight: 1.4 }}>
            이 노드가 생성된 사건과, 다른 노드가 이 노드로 흡수(병합)된 사건들.
          </p>
          <EventList events={ancestorsSorted} stage={stage} trySelect={trySelectNode} isDerived={false} mode="node" stageIndex={stageIndex} variant="ancestor" />
        </div>
      )}

      {/* ── 이 노드의 이력 ──────────────────────────────────────────── */}
      {primarySorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#4682B4', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
            N#{targetId} 의 이력 ({primarySorted.length}건)
          </div>
          <EventList events={primarySorted} stage={stage} trySelect={trySelectNode} isDerived={false} mode="node" stageIndex={stageIndex} />
        </div>
      )}

      {/* ── 연결된 요소 이력 ────────────────────────────────────────── */}
      {secondarySorted.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
            연결된 요소 이력 ({secondarySorted.length}건) — 현재 단계에서 이 노드에 붙어있는 요소
          </div>
          <EventList events={secondarySorted} stage={stage} trySelect={trySelectElem} isDerived={true} mode="element" stageIndex={stageIndex} />
        </div>
      )}
    </div>
  )
}

function EventList({ events, stage, trySelect, isDerived, mode = 'element', stageIndex, variant }) {
  // variant: undefined(일반) | 'ancestor' (출처 — 보라색 강조)
  const isAncestor = variant === 'ancestor'
  const railColor  = isAncestor
    ? 'rgba(169,156,255,0.32)'
    : (isDerived ? 'rgba(100,100,120,0.2)' : 'rgba(70,130,180,0.2)')
  const cardBg     = isAncestor ? '#1a1530' : (isDerived ? '#141428' : '#1a1a3a')
  const cardHover  = isAncestor ? '#251f3e' : '#222244'
  const stageBadgeColor = isAncestor ? '#A99CFF' : '#4682B4'
  const stageBadgeBg    = isAncestor ? 'rgba(169,156,255,0.14)' : 'rgba(70,130,180,0.12)'

  return (
    <div style={{ position: 'relative', paddingLeft: 16 }}>
      <div style={{ position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, background: railColor, borderRadius: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((t, i) => {
          const ac      = ACTION_COLOR[t.action] ?? '#888'
          const clickId = mode === 'node'
            ? (t.nodeId ?? t.relatedNodeId)
            : (t.elemId ?? t.relatedElemId)
          const exists  = mode === 'node'
            ? stage.nodeMap?.has(clickId)
            : stage.elements?.some(e => e.id === clickId)

          // 이 이벤트에서 무슨 일이 일어났는지 한국어 요약
          // ※ ElementSplit/ElementCreated 의미: elemId = 새로 생긴 자식·신규 ID, relatedElemId = 분할된 부모·이전 ID
          const summary = (() => {
            if (t.action === 'ElementCreated')   return `E#${t.elemId} 생성${t.relatedElemId != null ? ` (이전 E#${t.relatedElemId} 대체)` : ''}`
            if (t.action === 'ElementRemoved')   return `E#${t.elemId} 삭제`
            if (t.action === 'ElementSplit')     return t.relatedElemId != null
              ? `E#${t.relatedElemId}(부모) 분할 → E#${t.elemId} 생성`
              : `E#${t.elemId} 분할 생성`
            if (t.action === 'ElementPreserved') return `E#${t.elemId} 보존`
            if (t.action === 'NodeCreated')      return `N#${t.nodeId} 생성`
            if (t.action === 'NodeRemoved')      return `N#${t.nodeId} 삭제`
            if (t.action === 'NodeMerged')       return `N#${t.nodeId} → N#${t.relatedNodeId} 로 병합`
            if (t.action === 'NodeMoved')        return `N#${t.nodeId} 위치 이동`
            return t.action
          })()

          const phaseNo = stageIndex?.get(t.stage)
          const stageLabel = phaseNo != null ? `${phaseNo}. ${t.stage}` : t.stage

          return (
            <div
              key={i}
              onClick={() => trySelect(clickId)}
              title={exists ? `${mode === 'node' ? 'N' : 'E'}#${clickId} 클릭 시 3D 선택` : `현재 단계에 없는 ${mode === 'node' ? '노드' : '요소'}`}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: exists ? 'pointer' : 'default', opacity: exists ? 1 : 0.5 }}
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: ac, flexShrink: 0, marginTop: 2, boxShadow: `0 0 5px ${ac}88`, zIndex: 1 }} />
              <div
                style={{ background: cardBg, borderRadius: 4, padding: '4px 7px', flex: 1, transition: 'background 0.1s' }}
                onMouseEnter={e => { if (exists) e.currentTarget.style.background = cardHover }}
                onMouseLeave={e => { e.currentTarget.style.background = cardBg }}
              >
                {/* 한국어 요약 한 줄 */}
                <div style={{ fontSize: 10, color: '#ccc', fontWeight: 600, marginBottom: 2 }}>{summary}</div>
                {/* 상세: 단계 + note */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: stageBadgeColor, background: stageBadgeBg, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
                    {stageLabel}
                  </span>
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

function PickedEntitySection({ entity, stage, clearPickedEntity, focusPickedEntity, isolateSelection, toggleIsolateSelection }) {
  const isNode  = entity.type === 'node'
  const isMass  = entity.type === 'mass'
  const isSrc   = entity.type === 'sourceName'
  const isRigid = entity.type === 'rigid'
  const isElem  = !isNode && !isMass && !isSrc && !isRigid

  // Element detail lookups
  let prop = null, mat = null, elemLength = null, sourceName = null
  if (isElem && stage) {
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

  // Mass detail: 좌표 + 입력 단위 NASTRAN ton 기준
  let massNodeData = null
  if (isMass && stage) {
    massNodeData = stage.nodeMap?.get(entity.nodeId)
  }

  const headerLabel = isMass ? '선택된 질량' : isNode ? '선택된 노드' : isSrc ? '선택된 CSV 행' : isRigid ? '선택된 RBE' : '선택된 요소'
  const headerColor = isMass ? '#FF99BB' : isSrc ? '#cc88ff' : isRigid ? (entity.remark === 'UBOLT' ? '#00E5FF' : '#FF44FF') : '#4682B4'

  return (
    <div style={{ marginBottom: 10, padding: '6px 8px', background: '#1a1a3a', borderRadius: 5, border: `1px solid ${headerColor}` }}>
      <div style={{ fontSize: 10, color: headerColor, fontWeight: 700, marginBottom: 4 }}>
        {headerLabel}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <IconAction title="선택 위치로 이동" onClick={focusPickedEntity}><Crosshair size={12} /></IconAction>
        <IconAction title={isolateSelection ? '격리 해제' : '선택 항목만 보기'} onClick={toggleIsolateSelection}>
          {isolateSelection ? <Eye size={12} /> : <EyeOff size={12} />}
        </IconAction>
        <IconAction title="선택 해제" onClick={clearPickedEntity}><X size={12} /></IconAction>
      </div>
      {isMass ? (
        <>
          <Row label="Mass ID" value={entity.id} />
          <Row label="부착 노드" value={entity.nodeId} />
          <Row label="중량" value={formatMassValue(entity.mass)} highlight="#FFD700" />
          {massNodeData && <Row label="좌표 (mm)" value={`${massNodeData.x.toFixed(1)}, ${massNodeData.y.toFixed(1)}, ${massNodeData.z.toFixed(1)}`} />}
          {entity.sourceName && <Row label="CAD 출처" value={entity.sourceName} />}
        </>
      ) : isNode ? (
        <>
          <Row label="Node ID" value={entity.nodeId} />
          {nodeData && <Row label="좌표 (mm)" value={`${nodeData.x.toFixed(1)}, ${nodeData.y.toFixed(1)}, ${nodeData.z.toFixed(1)}`} />}
          {nodeData?.tags?.length > 0 && <Row label="태그" value={nodeData.tags.join(', ')} />}
          {nodeMass && <Row label="질량" value={formatMassValue(nodeMass.mass)} highlight="#FFD700" />}
          {nodeMass?.sourceName && <Row label="CAD 출처" value={nodeMass.sourceName} />}
        </>
      ) : isRigid ? (
        <>
          <Row label="RBE ID" value={entity.id} highlight={entity.remark === 'UBOLT' ? '#00E5FF' : '#FF44FF'} />
          {entity.remark && <Row label="유형" value={entity.remark} />}
          {entity.cm && <Row label="DOF (cm)" value={entity.cm} />}
          <Row label="독립 노드" value={entity.independentNode} />
          <Row label="종속 노드" value={`${entity.dependentNodes?.length ?? 0}개`} />
          {entity.dependentNodes?.length > 0 && (
            <div style={{ marginTop: 4, padding: '4px 6px', background: '#10102a', borderRadius: 4, fontSize: 11, color: '#888', wordBreak: 'break-all', lineHeight: 1.4 }}>
              {entity.dependentNodes.slice(0, 30).join(', ')}
              {entity.dependentNodes.length > 30 ? ` 외 ${entity.dependentNodes.length - 30}개` : ''}
            </div>
          )}
        </>
      ) : isSrc ? (
        <>
          <Row label="CSV 출처"   value={entity.sourceName} highlight="#cc88ff" />
          <Row label="CSV 종류"   value={entity.kind} />
          <Row label="처리 상태"  value={entity.status} highlight={entity.status === 'converted' ? '#44cc88' : '#FFAA55'} />
          {entity.reasonCode && <Row label="사유 코드" value={entity.reasonCode} />}
          {entity.mappingConfidence === 'ambiguousDuplicateSourceName' && (
            <Row label="이름 중복" value="동일 sourceName 행 다수" highlight="#cc88ff" />
          )}
          <Row label="현 단계 매칭" value={`E×${entity.elementCount ?? 0} / M×${entity.pointMassCount ?? 0}`} />
          {entity.pos && <Row label="원본 좌표 (mm)" value={`${entity.pos.x.toFixed(0)}, ${entity.pos.y.toFixed(0)}, ${entity.pos.z.toFixed(0)}`} />}
          {entity.reason && (
            <div style={{ marginTop: 6, padding: '4px 6px', background: '#10102a', borderRadius: 4, fontSize: 10, color: '#888', lineHeight: 1.4 }}>
              {entity.reason}
            </div>
          )}
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

// 입력 mass는 kg 단위 (기존 HealthTab 합계 표기와 일치). 보기 좋은 단위로 변환.
function formatMassValue(mass) {
  if (mass == null || isNaN(mass)) return '-'
  if (mass >= 1000) return `${(mass / 1000).toFixed(3)} t`
  if (mass >= 1)    return `${mass.toFixed(3)} kg`
  const g = mass * 1000
  return `${g.toFixed(2)} g`
}

function IconAction({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 22, background: '#10102a', color: '#8fbce0',
        border: '1px solid #2a3a5a', borderRadius: 5, cursor: 'pointer',
      }}
    >
      {children}
    </button>
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

function fmtBeforeAfter(before, after, showEdit) {
  if (!showEdit) return fmt(before)
  return `${fmt(before)} → ${fmt(after)}`
}
function sevColor(sev) { return sev === 'error' ? '#FF4444' : sev === 'warning' ? '#FF8C00' : '#4682B4' }

const tabStyle = (active) => ({ flex: 1, padding: '6px 2px', background: active ? '#1a1a3a' : 'transparent', color: active ? '#e0e0e0' : '#555', border: 'none', borderBottom: active ? '2px solid #4682B4' : '2px solid transparent', fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 0 })
const navBtn = { padding: '3px 10px', background: '#1a1a3a', color: '#aaa', border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: 12 }
