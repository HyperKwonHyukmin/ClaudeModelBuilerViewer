import { Pencil } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import EditModeToggle from './EditModeToggle.jsx'
import EditPanel from './EditPanel.jsx'

/**
 * EditModePanel — 상단 메뉴바 activeMode === 'edit' 일 때 좌측에 표시되는 패널.
 *
 * 기존 컴포넌트를 '마운트 위치'만 좌측으로 옮겨 재사용한다(내부 store/handler/단축키 로직 변경 0):
 *   · EditModeToggle — 편집 모드 ON/OFF 가시 토글 (useEditStore 자체 구독)
 *   · EditPanel      — 편집 intent 목록·검증·다중 선택·고립 노드 정리 (useEditStore 구독, enabled=false 면 null 반환)
 *
 * 권상 위치 설정(HoistPositionPanel)은 상단 Hoist 탭의 좌측 도크로 분리되었다(LeftDock → HoistPanelDock).
 * 권상 픽킹(Shift+Node)은 activeMode === 'hoist' 에서만 활성화된다(ViewportContainer 의 hoistActive 게이트).
 * App.jsx 의 동기화 useEffect 가 activeMode === 'edit' 진입 시 editStore.enabled 를 true 로 만들어
 * EditPanel(과 그에 딸린 단축키 리스너)이 마운트된다.
 *
 * 외곽 컨테이너는 Sidebar(ModelPanel)와 동일한 다크 룩 + 폭 190 고정.
 * (Edit/Analyze 패널 폭을 Sidebar DEFAULT_WIDTH 와 동일하게 고정해야
 *  UnitStructuralResultDock 의 layoutBounds.sidebarWidth 계산과 어긋나지 않는다.)
 */
export default function EditModePanel() {
  const enabled = useEditStore(s => s.enabled)

  return (
    <div
      style={{
        width: 228,
        flexShrink: 0,
        position: 'relative',
        background: '#0b0b1e',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* ── 헤더 ─────────────────────────────────────── */}
      <div
        style={{
          padding: '11px 8px 10px',
          borderBottom: '1px solid #1e1e38',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: '#FFB800',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            fontWeight: 800,
            paddingLeft: 2,
            marginBottom: 3,
          }}
        >
          <Pencil size={12} />
          <span>편집</span>
        </div>

        {/* 편집 모드 ON/OFF 토글 — 기존 컴포넌트 그대로 재사용 */}
        <EditModeToggle />
      </div>

      {/* ── 편집 의도 목록 — enabled=false 면 EditPanel 이 null 반환 ─── */}
      {enabled ? (
        <EditPanel />
      ) : (
        <div
          style={{
            padding: '14px 12px',
            fontSize: 11,
            color: '#7a8aaa',
            lineHeight: 1.6,
          }}
        >
          위 <strong style={{ color: '#FFE6A8' }}>편집 모드</strong> 토글이 켜지면
          그룹 삭제 · 요소 삭제 · Rigid 만들기 같은 편집 도구가 여기에 표시됩니다.
          <br />
          <span style={{ color: '#5a5a80' }}>
            (권상 위치 지정·자세안정성 평가는 상단 <strong style={{ color: '#8fd0c0' }}>Hoist</strong> 탭에서 합니다.)
          </span>
        </div>
      )}
    </div>
  )
}
