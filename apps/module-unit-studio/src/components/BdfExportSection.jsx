import { useState } from 'react'
import { CheckCircle2, FileDown, Loader2, XCircle } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'

/** 현재 편집 상태를 해석 파이프라인과 같은 라이터로 BDF에 내보낸다. */
export default function BdfExportSection({ compact = false }) {
  const exportEditedBdf = useEditStore(s => s.exportEditedBdf)
  const modelLoaded = useStageStore(s => (s.stages?.length ?? 0) > 0)
  const [status, setStatus] = useState({ phase: 'idle', message: '', stats: null })
  const saving = status.phase === 'saving'

  const onExport = async () => {
    setStatus({ phase: 'saving', message: 'BDF 생성 중…', stats: null })
    try {
      const result = await exportEditedBdf()
      if (result?.ok) setStatus({ phase: 'ok', message: result.savedPath ?? '내보내기 완료', stats: result.stats ?? null })
      else if (result?.canceled) setStatus({ phase: 'idle', message: '', stats: null })
      else setStatus({ phase: 'error', message: result?.error ?? '내보내기 실패', stats: null })
    } catch (error) {
      setStatus({ phase: 'error', message: error?.message ?? String(error), stats: null })
    }
  }

  return (
    <section style={{ padding: compact ? 8 : 0, border: compact ? '1px solid #20203a' : 'none', borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: '#7ab2d4', fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>
        모델 내보내기
      </div>
      <button type="button" onClick={onExport} disabled={saving || !modelLoaded} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        width: '100%', padding: '8px 10px', borderRadius: 6,
        background: saving || !modelLoaded ? '#0f0f1e' : 'rgba(110,231,183,.14)',
        color: saving || !modelLoaded ? '#5a5a80' : '#bff5df',
        border: `1px solid ${saving || !modelLoaded ? '#2a2a40' : 'rgba(110,231,183,.55)'}`,
        cursor: saving || !modelLoaded ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 800,
      }}>
        {saving ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} /> : <FileDown size={14} />}
        {saving ? 'BDF 생성 중…' : '현재 모델 BDF 내보내기'}
      </button>
      {status.phase === 'ok' && <Status Icon={CheckCircle2} color="#37E08A">완료 · {status.message}</Status>}
      {status.phase === 'error' && <Status Icon={XCircle} color="#FF7A88">실패 · {status.message}</Status>}
      <div style={{ marginTop: 5, color: '#7f91aa', fontSize: 10, lineHeight: 1.45 }}>
        회전·삭제·RBE·가서포트 등 현재 편집 상태를 반영합니다.
      </div>
    </section>
  )
}

function Status({ Icon, color, children }) {
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 6, color, fontSize: 10, lineHeight: 1.45, wordBreak: 'break-all' }}>
    <Icon size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {children}
  </div>
}
