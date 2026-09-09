import { useState } from 'react'
import { Droplet } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore, computeMassFallback } from '../store/useEditStore.js'
import { collectPipeMaterialIds, isPipeFluidEmpty, PIPE_STEEL_RHO } from '../data/pipeFluid.js'

export default function HoistLoadConditionSection() {
  const stages = useStageStore(s => s.stages)
  const emptied = useStageStore(s => s.pipeFluidEmptied)
  const summary = useStageStore(s => s.stageSummary)
  const [notice, setNotice] = useState(null)
  const stage = stages[stages.length - 1] ?? null
  const materialCount = stage ? collectPipeMaterialIds(stage).size : 0
  const alreadyEmpty = isPipeFluidEmpty(stage)
  const currentEmpty = emptied || alreadyEmpty
  const computed = stage ? computeMassFallback(stage) : null
  const mass = computed?.totalMassTon ?? summary?.massProperties?.totalMassTon
  const cog = computed?.centerOfGravityMm ?? summary?.massProperties?.centerOfGravityMm

  const toggle = () => {
    const st = useStageStore.getState()
    if (emptied) {
      if (!window.confirm('Pipe 내부 유체를 원래 밀도로 복원합니다. 기존 해석 결과는 초기화됩니다. 계속할까요?')) return
      const r = st.restorePipeFluid()
      const es = useEditStore.getState()
      const intent = es.intents.find(i => i.kind === 'emptyPipeFluid')
      if (intent) es.removeIntent(intent.id)
      setNotice(`유체 복원 · material ${r.changedCount}개`)
    } else {
      if (!window.confirm('Pipe 내부 유체 중량을 제거합니다. 총중량과 무게중심이 변경됩니다. 계속할까요?')) return
      const r = st.emptyPipeFluid()
      useEditStore.getState().addIntent({ kind: 'emptyPipeFluid', params: { materialIds: r.materialIds, targetRho: PIPE_STEEL_RHO } })
      setNotice(`유체 제외 · material ${r.changedCount}개`)
    }
  }

  return <section style={{ padding: 8, border: '1px solid rgba(110,231,183,.3)', borderRadius: 7, background: 'rgba(110,231,183,.05)' }}>
    <div style={{ fontSize: 10, color: '#7ab2d4', fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>중량 조건</div>
    <div style={{ fontSize: 10.5, color: '#d9e6ef', lineHeight: 1.5 }}>
      <div>Pipe 유체: <b style={{ color: currentEmpty ? '#6ee7b7' : '#FFC447' }}>{currentEmpty ? '제외' : '포함'}</b></div>
      <div>총중량: <b>{Number.isFinite(Number(mass)) ? `${Number(mass).toFixed(2)} t` : '평가 시 재계산'}</b></div>
      <div>무게중심 XYZ: <b>{formatCog(cog)}</b></div>
      <div>산출 출처: <b>{computed?.massSource ?? (summary ? 'StageSummary' : '평가 시 재계산')}</b></div>
    </div>
    <button type="button" disabled={!stage || (!emptied && alreadyEmpty) || materialCount === 0} onClick={toggle} style={{ marginTop: 7, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, background: '#101024', color: '#bfe9d8', border: '1px solid rgba(110,231,183,.45)', cursor: stage && materialCount ? 'pointer' : 'not-allowed', fontSize: 10.5, fontWeight: 700 }}>
      <Droplet size={13} /> {emptied ? 'Pipe 유체 포함으로 복원' : currentEmpty ? '이미 유체 제외 상태' : 'Pipe 유체 제외'}
    </button>
    {notice && <div style={{ marginTop: 4, color: '#9fd0b6', fontSize: 10 }}>{notice}</div>}
  </section>
}

function formatCog(cog) {
  if (Array.isArray(cog)) return cog.map(v => Number(v).toFixed(0)).join(', ')
  if (cog && Number.isFinite(cog.x)) return `${cog.x.toFixed(0)}, ${cog.y.toFixed(0)}, ${cog.z.toFixed(0)}`
  return '평가 시 재계산'
}
