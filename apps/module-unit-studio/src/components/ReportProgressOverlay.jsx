import { useEffect, useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'

/**
 * 보고서 생성 중 화면 전체를 덮어 Studio 조작을 막는 안내막.
 *
 * 백엔드가 3D 그림을 직접 렌더하느라 수십 초가 걸리는데, 그 사이 화면이 멀쩡해 보이면
 * 사용자가 버튼을 다시 누르거나 모델을 만진다. 예상 소요 시간과 경과를 보여 주고 기다리게 한다.
 * 진행률은 서버에서 받는 값이 아니라 예상 시간 대비 경과일 뿐이라 95% 에서 멈춰 두고,
 * 예상을 넘기면 '마무리 중' 으로 바꾼다(끝난 것처럼 보이게 하지 않는다).
 */
// 실측(대형 모델 2,500부재, dev PC): 결과 6.2s · 상세 9.1s. 서버 사양·전송·저장까지 넉넉히 잡은 값이다.
const ESTIMATE_SEC = { result: 25, detail: 35 }
// PDF 는 그 위에 "서버 Excel 로 열어 인쇄" 가 더 붙는다 — 실측 결과 +4s · 상세 +12s(Excel 기동 2.6s 포함).
const PDF_EXTRA_SEC = { result: 10, detail: 20 }

export default function ReportProgressOverlay({ kind = 'result', format = 'xlsx' }) {
  const [elapsed, setElapsed] = useState(0)
  const estimate = (ESTIMATE_SEC[kind] ?? ESTIMATE_SEC.result)
    + (format === 'pdf' ? (PDF_EXTRA_SEC[kind] ?? PDF_EXTRA_SEC.result) : 0)
  const label = kind === 'detail' ? '상세 레포트' : '결과 레포트'
  const over = elapsed > estimate
  const pct = Math.min(95, Math.round((elapsed / estimate) * 100))

  useEffect(() => {
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 250)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-label={`${label} 생성 중`}
      onClick={e => { e.preventDefault(); e.stopPropagation() }}
      onContextMenu={e => e.preventDefault()}
      onWheel={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000, cursor: 'progress',
        background: 'rgba(6,6,18,0.82)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 420, maxWidth: '92vw', padding: '22px 24px', borderRadius: 10,
        background: '#0d0d22', border: '1px solid rgba(55,224,138,0.45)',
        boxShadow: '0 18px 48px rgba(0,0,0,0.65)',
        display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#65F0A2' }}>
          <Loader2 size={20} className="spin" />
          <FileSpreadsheet size={19} />
        </div>

        <div style={{ fontSize: 15, fontWeight: 850, color: '#e6e9f2' }}>
          {label} 생성 중
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#65F0A2' }}>
          보고서 출력에 약 {estimate}초 소요됩니다
        </div>

        <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#1b1b33', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 3,
            background: 'linear-gradient(90deg,#37E08A,#65F0A2)', transition: 'width 250ms linear',
          }} />
        </div>

        <div style={{ fontSize: 11.5, color: '#9fb4cc', lineHeight: 1.7 }}>
          {over ? `경과 ${elapsed}초 · 마무리 중입니다` : `경과 ${elapsed}초`}
          <br />
          백엔드가 해석 결과로 3D 그림을 그리고 서식을 채우는 중입니다.
          <br />
          {format === 'pdf' && <>변환까지 마친 뒤 PDF 로 내려받습니다.<br /></>}
          서버 사양에 따라 더 걸릴 수 있습니다.
          <br />
          완료되면 저장 위치를 묻는 창이 열립니다. 그때까지 기다려 주세요.
        </div>
      </div>
    </div>
  )
}
