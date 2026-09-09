import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore } from '../store/useEditStore.js'
import RotateModelDialog from './RotateModelDialog.jsx'

export default function ModelTransformSection() {
  const stages = useStageStore(s => s.stages)
  const rotated = useStageStore(s => s.modelRotated)
  const [dialog, setDialog] = useState(false)
  const [notice, setNotice] = useState(null)

  const reset = () => {
    if (!window.confirm('적용된 모델 회전을 모두 해제하고 원래 방향으로 되돌립니다.\n기존 해석 결과는 초기화됩니다. 계속할까요?')) return
    const r = useStageStore.getState().resetRotation()
    useEditStore.getState().clearRotateModelIntents()
    setNotice(`회전 ${r.undoneCount}건 해제`)
  }

  return <section style={{ padding: '8px', border: '1px solid #20203a', borderRadius: 6 }}>
    <div style={{ fontSize: 10, color: '#FFB800', fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>좌표계·모델 회전</div>
    <button type="button" disabled={!stages.length} onClick={() => setDialog(true)} style={btn(!!stages.length)}>
      <RotateCcw size={13} /> 모델 회전
    </button>
    {rotated && <button type="button" onClick={reset} style={{ ...btn(true), marginTop: 5, color: '#FFE6A8', borderColor: 'rgba(255,184,0,.45)' }}>
      <RotateCcw size={13} /> 전체 회전 해제
    </button>}
    <div style={{ marginTop: 5, fontSize: 10, color: '#8aa0b8', lineHeight: 1.4 }}>회전은 편집 이력에 기록되며 자세안정성·구조해석 결과를 무효화합니다.</div>
    {notice && <div style={{ marginTop: 4, fontSize: 10, color: '#9fd0b6' }}>{notice}</div>}
    {dialog && <RotateModelDialog onClose={() => setDialog(false)} onApplied={r => setNotice(`${r.axis}축 ${r.angleDeg}° · ${r.changedNodeCount} Node 적용`)} />}
  </section>
}

function btn(enabled) { return { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 9px', borderRadius: 6, background: enabled ? '#12122c' : '#0c0c1c', border: '1px solid #2e2e50', color: enabled ? '#cad8e8' : '#54546e', fontSize: 11, fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed' } }
