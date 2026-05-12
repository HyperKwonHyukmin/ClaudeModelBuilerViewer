import { useMemo } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { computeMassFallback } from '../store/useEditStore.js'

/**
 * 우하단에 떠 있는 모델 전체 질량/하중 표시 오버레이.
 *
 * 데이터 우선순위:
 *   1. 00_StageSummary.json 의 summary.massProperties (가장 정확 — 빌더가 계산)
 *   2. 위가 없으면 마지막 stage 의 pointMasses + BEAM 자중 fallback (computeMassFallback)
 *
 * 이렇게 두 단계로 fallback 을 두는 이유 — 사내 Group Module Unit Lifting 흐름에서는
 * 폴더에 phase JSON 만 있고 StageSummary 가 없는 경우가 많기 때문.
 *
 * 권상 작업에는 모델 전체 중량과 무게중심 위치가 핵심이므로 두 섹션으로 분리 표시:
 *   (1) 질량/권상 하중, (2) 무게중심
 *
 * 단계가 비어 있고 fallback 도 계산 불가한 경우(stage 없음 또는 mass 데이터 누락)
 * 만 아무것도 렌더하지 않는다.
 */
const G = 9.80665  // m/s² — 표준 중력가속도

export default function MassSummaryOverlay() {
  const stageSummary = useStageStore(s => s.stageSummary)
  const stages = useStageStore(s => s.stages)

  // 마지막 stage 기반 fallback — stages 변동 시에만 재계산 (큰 모델에서 성능 보호).
  const fallback = useMemo(() => {
    if (stageSummary?.massProperties) return null
    const last = stages.length > 0 ? stages[stages.length - 1] : null
    if (!last) return null
    return computeMassFallback(last)
  }, [stageSummary, stages])

  // 표시할 mass — summary 우선, 없으면 fallback. 둘 다 없으면 null.
  const massData = pickMassData(stageSummary?.massProperties, fallback)
  if (!massData) return null

  // 권상 하중 (kN) = 질량(ton) × g → ton·m/s² = kN.
  const totalLoadKN = Number.isFinite(massData.totalMassTon) ? massData.totalMassTon * G : null
  const cog = massData.centerOfGravityMm

  return (
    <div
      title={
        massData.source === 'stageSummary'
          ? '모델 전체 질량 / 권상 하중 / 무게중심 (00_StageSummary.json 기준)'
          : `모델 전체 질량 / 권상 하중 / 무게중심 (자동 계산: ${massData.source})`
      }
      style={{
        position: 'absolute',
        right: 14,
        bottom: 14,
        zIndex: 25,
        background: 'rgba(8, 6, 22, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,215,0,0.35)',
        borderRadius: 10,
        padding: '10px 14px 9px',
        minWidth: 184,
        boxShadow: '0 6px 28px rgba(0,0,0,0.6)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div style={sectionLabelStyle}>Total Mass</div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#f0e8c0', letterSpacing: 0.3 }}>
          {formatTon(massData.totalMassTon)}
        </span>
        <span style={{ fontSize: 11, color: '#a89858', fontWeight: 700 }}>ton</span>
        {Number.isFinite(totalLoadKN) && (
          <span style={{ fontSize: 11, color: '#7ab2d4', fontWeight: 700, marginLeft: 'auto' }}>
            {formatKN(totalLoadKN)} <span style={{ color: '#4a7494', fontSize: 9 }}>kN</span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5, marginBottom: 6 }}>
        {Number.isFinite(massData.beamMassTon) && (
          <Row label="BEAM" value={formatTon(massData.beamMassTon)} unit="ton" />
        )}
        {Number.isFinite(massData.pointMassTon) && (
          <Row label="MASS" value={formatTon(massData.pointMassTon)} unit="ton" />
        )}
      </div>

      {cog && (
        <>
          <div style={{ ...sectionLabelStyle, marginTop: 4 }}>Center of Gravity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Row label="X" value={formatMm(cog.x)} unit="mm" axisColor="#ff5566" />
            <Row label="Y" value={formatMm(cog.y)} unit="mm" axisColor="#37e08a" />
            <Row label="Z" value={formatMm(cog.z)} unit="mm" axisColor="#4488ff" />
          </div>
        </>
      )}

      {massData.source !== 'stageSummary' && (
        <div style={{
          marginTop: 6, fontSize: 8.5, color: '#7a8aaa', letterSpacing: 0.3, fontStyle: 'italic',
        }}>
          ※ 자동 계산 (StageSummary 없음)
        </div>
      )}
    </div>
  )
}

/**
 * stageSummary 가 우선. 없으면 fallback 의 mass + cog 를 사용. 둘 다 없으면 null.
 * cog 가 [x,y,z] 배열로 들어올 수 있으므로 정규화한다.
 */
function pickMassData(summary, fallback) {
  if (summary && Number.isFinite(summary.totalMassTon)) {
    return {
      totalMassTon: summary.totalMassTon,
      beamMassTon: summary.beamMassTon,
      pointMassTon: summary.pointMassTon,
      centerOfGravityMm: normalizeCog(summary.centerOfGravityMm),
      source: 'stageSummary',
    }
  }
  if (fallback && Number.isFinite(fallback.totalMassTon)) {
    return {
      totalMassTon: fallback.totalMassTon,
      beamMassTon: fallback.beamMassTon,
      pointMassTon: fallback.pointMassTon,
      centerOfGravityMm: normalizeCog(fallback.centerOfGravityMm),
      source: fallback.source,
    }
  }
  return null
}

function normalizeCog(cog) {
  if (!cog) return null
  if (Array.isArray(cog) && cog.length >= 3) {
    const [x, y, z] = cog
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null
  }
  if (typeof cog === 'object') {
    const { x, y, z } = cog
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null
  }
  return null
}

function Row({ label, value, unit, axisColor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
      fontSize: 10, lineHeight: 1.3,
    }}>
      <span style={{
        color: axisColor ?? '#7a8aaa',
        fontWeight: 700,
        letterSpacing: 0.5,
        textShadow: axisColor ? `0 0 5px ${axisColor}66` : undefined,
      }}>{label}</span>
      <span style={{ color: '#cad8e8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value} <span style={{ color: '#4a5a7a', fontSize: 9 }}>{unit}</span>
      </span>
    </div>
  )
}

const sectionLabelStyle = {
  fontSize: 9,
  color: '#FFD700',
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  fontWeight: 800,
  marginBottom: 4,
  opacity: 0.9,
}

function formatTon(v) {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1) return v.toFixed(1)
  if (Math.abs(v) >= 0.001) return v.toFixed(3)
  return v.toExponential(2)
}

function formatKN(v) {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 1) return v.toFixed(1)
  return v.toFixed(2)
}

function formatMm(v) {
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
