import { Save, CheckCircle2, AlertTriangle } from 'lucide-react'
import TabPanel, { Accordion, HelpList, StatusLine, FooterNote } from '../shell/TabPanel.jsx'
import BdfExportSection from '../BdfExportSection.jsx'
import UnitStructuralReportButton from '../UnitStructuralReportButton.jsx'
import { Op2DownloadButton } from '../StructuralFileDownloads.jsx'
import { useStageStore } from '../../store/useStageStore.js'
import { useEditStore } from '../../store/useEditStore.js'
import { useUnitStructuralStore } from '../../store/useUnitStructuralStore.js'
import { INK, FONT } from '../../utils/tokens.js'

/**
 * Save 탭 — 산출물을 저장하는 자리 (ModelBuilderStudio 의 Save 탭과 같은 위치·역할).
 *
 * 이전에는 BDF 내보내기가 Analysis 탭 '산출물' 섹션에, 보고서 버튼이 해석 성공 카드 안에 묻혀 있어
 * "저장하려면 어디로 가야 하나"가 탭마다 흩어져 있었다. 저장은 전부 여기로 모은다.
 * (Edit 탭의 BDF 내보내기는 편집 중간 산출물용으로 그대로 둔다 — 편집하다 바로 뽑는 용도다.)
 */
export default function SavePanel() {
  const modelLoaded = useStageStore(s => (s.stages?.length ?? 0) > 0)
  const intents = useEditStore(s => s.intents)
  const structuralStatus = useUnitStructuralStore(s => s.status)
  const analysisDone = structuralStatus === 'Success'

  const status = !modelLoaded
    ? <StatusLine tone="muted" icon={AlertTriangle}>모델을 먼저 엽니다</StatusLine>
    : analysisDone
      ? <StatusLine tone="ok" icon={CheckCircle2} right={`편집 ${intents.length}건`}>BDF·OP2·보고서 모두 저장 가능</StatusLine>
      : <StatusLine tone="info" icon={Save} right={`편집 ${intents.length}건`}>BDF 저장 가능 · 보고서는 해석 후</StatusLine>

  const help = (
    <>
      <div>현재 편집 상태를 파일로 뽑는 자리입니다. 해석을 다시 돌리지 않아도 저장할 수 있습니다.</div>
      <HelpList title="산출물" items={[
        'BDF — 회전·삭제·RBE·가서포트 등 편집 의도를 모두 반영한 모델 파일(권상 Wire 없음)',
        'OP2 — 구조 해석 결과. 해석 성공 후에만 나옵니다. Wire 포함 BDF 는 Analysis 탭.',
        '검토 보고서 — 구조 해석 결과로 만드는 xlsx(결과/상세 2종). 해석 성공 후에만 나옵니다.',
      ]} />
      <HelpList title="주의" items={[
        '보고서는 백엔드가 3D 그림을 그려 만들기 때문에 수십 초 걸립니다(안내막이 뜹니다).',
      ]} />
    </>
  )

  return (
    <TabPanel id="save" title="Save" purpose="편집 모델과 검토 보고서를 파일로 저장합니다." icon={Save} status={status} help={help}
      footer={!modelLoaded ? <FooterNote tone="muted">Model 탭에서 결과 폴더를 열면 저장할 수 있습니다.</FooterNote> : null}>
      <Accordion title="모델 (BDF)" defaultOpen>
        <BdfExportSection />
      </Accordion>

      <Accordion title="구조 해석 결과 (OP2)" defaultOpen>
        <Op2DownloadButton />
      </Accordion>

      <Accordion title="검토 보고서" defaultOpen>
        {analysisDone ? (
          <UnitStructuralReportButton />
        ) : (
          <div style={{ fontSize: FONT.sm, color: INK.dim, lineHeight: 1.55 }}>
            Analysis 탭에서 <strong style={{ color: '#FFE6A8' }}>구조 해석 실행</strong>이 성공하면
            결과·상세 레포트 버튼이 여기에 나타납니다.
          </div>
        )}
      </Accordion>
    </TabPanel>
  )
}
