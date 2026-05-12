import { useState, useMemo } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { summarizeIntent } from '../data/EditIntent.js'

/**
 * 모든 intent 의 검증 warning/error 와 deleteMask 의 broken/fully-removed RBE 상세를
 * 한 곳에 모아 펼쳐서 보여주는 패널. EditPanel 안에 마운트.
 *
 * Props:
 *   intents     — useEditStore.intents
 *   deleteMask  — computeDeleteMask 결과
 *   stageData   — 현재 단계 (broken RBE 의 노드 정보 표시용)
 */
export default function ConflictSummary({ intents, deleteMask, stageData }) {
  const [expanded, setExpanded] = useState(false)

  const items = useMemo(() => collectConflicts(intents, deleteMask, stageData), [intents, deleteMask, stageData])
  if (items.length === 0) return null

  const errCount  = items.filter(i => i.level === 'error').length
  const warnCount = items.filter(i => i.level === 'warning').length
  const headColor = errCount > 0 ? '#FF8866' : '#FFAA55'

  return (
    <div style={{
      border: `1px solid ${headColor}55`,
      background: errCount > 0 ? 'rgba(255,136,102,0.06)' : 'rgba(255,170,85,0.06)',
      borderRadius: 5,
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none',
          padding: '5px 8px', cursor: 'pointer',
          color: headColor, fontSize: 10, fontWeight: 700,
        }}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <AlertTriangle size={11} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          충돌·경고 {items.length}건
          {errCount > 0  && <span style={{ color: '#FF8866' }}> · 오류 {errCount}</span>}
          {warnCount > 0 && <span style={{ color: '#FFAA55' }}> · 경고 {warnCount}</span>}
        </span>
      </button>

      {expanded && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '4px 8px 7px',
          fontSize: 10, color: '#cad8e8',
          maxHeight: 200, overflowY: 'auto',
          borderTop: `1px solid ${headColor}33`,
        }}>
          {items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', flexDirection: 'column', gap: 1,
              padding: '4px 6px',
              background: '#0f0f22',
              border: `1px solid ${item.level === 'error' ? '#FF886655' : '#FFAA5555'}`,
              borderRadius: 4,
            }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  color: item.level === 'error' ? '#FF8866' : '#FFAA55',
                  minWidth: 32,
                }}>
                  {item.level === 'error' ? 'ERR' : 'WARN'}
                </span>
                <span style={{ flex: 1, lineHeight: 1.45 }}>{item.message}</span>
              </div>
              {item.context && (
                <div style={{ fontSize: 9, color: '#7a8aaa', paddingLeft: 37, lineHeight: 1.4 }}>
                  {item.context}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 항목 수집 ──────────────────────────────────────────────────────────────

function collectConflicts(intents, deleteMask, stageData) {
  const items = []

  // 1) 각 intent 의 검증 결과
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i]
    const v = intent.validation ?? {}
    const head = `[${i + 1}] ${summarizeIntent(intent)}`
    for (const e of v.errors ?? []) {
      items.push({ level: 'error', message: e, context: head })
    }
    for (const w of v.warnings ?? []) {
      items.push({ level: 'warning', message: w, context: head })
    }
  }

  // 2) deleteMask 가 만들어내는 끊기는 RBE 상세
  if (stageData && deleteMask?.brokenRbeIds?.size > 0) {
    const deletedNodes = deleteMask.deletedNodeIds ?? new Set()
    const brokenList = []
    for (const r of stageData.rigids ?? []) {
      if (!deleteMask.brokenRbeIds.has(r.id)) continue
      const indDeleted = deletedNodes.has(r.independentNode)
      const lostDeps = (r.dependentNodes ?? []).filter(d => deletedNodes.has(d))
      brokenList.push({
        id:     r.id,
        remark: r.remark,
        cause:  indDeleted
          ? `독립 노드 ${r.independentNode} 삭제, 종속 ${(r.dependentNodes?.length ?? 0) - lostDeps.length}개 잔존`
          : `종속 ${lostDeps.length}/${r.dependentNodes?.length ?? 0}개 삭제`,
      })
    }
    // 너무 길면 잘라서 표시 (요약 기능)
    const top = brokenList.slice(0, 8)
    for (const b of top) {
      items.push({
        level:   'warning',
        message: `RBE #${b.id}${b.remark ? ` (${b.remark})` : ''} 가 삭제로 끊깁니다`,
        context: b.cause,
      })
    }
    if (brokenList.length > top.length) {
      items.push({
        level:   'warning',
        message: `… 그 외 끊기는 RBE ${brokenList.length - top.length}개`,
        context: '대량 발생 — 그룹 경계 다시 검토 권장',
      })
    }
  }

  return items
}
