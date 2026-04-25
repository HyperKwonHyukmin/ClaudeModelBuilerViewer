import { useState } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

const TABS = ['메타', '건강지표', '연결성', '진단', '추적']
const TRACE_PAGE_SIZE = 50

export default function InspectorPanel() {
  const [tab, setTab] = useState('메타')
  const [tracePage, setTracePage] = useState(0)
  const { stages } = useStageStore()
  const { viewports, activeViewportId } = useViewerStore()

  const activeVp = viewports.find(v => v.id === activeViewportId)
  const stage = activeVp ? stages[activeVp.stageIndex] : null

  if (!stage) {
    return (
      <div style={panelStyle}>
        <p style={{ color: '#444', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>파일을 로드하세요</p>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setTracePage(0) }} style={tabStyle(tab === t)}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        {tab === '메타' && <MetaTab stage={stage} />}
        {tab === '건강지표' && <HealthTab stage={stage} />}
        {tab === '연결성' && <ConnectivityTab stage={stage} />}
        {tab === '진단' && <DiagnosticsTab stage={stage} />}
        {tab === '추적' && <TraceTab stage={stage} page={tracePage} setPage={setTracePage} />}
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

  return (
    <div>
      <Section title="통계">
        <Row label="노드" value={fmt(t.nodeCount)} />
        <Row label="요소 (전체)" value={fmt(t.elementCount)} />
        <Row label="요소 (구조)" value={fmt(t.elementsByCategory?.Structure)} highlight="#4682B4" />
        <Row label="요소 (배관)" value={fmt(t.elementsByCategory?.Pipe)} highlight="#FF8C00" />
        <Row label="RBE" value={fmt(t.rigidCount)} />
        <Row label="질량" value={fmt(t.pointMassCount)} />
        {t.totalLengthMm != null && <Row label="총 길이" value={`${(t.totalLengthMm / 1000).toFixed(1)} m`} />}
      </Section>

      <Section title="이슈">
        <Row label="자유단 노드" value={fmt(issues.freeEndNodes)} warn={issues.freeEndNodes > 0} />
        <Row label="고아 노드" value={fmt(issues.orphanNodes)} warn={issues.orphanNodes > 0} />
        <Row label="단락 요소" value={fmt(issues.shortElements)} warn={issues.shortElements > 0} />
        <Row label="미연결 그룹" value={fmt(issues.disconnectedGroups)} warn={issues.disconnectedGroups > 0} />
        <Row label="미해결 U-bolt" value={fmt(issues.unresolvedUbolts)} warn={issues.unresolvedUbolts > 0} />
      </Section>

      {Object.keys(diagCounts).length > 0 && (
        <Section title="진단 코드 요약">
          {Object.entries(diagCounts.byCode ?? {}).map(([code, cnt]) => (
            <Row key={code} label={code} value={fmt(cnt)} warn />
          ))}
        </Section>
      )}
    </div>
  )
}

function ConnectivityTab({ stage }) {
  const c = stage.connectivity ?? {}
  return (
    <div>
      <Section title="연결성">
        <Row label="그룹 수" value={fmt(c.groupCount)} />
        <Row label="최대 그룹 노드" value={fmt(c.largestGroupNodeCount)} />
        <Row label="최대 그룹 요소" value={fmt(c.largestGroupElementCount)} />
        <Row label="고립 노드 수" value={fmt(c.isolatedNodeCount)} warn={c.isolatedNodeCount > 0} />
      </Section>
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

function TraceTab({ stage, page, setPage }) {
  const trace = stage.trace ?? []
  const total = trace.length
  const pageCount = Math.ceil(total / TRACE_PAGE_SIZE)
  const slice = trace.slice(page * TRACE_PAGE_SIZE, (page + 1) * TRACE_PAGE_SIZE)

  if (total === 0) {
    return <p style={{ color: '#555', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>추적 항목 없음</p>
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>총 {fmt(total)}개 이벤트 (페이지 {page + 1}/{pageCount})</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {slice.map((t, i) => (
          <div key={i} style={{ background: '#1a1a3a', borderRadius: 3, padding: '4px 7px', fontSize: 10 }}>
            <span style={{ color: '#7c7cff' }}>{t.action}</span>
            {' '}<span style={{ color: '#555' }}>[{t.stage}]</span>
            {t.note && <span style={{ color: '#888' }}> — {t.note}</span>}
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={navBtn}>◀</button>
          <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1} style={navBtn}>▶</button>
        </div>
      )}
    </div>
  )
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

const panelStyle = { width: 230, flexShrink: 0, background: '#12122a', borderLeft: '1px solid #2a2a4a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const tabStyle = (active) => ({ flex: 1, padding: '6px 2px', background: active ? '#1a1a3a' : 'transparent', color: active ? '#e0e0e0' : '#555', border: 'none', borderBottom: active ? '2px solid #4682B4' : '2px solid transparent', fontSize: 10, cursor: 'pointer' })
const navBtn = { padding: '3px 10px', background: '#1a1a3a', color: '#aaa', border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: 12 }
