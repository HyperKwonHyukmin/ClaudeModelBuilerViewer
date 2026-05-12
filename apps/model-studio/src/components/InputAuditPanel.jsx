import { useMemo, useState } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { InputAuditData } from '../data/InputAuditData.js'

const PAGE_SIZE = 50

const STATUS_COLOR = {
  converted:   '#44cc88',
  ignored:     '#FFAA55',
  parseFailed: '#FF5566',
  blank:       '#666',
}


/**
 * 하단 collapsible 패널 — 00_InputAudit.json 의 CSV 변환 감사를 표 형태로 보여준다.
 *
 * 주요 사용 흐름:
 *  1) 로드된 stage 폴더에 00_InputAudit.json 이 있으면 자동으로 활성화
 *  2) summary chip 으로 전체 변환 결과 한눈에 파악
 *  3) 필터/검색으로 문제 행 (ignored/parseFailed/ambiguous) 빠르게 좁힘
 *  4) 행 클릭 → 같은 sourceName 의 element/mass 를 3D 에서 하이라이트 + 카메라 포커스
 */
export default function InputAuditPanel({ embedded = false, forceOpen = false }) {
  const { stages, inputAudit } = useStageStore()
  const { viewports, activeViewportId, setPickedEntity, focusPickedEntity, pickedEntity } = useViewerStore()

  const [open, setOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('issues')   // 'all' | 'issues' | 'converted' | 'ignored' | 'parseFailed' | 'blank' | 'ambiguous'
  const [kindFilter,   setKindFilter]   = useState('all')
  const [typeFilter,   setTypeFilter]   = useState('all')      // rawFields.type — UBOLT, TUBI, SCTN, …
  const [search,       setSearch]       = useState('')
  const [page,         setPage]         = useState(0)

  // ⚠ Hook 호출 순서 보존: inputAudit 가 null 이어도 useMemo 는 항상 호출되어야 함
  const filtered = useMemo(() => {
    if (!inputAudit) return []
    const q = search.trim().toLowerCase()
    return inputAudit.rowAudit.filter(r => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false
      if (typeFilter !== 'all' && (r.rawFields?.type ?? '') !== typeFilter) return false
      if (statusFilter === 'issues') {
        if (r.status === 'converted' && r.mappingConfidence !== 'ambiguousDuplicateSourceName') return false
      } else if (statusFilter === 'ambiguous') {
        if (r.mappingConfidence !== 'ambiguousDuplicateSourceName') return false
      } else if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (q && !(r.name ?? '').toLowerCase().includes(q) && !(r.reason ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [inputAudit, statusFilter, kindFilter, typeFilter, search])

  // 현재 kindFilter 와 호환되는 type 코드 목록을 데이터에서 동적으로 추출
  // → "Pipe" 선택 상태에서는 Pipe 행에 등장한 type 만 표시 (Structure-SCTN 안 보임)
  const typeOptions = useMemo(() => {
    if (!inputAudit) return []
    const counts = new Map()
    for (const r of inputAudit.rowAudit) {
      if (kindFilter !== 'all' && r.kind !== kindFilter) continue
      const t = r.rawFields?.type
      if (!t) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    // U-bolt 가 가장 자주 찾는 카테고리이므로 최상단으로, 그 외엔 카운트 내림차순
    return [...counts.entries()].sort((a, b) => {
      if (a[0] === 'UBOLT') return -1
      if (b[0] === 'UBOLT') return 1
      return b[1] - a[1]
    }).map(([code, count]) => ({ code, count }))
  }, [inputAudit, kindFilter])

  if (!inputAudit) return null

  const activeVp = viewports.find(v => v.id === activeViewportId)
  const stage = activeVp ? stages[activeVp.stageIndex] : null

  const summary = inputAudit.summary
  const ambiguousCount = summary.ambiguousDuplicateSourceNameRows ?? 0
  const issueCount = (summary.ignoredRows ?? 0) + (summary.parseFailedRows ?? 0) + (summary.blankRows ?? 0) + ambiguousCount

  const total     = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage  = Math.min(page, pageCount - 1)
  const slice     = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const isOpen = forceOpen || open

  // 행 클릭 → sourceName 으로 stage entity 매칭 → pickedEntity 설정 + 포커스
  const onRowClick = (r) => {
    const name = r.name
    if (!name) return

    let elementCount = 0, pointMassCount = 0
    if (stage) {
      elementCount   = (stage.elements ?? []).reduce((a, e) => a + (e.sourceName === name ? 1 : 0), 0)
      pointMassCount = (stage.pointMasses ?? []).reduce((a, m) => a + (m.sourceName === name ? 1 : 0), 0)
    }

    // ignored 행은 stage entity 가 없을 수 있다 → rawFields.pos 를 mm 좌표로 파싱해 카메라 포커스 fallback
    const pos = elementCount === 0 && pointMassCount === 0
      ? InputAuditData.parsePosition(r.rawFields?.pos ?? r.rawFields?.poss)
      : null

    setPickedEntity({
      type: 'sourceName',
      sourceName: name,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      reasonCode: r.reasonCode,
      mappingConfidence: r.mappingConfidence,
      elementCount,
      pointMassCount,
      pos,
      rawFields: r.rawFields,
    })
    setTimeout(focusPickedEntity, 0)
  }

  const isCurrentRow = (r) => pickedEntity?.type === 'sourceName' && pickedEntity.sourceName === r.name

  return (
    <div style={{ background: '#12122a', borderTop: embedded ? 'none' : '1px solid #2a2a4a', flexShrink: 0 }}>
      {/* 헤더 — 토글 + 요약 칩 */}
      {!embedded && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px', flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(o => !o)} style={hdrBtn}>{open ? '▼' : '▶'} 변환 감사</button>
        <SummaryChip label="전체"      value={summary.totalDataRows}      color="#7aa6c8" />
        <SummaryChip label="변환"      value={summary.convertedRows}      color={STATUS_COLOR.converted} />
        <SummaryChip label="제외"      value={summary.ignoredRows}        color={STATUS_COLOR.ignored} />
        <SummaryChip label="파싱실패"  value={summary.parseFailedRows}    color={STATUS_COLOR.parseFailed} />
        <SummaryChip label="중복"      value={ambiguousCount}             color="#cc88ff" />
        {!open && issueCount > 0 && (
          <span style={{ fontSize: 12, color: '#7aa6c8' }}>· 펼치면 문제 {issueCount.toLocaleString('ko-KR')}건 확인</span>
        )}
      </div>}

      {isOpen && (
        <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* 필터 바 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }} style={selStyle}>
              <option value="issues">상태: 문제만 (제외/실패/중복)</option>
              <option value="all">상태: 전체</option>
              <option value="converted">converted</option>
              <option value="ignored">ignored</option>
              <option value="parseFailed">parseFailed</option>
              <option value="blank">blank</option>
              <option value="ambiguous">ambiguousDuplicate</option>
            </select>
            <select value={kindFilter} onChange={e => { setKindFilter(e.target.value); setTypeFilter('all'); setPage(0) }} style={selStyle}>
              <option value="all">CSV: 전체</option>
              <option value="Structure">Structure</option>
              <option value="Pipe">Pipe</option>
              <option value="Equipment">Equipment</option>
            </select>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }} style={selStyle} disabled={typeOptions.length === 0}>
              <option value="all">Type: ALL</option>
              {typeOptions.map(({ code, count }) => (
                <option key={code} value={code}>{code} ({count.toLocaleString('ko-KR')})</option>
              ))}
            </select>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              placeholder="name/reason 검색"
              style={{ ...selStyle, minWidth: 180, outline: 'none' }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>
              {total.toLocaleString('ko-KR')}건 / {summary.totalDataRows?.toLocaleString('ko-KR') ?? '-'}
            </span>
            {pageCount > 1 && (
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} style={navBtn}>◀</button>
                <span style={{ fontSize: 12, color: '#aaa' }}>{safePage + 1}/{pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} style={navBtn}>▶</button>
              </span>
            )}
          </div>

          {/* 테이블 */}
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #1e1e36', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1a1a3a', zIndex: 1 }}>
                <tr>
                  <Th w={70}>CSV</Th>
                  <Th w={180}>name</Th>
                  <Th w={90}>status</Th>
                  <Th w={80}>kind</Th>
                  <Th>reason</Th>
                  <Th w={80}>매칭(현 단계)</Th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '14px 0', color: '#555' }}>해당 행 없음</td></tr>
                )}
                {slice.map((r, i) => {
                  const ambiguous = r.mappingConfidence === 'ambiguousDuplicateSourceName'
                  const sc = STATUS_COLOR[r.status] ?? '#888'
                  const matched = stage ? matchCountInStage(stage, r.name) : null
                  const selected = isCurrentRow(r)
                  const clickable = r.name != null && (matched?.total ?? 0) > 0 || r.rawFields?.pos
                  return (
                    <tr
                      key={`${r.kind}_${r.physicalLineNumber}_${i}`}
                      onClick={() => onRowClick(r)}
                      title={clickable ? '3D 뷰로 포커스' : '매칭 가능한 element/mass 가 없음 (위치만 표시)'}
                      style={{
                        background: selected ? 'rgba(70,130,180,0.25)' : (i % 2 ? '#10102a' : 'transparent'),
                        borderLeft: `3px solid ${ambiguous ? '#cc88ff' : sc}`,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#1d1d3a' }}
                      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = i % 2 ? '#10102a' : 'transparent' }}
                    >
                      <Td>
                        <span style={{ color: '#888' }}>{r.kind?.[0] ?? '?'}</span>
                        <span style={{ color: '#555', marginLeft: 4 }}>L{r.physicalLineNumber}</span>
                      </Td>
                      <Td><span style={{ color: '#cad8e8', wordBreak: 'break-all' }}>{r.name ?? '-'}</span></Td>
                      <Td>
                        <span style={{ color: sc, fontWeight: 700 }}>{r.status}</span>
                        {ambiguous && <span title="동일 sourceName 중복" style={{ color: '#cc88ff', marginLeft: 4 }}>⚑</span>}
                      </Td>
                      <Td><span style={{ color: '#888' }}>{r.kind}</span></Td>
                      <Td><span style={{ color: '#888', wordBreak: 'break-all' }}>{r.reasonCode ?? r.reason ?? '-'}</span></Td>
                      <Td>
                        {matched == null ? (
                          <span style={{ color: '#444' }}>-</span>
                        ) : matched.total === 0 ? (
                          <span style={{ color: '#664' }}>없음</span>
                        ) : (
                          <span style={{ color: '#44cc88' }}>
                            {matched.elementCount > 0 ? `E×${matched.elementCount}` : ''}
                            {matched.elementCount > 0 && matched.pointMassCount > 0 ? ' ' : ''}
                            {matched.pointMassCount > 0 ? `M×${matched.pointMassCount}` : ''}
                          </span>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// 현재 stage 에서 같은 sourceName 으로 매칭되는 element / pointMass 개수
function matchCountInStage(stage, name) {
  if (!stage || !name) return null
  let elementCount = 0, pointMassCount = 0
  for (const e of stage.elements ?? []) if (e.sourceName === name) elementCount++
  for (const m of stage.pointMasses ?? []) if (m.sourceName === name) pointMassCount++
  return { elementCount, pointMassCount, total: elementCount + pointMassCount }
}

function SummaryChip({ label, value, color }) {
  if (value == null) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, padding: '3px 9px',
      background: `${color}1a`, border: `1px solid ${color}55`,
      borderRadius: 12, color: '#cad8e8',
    }}>
      <span style={{ color, fontWeight: 700 }}>{(value ?? 0).toLocaleString('ko-KR')}</span>
      <span style={{ color: '#888' }}>{label}</span>
    </span>
  )
}

function Th({ children, w }) {
  return (
    <th style={{
      textAlign: 'left', padding: '6px 8px', fontSize: 12, fontWeight: 700,
      color: '#7ab2d4', borderBottom: '1px solid #2a2a4a',
      width: w, minWidth: w,
    }}>{children}</th>
  )
}
function Td({ children }) {
  return <td style={{ padding: '5px 8px', verticalAlign: 'top', borderBottom: '1px solid #16162e' }}>{children}</td>
}

const hdrBtn = {
  background: '#1a1a3a', color: '#cad8e8', border: '1px solid #2a3a5a',
  borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
}
const selStyle = {
  background: '#1a1a3a', color: '#cad8e8', border: '1px solid #2a2a4a',
  borderRadius: 4, padding: '4px 8px', fontSize: 12,
}
const navBtn = {
  background: '#1a1a3a', color: '#aaa', border: '1px solid #333',
  borderRadius: 3, padding: '2px 8px', fontSize: 12, cursor: 'pointer',
}
