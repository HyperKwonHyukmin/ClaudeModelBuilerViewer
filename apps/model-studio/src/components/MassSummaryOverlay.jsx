import { useStageStore } from '../store/useStageStore.js'

/**
 * 우하단에 떠 있는 모델 전체 질량 표시 오버레이.
 *
 * 데이터 출처: 00_StageSummary.json 의 summary.massProperties (최종 모델 기준).
 * 단계를 바꿔도 항상 최종 모델 값을 보여 준다 — 단계별 질량은 데이터에 없음.
 *
 * stageSummary 가 없으면 (00_StageSummary.json 미포함 폴더) 아무것도 렌더하지 않는다.
 */
export default function MassSummaryOverlay() {
  const stageSummary = useStageStore(s => s.stageSummary)
  const mass = stageSummary?.massProperties
  if (!mass) return null

  return (
    <div
      title="모델 전체 질량 (최종 모델 기준)"
      style={{
        position: 'absolute',
        right: 14,
        bottom: 14,
        zIndex: 25,
        background: 'rgba(8, 6, 22, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,215,0,0.35)',
        borderRadius: 10,
        padding: '9px 13px 8px',
        minWidth: 150,
        boxShadow: '0 6px 28px rgba(0,0,0,0.6)',
        pointerEvents: 'none',  // 3D 인터랙션을 가리지 않도록
        userSelect: 'none',
      }}
    >
      <div style={{
        fontSize: 9, color: '#FFD700', letterSpacing: 1.4,
        textTransform: 'uppercase', fontWeight: 800, marginBottom: 4,
        opacity: 0.9,
      }}>
        Total Mass
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
        marginBottom: 5,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#f0e8c0', letterSpacing: 0.3 }}>
          {formatTon(mass.totalMassTon)}
        </span>
        <span style={{ fontSize: 11, color: '#a89858', fontWeight: 700 }}>ton</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Row label="BEAM" value={formatTon(mass.beamMassTon)} />
        <Row label="MASS" value={formatTon(mass.pointMassTon)} />
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
      fontSize: 10, lineHeight: 1.3,
    }}>
      <span style={{ color: '#7a8aaa', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ color: '#cad8e8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value} <span style={{ color: '#4a5a7a', fontSize: 9 }}>ton</span>
      </span>
    </div>
  )
}

// 102.7376527 → "102.7" 같이 의미있는 자릿수만.
// 1 ton 미만은 소수 셋째 자리, 그 이상은 첫째 자리.
function formatTon(v) {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1) return v.toFixed(1)
  if (Math.abs(v) >= 0.001) return v.toFixed(3)
  return v.toExponential(2)
}
