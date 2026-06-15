import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Crosshair, Eye, EyeOff, X, Info } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { StageData } from '../data/StageData.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'

// 우측 인스펙터는 정보 전용(읽기 전용)이다. 부재/그룹 편집(삭제·Rigid 등)은 좌측 Edit 패널에서 수행한다.
const TABS = ['메타', '모델지표', '연결성', '진단']
const MIN_WIDTH = 200
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 300

export default function InspectorPanel() {
  // 우측 인스펙터는 더 이상 dock 컬럼이 아니라 3D 뷰포트 위에 떠 있는 floating 정보 창이다.
  // 부재/노드/질량/RBE 를 선택하면 자동으로 열리고, 닫으면 우상단의 작은 "정보" 런처 버튼만 남는다.
  // (좌측 Edit 패널이 모든 편집을 담당하므로 이 창은 읽기 전용 정보 표시에 집중한다.)
  const [open, setOpen] = useState(false)
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

  // 엔티티(부재/노드/질량/RBE)를 선택하면 정보 창을 자동으로 띄워 상세 정보가 즉시 보이게 한다.
  useEffect(() => {
    if (pickedEntity) setOpen(true)
  }, [pickedEntity])

  // ── Resize drag — 왼쪽 가장자리를 끌면 폭이 넓어진다 ───────────────────
  // floating 창이라 dock 폭(layoutBounds.inspectorWidth)을 publish 할 필요가 없다.
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

  const activeVp = viewports.find(v => v.id === activeViewportId)
  const stage = activeVp ? stages[activeVp.stageIndex] : null

  // 파일 미로드 시 런처/창 모두 표시하지 않는다.
  if (!stage) return null

  // ── 닫힘: 뷰포트 우상단에 작은 "정보" 런처 버튼만 표시 ─────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="정보 패널 열기 (부재/노드 선택 시 자동으로 열립니다)"
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 26,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 7,
          background: 'rgba(18,18,42,0.92)', color: '#9fc8e8',
          border: '1px solid #2a3a5a', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <Info size={13} /> 정보
      </button>
    )
  }

  // ── 열림: 뷰포트 위에 떠 있는 floating 정보 창 ────────────────────────
  // ViewportContainer 의 position:relative 루트 기준으로 우상단에 배치된다.
  // 하단 우측 MassSummaryOverlay 와 겹치지 않도록 maxHeight 로 높이를 제한한다.
  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 26,
      width, maxHeight: 'calc(100% - 86px)',
      display: 'flex',
      borderRadius: 8, overflow: 'hidden',
      boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      border: '1px solid #2a2a4a',
    }}>
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
      <div style={{ flex: 1, background: '#12122a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Tab bar + close button */}
        <div style={{ display: 'flex', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
          <div style={{ display: 'flex', flex: 1, overflowX: 'hidden' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            title="정보 패널 닫기"
            style={{ padding: '0 9px', background: 'transparent', border: 'none', color: '#667', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          ><X size={13} /></button>
        </div>

        {pickedEntity && (
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
          {tab === '메타' && <MetaTab stage={stage} />}
          {tab === '모델지표' && <HealthTab stage={stage} />}
          {tab === '연결성' && <ConnectivityTab stage={stage} />}
          {tab === '진단' && <DiagnosticsTab stage={stage} setPickedEntity={setPickedEntity} focusPickedEntity={focusPickedEntity} />}
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

function HealthTab({ stage }) {
  const t = stage.healthMetrics?.totals ?? {}
  const issues = stage.healthMetrics?.issues ?? {}
  const diagCounts = stage.healthMetrics?.diagnosticCounts ?? {}
  const lenCat = t.lengthByCategoryMm ?? {}

  // 편집 적용 미리보기 — intents 가 있으면 편집 모드 토글과 무관하게 "원본 → 편집 후" 컬럼을 보여준다.
  // (편집 모드를 꺼도 변경사항이 유지되는 정책에 맞춤)
  const editIntents = useEditStore(s => s.intents)
  const deleteMask = useMemo(() => computeDeleteMask(stage, editIntents), [stage, editIntents])
  const showEdit = (deleteMask.deletedNodeIds.size > 0 || deleteMask.addedRigids.length > 0)

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
            ? `${fmt(t.pointMassCount)} → ${fmt(deleteMask.derivedPointMassCount)}개 (${(totalMass * 1000).toFixed(2)} → ${(totalMassAfter * 1000).toFixed(2)} kg)`
            : `${fmt(t.pointMassCount)}개 (${(totalMass * 1000).toFixed(2)} kg)`
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

  // 우측 인스펙터는 읽기 전용 — 부재 삭제 등 편집 액션은 좌측 Edit 패널에서 수행한다.

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

          <div style={{ marginTop: 6, fontSize: 9, color: '#5a6a82', lineHeight: 1.4 }}>
            부재 삭제는 좌측 <strong style={{ color: '#9fc8e8' }}>Edit</strong> 패널에서 수행합니다.
          </div>
        </>
      )}
    </div>
  )
}

// 입력 mass 는 NASTRAN consistent units (mm·N·s·t) 의 ton.
// kg 으로 환산해 보기 좋은 단위로 표시.
function formatMassValue(massTon) {
  if (massTon == null || isNaN(massTon)) return '-'
  const kg = massTon * 1000
  if (kg >= 1000) return `${massTon.toFixed(3)} t`
  if (kg >= 1)    return `${kg.toFixed(3)} kg`
  return `${(kg * 1000).toFixed(2)} g`
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
