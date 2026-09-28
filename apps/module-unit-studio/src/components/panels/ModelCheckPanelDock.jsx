import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useViewerStore } from '../../store/useViewerStore.js'
import { useStageStore } from '../../store/useStageStore.js'
import TabPanel, { Accordion, HelpList, StatusLine } from '../shell/TabPanel.jsx'
import LayerPanel from '../LayerPanel.jsx'
import ModelHealthPanel from '../ModelHealthPanel.jsx'
import { getModelHealth } from '../../data/modelHealth.js'

// Model Check 모드 좌측 도크 — FEM 건전성 + 색상 기준(Default / Group / Node Check)·노드 필터.
// 그룹 삭제·자동 연결 같은 편집 행위는 Edit 탭으로 일원화하고, 여기서는 확인만 한다.
const TONE = { pass: 'ok', warn: 'warn', error: 'danger', empty: 'muted' }
const ICON = { pass: CheckCircle2, warn: AlertTriangle, error: XCircle, empty: AlertTriangle }

export default function ModelCheckPanelDock() {
  const activeViewportId = useViewerStore(s => s.activeViewportId)
  const stages = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null
  const health = getModelHealth(lastStage)
  const groupCount = (lastStage?.finalGroups ?? lastStage?.groups ?? []).length

  const status = (
    <StatusLine tone={TONE[health.status] ?? 'muted'} icon={ICON[health.status] ?? AlertTriangle}
      right={lastStage ? `연결 그룹 ${groupCount}` : null}>
      {health.status === 'empty' ? '모델 없음'
        : health.blocking.length > 0 ? `해석 차단 ${health.blocking.length}건`
        : health.errors > 0 || health.warnings > 0 ? `오류 ${health.errors} · 경고 ${health.warnings}`
        : '문제 없음'}
    </StatusLine>
  )

  const help = (
    <>
      <div>해석에 넣기 전에 모델이 성한지 눈으로 확인하는 탭입니다. 여기서는 고치지 않습니다.</div>
      <HelpList title="보는 것" items={[
        'FEM 건전성 — 고립 노드·끊어진 RBE 등 해석을 막는 문제',
        '연결 그룹 — 색상 기준을 Group 으로 두면 분리된 조각이 다른 색으로 보입니다',
        'Node Check — Free(자유단)·Orphan(고립) 노드 필터',
      ]} />
      <HelpList title="고치려면" items={[
        '분리된 그룹 잇기 · 그룹 삭제 · 부재 삭제 → Edit 탭',
      ]} />
    </>
  )

  return (
    <TabPanel id="modelCheck" title="Model Check" purpose="연결 그룹·자유단 노드를 확인합니다."
      icon={ShieldCheck} status={status} help={help}>
      {lastStage ? (
        <>
          <Accordion title="FEM 건전성" tone="alt" defaultOpen>
            <ModelHealthPanel embedded />
          </Accordion>
          <Accordion title="색상 기준 · 노드 필터" defaultOpen>
            <LayerPanel viewportId={activeViewportId} stageData={lastStage} isEditTargetStage embedded readOnly />
          </Accordion>
        </>
      ) : (
        <div style={{ margin: '14px 10px', padding: 12, color: '#7a8aaa', fontSize: 12, lineHeight: 1.6 }}>
          파일을 로드하면 색상 기준(Default / Group / Node Check)·노드 필터와 해석 결과 표시가 여기에 나타납니다.
        </div>
      )}
    </TabPanel>
  )
}
