import { useState, useEffect } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { stageDiff } from '../data/stageDiff.js'

export default function DiffTable() {
  const { stages } = useStageStore()
  const { viewports } = useViewerStore()
  const [open, setOpen] = useState(false)
  const [idxA, setIdxA] = useState(0)
  const [idxB, setIdxB] = useState(stages.length > 1 ? stages.length - 1 : 0)
  const [rows, setRows] = useState(null)

  const isLinked = viewports.length >= 2

  // Auto-sync: when 2+ viewports exist, mirror their stage selections and run diff
  useEffect(() => {
    if (!isLinked || stages.length < 2) return
    const a = viewports[0].stageIndex
    const b = viewports[1].stageIndex
    setIdxA(a)
    setIdxB(b)
    setOpen(true)
    setRows(stageDiff(stages[a], stages[b]))
  }, [isLinked, viewports, stages]) // eslint-disable-line react-hooks/exhaustive-deps

  if (stages.length < 2) return null

  const runDiff = () => {
    setRows(stageDiff(stages[idxA], stages[idxB]))
  }

  return (
    <div style={{ background: '#12122a', borderTop: '1px solid #2a2a4a', flexShrink: 0 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px' }}>
        <button onClick={() => setOpen(o => !o)} style={hdrBtn}>{open ? '▼' : '▶'} 단계 비교</button>
        {open && (
          isLinked ? (
            <span style={{ color: '#4fc3f7', fontSize: 11 }}>
              VP1 ({stages[idxA]?.meta?.stageName ?? idxA+1}) ↔ VP2 ({stages[idxB]?.meta?.stageName ?? idxB+1}) 자동 동기화
            </span>
          ) : (
            <>
              <select value={idxA} onChange={e => { setIdxA(+e.target.value); setRows(null) }} style={selStyle}>
                {stages.map((s, i) => <option key={i} value={i}>{String(i+1).padStart(2,'0')} {s.meta?.stageName}</option>)}
              </select>
              <span style={{ color: '#555', fontSize: 12 }}>vs</span>
              <select value={idxB} onChange={e => { setIdxB(+e.target.value); setRows(null) }} style={selStyle}>
                {stages.map((s, i) => <option key={i} value={i}>{String(i+1).padStart(2,'0')} {s.meta?.stageName}</option>)}
              </select>
              <button onClick={runDiff} style={{ ...hdrBtn, background: '#4682B4' }}>비교</button>
            </>
          )
        )}
      </div>

      {/* Results table */}
      {open && rows && (
        <div style={{ padding: '0 12px 10px', overflow: 'auto', maxHeight: 200 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
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
              {rows.map((r) => (
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
        </div>
      )}
    </div>
  )
}

const deltaColor = d => d > 0 ? '#FF6B6B' : d < 0 ? '#4fc3f7' : '#555'
const hdrBtn = { padding: '3px 10px', background: '#1a1a3a', color: '#aaa', border: '1px solid #333', borderRadius: 4, fontSize: 11, cursor: 'pointer' }
const selStyle = { background: '#1a1a3a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '2px 6px', fontSize: 11 }
const thStyle = (align = 'right') => ({ padding: '4px 6px', textAlign: align, fontWeight: 600, borderBottom: '1px solid #2a2a4a' })
const tdStyle = (align = 'right') => ({ padding: '3px 6px', textAlign: align, color: '#bbb' })
