import { useMemo, useState } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { stageDiff } from '../data/stageDiff.js'

export default function DiffTable({ embedded = false, forceOpen = false }) {
  const { stages } = useStageStore()
  const { viewports, setPickedEntity, focusPickedEntity } = useViewerStore()
  const [open, setOpen] = useState(false)
  const [idxA, setIdxA] = useState(0)
  const [idxB, setIdxB] = useState(stages.length > 1 ? stages.length - 1 : 0)
  const [rows, setRows] = useState(null)

  const isLinked = viewports.length >= 2
  const effectiveIdxA = isLinked ? viewports[0].stageIndex : idxA
  const effectiveIdxB = isLinked ? viewports[1].stageIndex : idxB
  const effectiveRows = useMemo(() => (
    isLinked && stages.length >= 2
      ? stageDiff(stages[effectiveIdxA], stages[effectiveIdxB])
      : rows
  ), [effectiveIdxA, effectiveIdxB, isLinked, rows, stages])
  const isOpen = forceOpen || open || (isLinked && stages.length >= 2)

  if (stages.length < 2) return null

  const runDiff = () => {
    setRows(stageDiff(stages[idxA], stages[idxB]))
  }

  const selectTraceEntity = (t) => {
    const stage = stages[effectiveIdxB]
    const elemId = t.elemId ?? t.relatedElemId
    if (elemId != null) {
      const elem = stage.elements?.find(e => e.id === elemId)
      if (elem) {
        setPickedEntity({ type: 'element', id: elem.id, category: elem.category, startNode: elem.startNode, endNode: elem.endNode, propertyId: elem.propertyId })
        setTimeout(focusPickedEntity, 0)
      }
      return
    }
    if (t.nodeId != null && stage.nodeMap?.has(t.nodeId)) {
      setPickedEntity({ type: 'node', nodeId: t.nodeId })
      setTimeout(focusPickedEntity, 0)
    }
  }

  const changeEvents = effectiveRows ? (stages[effectiveIdxB]?.trace ?? []).filter(t =>
    ['ElementCreated', 'ElementRemoved', 'ElementSplit', 'NodeMerged', 'NodeMoved'].includes(t.action)
  ).slice(0, 40) : []

  return (
    <div style={{ background: '#12122a', borderTop: embedded ? 'none' : '1px solid #2a2a4a', flexShrink: 0 }}>
      {/* Header bar */}
      {!embedded && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px' }}>
        <button onClick={() => setOpen(o => !o)} style={hdrBtn}>{isOpen ? '▼' : '▶'} 단계 비교</button>
        {isOpen && (
          isLinked ? (
            <span style={{ color: '#4fc3f7', fontSize: 13 }}>
              VP1 ({stages[effectiveIdxA]?.meta?.stageName ?? effectiveIdxA+1}) ↔ VP2 ({stages[effectiveIdxB]?.meta?.stageName ?? effectiveIdxB+1}) 자동 동기화
            </span>
          ) : (
            <>
              <select value={idxA} onChange={e => { setIdxA(+e.target.value); setRows(null) }} style={selStyle}>
                {stages.map((s, i) => <option key={i} value={i}>{String(i+1).padStart(2,'0')} {s.meta?.stageName}</option>)}
              </select>
              <span style={{ color: '#555', fontSize: 13 }}>vs</span>
              <select value={idxB} onChange={e => { setIdxB(+e.target.value); setRows(null) }} style={selStyle}>
                {stages.map((s, i) => <option key={i} value={i}>{String(i+1).padStart(2,'0')} {s.meta?.stageName}</option>)}
              </select>
              <button onClick={runDiff} style={{ ...hdrBtn, background: '#4682B4' }}>비교</button>
            </>
          )
        )}
      </div>}

      {embedded && isOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 8px', borderBottom: '1px solid #1e1e36' }}>
          {isLinked ? (
            <span style={{ color: '#4fc3f7', fontSize: 13 }}>
              VP1 ({stages[effectiveIdxA]?.meta?.stageName ?? effectiveIdxA+1}) ↔ VP2 ({stages[effectiveIdxB]?.meta?.stageName ?? effectiveIdxB+1}) 자동 동기화
            </span>
          ) : (
            <>
              <select value={idxA} onChange={e => { setIdxA(+e.target.value); setRows(null) }} style={selStyle}>
                {stages.map((s, i) => <option key={i} value={i}>{String(i+1).padStart(2,'0')} {s.meta?.stageName}</option>)}
              </select>
              <span style={{ color: '#555', fontSize: 13 }}>vs</span>
              <select value={idxB} onChange={e => { setIdxB(+e.target.value); setRows(null) }} style={selStyle}>
                {stages.map((s, i) => <option key={i} value={i}>{String(i+1).padStart(2,'0')} {s.meta?.stageName}</option>)}
              </select>
              <button onClick={runDiff} style={{ ...hdrBtn, background: '#4682B4' }}>비교</button>
            </>
          )}
        </div>
      )}

      {/* Results table */}
      {isOpen && effectiveRows && (
        <div style={{ padding: '0 12px 10px', overflow: 'auto', maxHeight: 240 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#555', textAlign: 'right' }}>
                <th style={thStyle('left')}>항목</th>
                <th style={thStyle()}>A</th>
                <th style={thStyle()}>B</th>
                <th style={thStyle()}>Δ</th>
                <th style={thStyle()}>Δ%</th>
              </tr>
            </thead>
            <tbody>
              {effectiveRows.map((r) => (
                <tr key={r.label} style={{ borderBottom: '1px solid #1a1a2e' }}>
                  <td style={tdStyle('left')}>{r.label}</td>
                  <td style={tdStyle()}>{r.a.toLocaleString()}</td>
                  <td style={tdStyle()}>{r.b.toLocaleString()}</td>
                  <td style={{ ...tdStyle(), color: deltaColor(r.delta) }}>
                    {r.delta > 0 ? '+' : ''}{r.delta.toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle(), color: deltaColor(r.delta) }}>
                    {r.delta === 0 ? '—' : `${r.deltaPercent > 0 ? '+' : ''}${r.deltaPercent.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {changeEvents.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#7ab2d4', fontWeight: 700, marginBottom: 4 }}>
                변경 이벤트 ({changeEvents.length}건 표시)
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {changeEvents.map((t, i) => (
                  <button
                    key={`${t.stage}-${t.action}-${i}`}
                    onClick={() => selectTraceEntity(t)}
                    style={{
                      background: '#1a1a3a', color: '#bbb', border: '1px solid #2a2a4a',
                      borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                    }}
                    title="B 단계의 관련 항목을 3D에서 선택"
                  >
                    {t.action.replace('Element', 'E.').replace('Node', 'N.')}
                    {t.elemId != null ? ` E:${t.elemId}` : ''}
                    {t.nodeId != null ? ` N:${t.nodeId}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const deltaColor = d => d > 0 ? '#FF6B6B' : d < 0 ? '#4fc3f7' : '#555'
const hdrBtn = { padding: '4px 12px', background: '#1a1a3a', color: '#cad8e8', border: '1px solid #333', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontWeight: 600 }
const selStyle = { background: '#1a1a3a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '3px 8px', fontSize: 13 }
const thStyle = (align = 'right') => ({ padding: '5px 8px', textAlign: align, fontWeight: 600, borderBottom: '1px solid #2a2a4a' })
const tdStyle = (align = 'right') => ({ padding: '4px 8px', textAlign: align, color: '#bbb' })
