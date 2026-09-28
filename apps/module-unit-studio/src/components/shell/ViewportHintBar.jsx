import { useViewerStore } from '../../store/useViewerStore.js'
import { useEditStore } from '../../store/useEditStore.js'
import { palette, type, z } from '../../utils/theme.js'
import { supportSectionLabel } from '../../data/supportSections.js'

/**
 * ViewportHintBar — 뷰포트 상단 중앙의 "지금 3D 에서 무엇을 클릭하면 되는가" 1줄
 * (ModelBuilderStudio 에서 이식).
 *
 * 도구가 켜져 있을 때만 나타난다 — 평상시엔 아무것도 렌더하지 않아 뷰를 가리지 않는다.
 *   · Edit — 가서포트 설치 픽 > 자동 연결 후보 검토 > Rigid 노드 누적 순으로 하나만 보여 준다
 *            (셋이 동시에 켜질 수 있어도 지금 손이 가 있는 도구 하나만 안내한다).
 *   · Hoist — 권상점 Shift+클릭 (그룹별 선택 개수)
 *
 * ⚠ Hoist 탭에는 이미 `HoistInstructionOverlay`(권상 방식·그룹 안내)가 좌상단에 있다.
 * 여기서는 "지금 몇 개 찍었나"만 짧게 겹쳐 두 안내가 같은 말을 반복하지 않게 한다.
 */
export default function ViewportHintBar() {
  const activeMode = useViewerStore(s => s.activeMode)
  const editEnabled = useEditStore(s => s.enabled)
  const pending = useEditStore(s => s.pendingNodeSelection.length)
  const proposals = useEditStore(s => s.groupConnectProposals.length)
  const supportPickActive = useEditStore(s => s.supportPickActive)
  const supportPicked = useEditStore(s => s.supportPickNodes.length)
  const supportSectionId = useEditStore(s => s.supportSectionId)
  const hoistMode = useEditStore(s => s.hoistMode)
  const hoistGroups = useEditStore(s => s.hoistGroups)
  const activeHoistGroupId = useEditStore(s => s.activeHoistGroupId)
  const p = palette()

  let title = null, body = null, tail = null, accent = 'rgba(0,209,255,0.45)', titleColor = '#90E8FF'

  if (activeMode === 'edit' && supportPickActive) {
    title = '가서포트 설치'
    body = <>선택 노드 <strong style={{ color: '#5eead4' }}>{supportPicked}</strong>/2</>
    tail = `Shift+클릭으로 두 노드를 고르면 ${supportSectionLabel({ sectionId: supportSectionId })} 보강재가 생깁니다`
    accent = 'rgba(45,212,191,0.5)'; titleColor = '#BFE9D8'
  } else if (activeMode === 'edit' && proposals > 0) {
    title = '자동 연결 후보'
    body = <>{proposals}건 미리보기</>
    tail = '좌측 표에서 hover·체크 → "적용"'
    accent = 'rgba(182,255,61,0.5)'; titleColor = '#DFFFB0'
  } else if (activeMode === 'edit' && editEnabled) {
    // 선택 0개여도 상시 노출 — "같은 노드를 다시 Shift+클릭 = 해제" 는 토글이라
    // 화면에 단서가 없으면 잘못 고른 노드를 뺄 방법을 모른다.
    title = 'Rigid 연결'
    body = <>선택 노드 <strong style={{ color: '#FFB800' }}>{pending}</strong>개</>
    tail = pending > 0
      ? '같은 노드 다시 Shift+클릭 = 해제 · 좌측 "Rigid 로 묶기" · Esc 전체 해제'
      : 'Shift+클릭으로 연결할 노드 선택'
    accent = 'rgba(255,184,0,0.5)'; titleColor = '#FFE6A8'
  } else if (activeMode === 'hoist' && hoistMode) {
    const picked = (hoistGroups?.[activeHoistGroupId] ?? []).length
    title = `권상점 선택 · G${activeHoistGroupId}`
    body = <>이 그룹 <strong style={{ color: '#FFB800' }}>{picked}</strong>개</>
    tail = 'Shift+클릭으로 노드 지정 · 같은 노드 다시 클릭 = 해제'
    accent = 'rgba(110,231,183,0.5)'; titleColor = '#BFE9D8'
  }

  if (!title) return null

  return (
    <div data-testid="viewport-hint" style={{
      position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: z.hint,
      background: p.overlayBg, border: `1px solid ${accent}`, borderRadius: 8,
      padding: '7px 13px', color: '#E8FBFF', boxShadow: '0 8px 26px rgba(0,0,0,0.45)',
      pointerEvents: 'none', userSelect: 'none', fontSize: type.label, fontWeight: 800, whiteSpace: 'nowrap',
    }}>
      <span style={{ color: titleColor }}>{title}</span>
      <span style={{ color: '#7f8fa6', margin: '0 8px' }}>·</span>
      {body}
      <span style={{ color: '#FFDD66', marginLeft: 10, fontWeight: 700 }}>{tail}</span>
    </div>
  )
}
