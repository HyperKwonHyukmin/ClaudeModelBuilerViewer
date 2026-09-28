import { useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { getHost } from '../host/host.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { useStageStore } from '../store/useStageStore.js'
import UnitStructuralReportDialog from './UnitStructuralReportDialog.jsx'
import ReportProgressOverlay from './ReportProgressOverlay.jsx'

/**
 * 저장된 Unit 구조 해석 결과로 표준 검토 보고서를 생성한다(PDF 기본, xlsx 선택).
 * 그림은 백엔드가 결과 JSON 으로 직접 그리므로 3D 화면 캡처가 필요 없다.
 * PDF 는 백엔드가 만든 xlsx 를 서버 Excel 로 인쇄해 변환한다(라우터 format=pdf).
 */
export default function UnitStructuralReportButton() {
  const status = useUnitStructuralStore(s => s.status)
  const analysisId = useUnitStructuralStore(s => s.analysisId)
  const sourceFileName = useStageStore(s => s.stages?.[s.stages.length - 1]?.sourceFileName ?? '')
  const [kind, setKind] = useState(null)          // 'result' | 'detail' | null(닫힘)
  const [runningKind, setRunningKind] = useState(null)   // 생성 중인 보고서 종류(안내막 표시용)
  const [runningFormat, setRunningFormat] = useState('xlsx')  // 안내막의 예상 시간에 쓴다
  const [state, setState] = useState({ status: 'idle', message: '' })

  const running = state.status === 'running'
  const disabled = status !== 'Success' || !analysisId || running

  const handleSubmit = async (options, format = 'pdf') => {
    const target = kind
    setKind(null)
    const host = getHost()
    if (typeof host.generateUnitLiftingReport !== 'function') {
      setState({ status: 'error', message: 'Workbench 보고서 생성 기능을 사용할 수 없습니다.' })
      return
    }
    setState({ status: 'running', message: '백엔드에서 보고서를 작성하는 중...' })
    setRunningFormat(format)
    setRunningKind(target)                        // 화면 전체를 덮어 조작을 막는다
    try {
      const r = await host.generateUnitLiftingReport({ analysisId, kind: target, format, options })
      if (r?.canceled) {
        setState({ status: 'idle', message: '' })
      } else if (r?.ok) {
        const warn = Array.isArray(r.warnings) && r.warnings.length ? ` · 경고 ${r.warnings.length}건(부록 C)` : ''
        setState({ status: 'success', message: `저장 완료${warn}: ${r.savedPath}` })
      } else {
        setState({ status: 'error', message: r?.error ?? '보고서 생성에 실패했습니다.' })
      }
    } catch (error) {
      setState({ status: 'error', message: error?.message ?? String(error) })
    } finally {
      setRunningKind(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <button
        type="button"
        onClick={() => { if (!disabled) setKind('result') }}
        disabled={disabled}
        title="사내 표준 서식(2~3페이지)으로 결과 레포트를 출력합니다. 형식(PDF·xlsx)은 다음 창에서 고릅니다."
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          width: '100%', padding: '9px 10px', borderRadius: 7,
          border: `1px solid ${disabled ? '#2a2a40' : 'rgba(55,224,138,0.55)'}`,
          background: disabled ? '#0f0f1e' : 'rgba(55,224,138,0.12)',
          color: disabled ? '#5a5a80' : '#65F0A2',
          fontSize: 11.5, fontWeight: 850,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {running ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
        {running ? '보고서 생성 중...' : '결과 레포트 출력'}
      </button>
      <button
        type="button"
        onClick={() => { if (!disabled) setKind('detail') }}
        disabled={disabled}
        title="입력·가정·전 결과를 담은 다장 상세 레포트를 생성합니다. 형식(PDF·xlsx)은 다음 창에서 고릅니다."
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          width: '100%', padding: '7px 10px', borderRadius: 7,
          border: `1px solid ${disabled ? '#2a2a40' : '#2f4f6f'}`,
          background: '#0f0f1e',
          color: disabled ? '#5a5a80' : '#9fb4cc',
          fontSize: 11, fontWeight: 800,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <FileText size={14} /> 상세 레포트
      </button>
      {state.message && (
        <div style={{
          fontSize: 10, lineHeight: 1.45, wordBreak: 'break-all',
          color: state.status === 'error' ? '#FF8A98'
            : state.status === 'success' ? '#65F0A2' : '#9fb4cc',
        }}>
          {state.message}
        </div>
      )}
      {runningKind && <ReportProgressOverlay kind={runningKind} format={runningFormat} />}
      {kind && (
        <UnitStructuralReportDialog
          kind={kind}
          sourceFileName={sourceFileName}
          onClose={() => setKind(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
