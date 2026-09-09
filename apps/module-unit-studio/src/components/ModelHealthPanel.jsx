import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { getModelHealth } from '../data/modelHealth.js'

const TONE = {
  pass: { color: '#37E08A', Icon: CheckCircle2, label: '진행 가능' },
  warn: { color: '#FFC447', Icon: AlertTriangle, label: '경고 확인 후 진행 가능' },
  error: { color: '#FF5566', Icon: XCircle, label: '오류 수정 필요' },
  empty: { color: '#7a8aaa', Icon: AlertTriangle, label: '모델 없음' },
}

export default function ModelHealthPanel() {
  const stages = useStageStore(s => s.stages)
  const summary = useStageStore(s => s.stageSummary)
  const stage = stages[stages.length - 1] ?? null
  const health = getModelHealth(stage)
  const tone = TONE[health.status]
  const totals = stage?.healthMetrics?.totals ?? {}
  const mass = summary?.massProperties
  const cog = mass?.centerOfGravityMm

  return (
    <section style={{ padding: '10px 8px', borderBottom: '1px solid #1e1e38' }} aria-label="FEM 모델 건전성">
      <div style={{ fontSize: 10, color: '#7ab2d4', letterSpacing: 1.4, fontWeight: 800, marginBottom: 7 }}>FEM 건전성</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: tone.color, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
        <tone.Icon size={14} /> {tone.label}
      </div>
      {stage && <>
        <GridRow label="Node / Element" value={`${num(totals.nodeCount)} / ${num(totals.elementCount)}`} />
        <GridRow label="RBE / Point Mass" value={`${num(totals.rigidCount)} / ${num(totals.pointMassCount)}`} />
        <GridRow label="진단" value={`오류 ${num(health.errors)} · 경고 ${num(health.warnings)}`} danger={health.errors > 0} />
        {health.issues.map(i => <GridRow key={i.label} label={i.label} value={num(i.value)} warn={i.value > 0} />)}
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #22223b', fontSize: 10, color: '#9fb4cc', lineHeight: 1.5 }}>
          <div>단위: <b>mm·N·s·t</b> · Phase: <b>{stage.meta?.stageName ?? stage.sourceFileName ?? '-'}</b></div>
          <div>총중량: <b>{Number.isFinite(Number(mass?.totalMassTon)) ? `${Number(mass.totalMassTon).toFixed(2)} t` : '산출 정보 없음'}</b></div>
          <div>무게중심: <b>{Array.isArray(cog) ? cog.map(v => Number(v).toFixed(0)).join(', ') : cog && Number.isFinite(cog.x) ? `${cog.x.toFixed(0)}, ${cog.y.toFixed(0)}, ${cog.z.toFixed(0)}` : '평가 시 재계산'}</b></div>
        </div>
        <div style={{ marginTop: 7, fontSize: 10, lineHeight: 1.45, color: health.status === 'error' ? '#FFB3BC' : '#9fb4cc' }}>
          오류는 권상 평가를 차단합니다. 경고는 현재 정책대로 확인 후 진행할 수 있습니다.
        </div>
      </>}
    </section>
  )
}

function GridRow({ label, value, warn, danger }) {
  const color = danger ? '#FF6677' : warn ? '#FFC447' : '#cdd8e8'
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 1px', fontSize: 10.5 }}>
    <span style={{ color: '#8aa0b8' }}>{label}</span><b style={{ color }}>{value}</b>
  </div>
}

function num(v) { return (Number(v) || 0).toLocaleString('ko-KR') }
