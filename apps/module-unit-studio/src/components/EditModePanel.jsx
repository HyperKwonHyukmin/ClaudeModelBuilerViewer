import { Pencil, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import TabPanel, { Accordion, HelpList, StatusLine } from './shell/TabPanel.jsx'
import EditModeToggle from './EditModeToggle.jsx'
import EditPanel from './EditPanel.jsx'

/**
 * EditModePanel — 상단 메뉴바 activeMode === 'edit' 일 때 좌측에 표시되는 탭 패널.
 *
 * 기존 컴포넌트를 '마운트 위치'만 옮겨 재사용한다(내부 store/handler/단축키 로직 변경 0):
 *   · EditModeToggle — 편집 모드 ON/OFF 가시 토글
 *   · EditPanel      — 그룹 관리·자동 연결·형상 변환·가서포트·편집 의도 목록 (enabled=false 면 null)
 *
 * 권상 위치 설정은 상단 Hoist 탭이 맡는다. 권상 픽킹(Shift+Node)도 그 탭에서만 켜진다
 * (ViewportContainer 의 hoistActive 게이트). App.jsx 가 Edit 탭 진입 시 editStore.enabled 를 켜므로
 * 보통은 토글이 이미 ON 인 상태로 들어온다.
 *
 * 외곽은 `shell/TabPanel.jsx` 의 공통 4구역 틀(ModelBuilderStudio 와 동일) — 6개 탭이 같은
 * 순서(제목 → 상태 → 본문 → 액션)를 가져야 탭을 옮겨도 눈 움직임이 재사용된다.
 */
export default function EditModePanel() {
  const enabled = useEditStore(s => s.enabled)
  const intents = useEditStore(s => s.intents)
  const modelLoaded = useStageStore(s => (s.stages?.length ?? 0) > 0)

  const listIntents = intents.filter(i => i.kind !== 'rotateModel')
  const errCount = listIntents.filter(i => i.validation?.status === 'error').length
  const warnCount = listIntents.filter(i => i.validation?.status === 'warning').length

  const status = !modelLoaded
    ? <StatusLine tone="muted" icon={AlertTriangle}>모델을 먼저 엽니다</StatusLine>
    : errCount > 0
      ? <StatusLine tone="danger" icon={AlertTriangle} right={`의도 ${listIntents.length}건`}>오류 {errCount}건 — 적용 전에 확인</StatusLine>
      : warnCount > 0
        ? <StatusLine tone="warn" icon={AlertTriangle} right={`의도 ${listIntents.length}건`}>경고 {warnCount}건</StatusLine>
        : <StatusLine tone={listIntents.length ? 'ok' : 'muted'} icon={CheckCircle2} right={`의도 ${listIntents.length}건`}>
            {listIntents.length ? '편집 의도 누적 중' : '편집 의도 없음'}
          </StatusLine>

  const help = (
    <>
      <div>편집은 <strong>의도(intent)</strong>로 쌓입니다 — 원본 JSON 은 그대로 두고, 목록에서 언제든 되돌릴 수 있습니다.</div>
      <HelpList title="도구" items={[
        '그룹 관리 — 연결 그룹/부재 종류별 확인·단독 뷰·삭제',
        '자동 연결 — 분리된 소그룹을 주 구조에 RBE2 로 잇는 후보 제안',
        '가서포트 — 단면(L100×100×10t · 13t · L130×130×12t) 고르고 Shift+노드 2개로 설치',
        'Rigid 연결 — Shift+클릭으로 노드를 모아 RBE2 생성',
      ]} />
      <HelpList title="반영 시점" items={[
        '실제 모델 반영은 Hoist 탭의 "자세안정성 평가 실행" 때 한꺼번에 이뤄집니다.',
        'Ctrl+Z — 직전 액션 되돌리기(일괄 N건은 한 번에).',
      ]} />
    </>
  )

  return (
    <TabPanel id="edit" title="Edit" purpose="모델 조작·연결·삭제를 편집 의도로 누적합니다."
      icon={Pencil} status={status} help={help}>
      <Accordion title="편집 모드" tone="alt" defaultOpen>
        <EditModeToggle />
      </Accordion>

      {enabled ? (
        <EditPanel />
      ) : (
        <div style={{ padding: '14px 12px', fontSize: 11, color: '#7a8aaa', lineHeight: 1.6 }}>
          위 <strong style={{ color: '#FFE6A8' }}>편집 모드</strong> 토글이 켜지면
          그룹 삭제 · 요소 삭제 · 자동 연결 · Rigid 만들기 같은 편집 도구가 여기에 표시됩니다.
          <br />
          <span style={{ color: '#8aa0b8' }}>
            (권상 위치 지정·자세안정성 평가는 상단 <strong style={{ color: '#8fd0c0' }}>Hoist</strong> 탭에서 합니다.)
          </span>
        </div>
      )}
    </TabPanel>
  )
}
