import { useEffect } from 'react'
import { Info, Link, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useViewerStore } from '../../store/useViewerStore.js'
import { useStageStore } from '../../store/useStageStore.js'
import { palette, type } from '../../utils/theme.js'
import InspectorPanel from '../InspectorPanel.jsx'
import MassSummaryOverlay from '../MassSummaryOverlay.jsx'

/**
 * RightDock — 우측 고정 도크 (ModelBuilderStudio 에서 이식). 탭 2개: 표시(display) / 정보(info).
 *
 * 기본 접힘: 세로 탭 레일(36px)만 보인다. 탭 버튼을 누르면 280px 로 펼쳐지고, 같은 탭을 다시
 * 누르면 접힌다. 객체를 선택하면 "정보" 탭이 자동으로 펼쳐진다(자동으로 접히지는 않는다).
 *
 * 표시 = 전역 표시 설정(표시 방식·3D 단면·선택 대상) + 뷰포트 분할/카메라 동기화.
 * 정보 = 질량·COG 카드 + 선택 객체 정보.
 *
 * ⚠ 카메라 프리셋(평면/정면/…)·내비게이션 모드는 **뷰포트 좌상단 툴바에 그대로 둔다.**
 * 뷰포트마다 다를 수 있는 조작이라 3D 옆에 있어야 하고, 여기로 옮기면 분할 뷰에서
 * "어느 뷰에 적용되는가"가 흐려진다. 여기에는 모든 뷰에 함께 걸리는 전역 설정만 둔다.
 *
 * 레이어·색상 기준·노드 필터는 Model / Model Check 탭(좌측)에 있다.
 */
export const RIGHT_DOCK_WIDTH = 280
export const RIGHT_DOCK_RAIL = 36

const TABS = [
  { id: 'display', label: '표시', Icon: SlidersHorizontal },
  { id: 'info',    label: '정보', Icon: Info },
]

export default function RightDock() {
  const dock = useViewerStore(s => s.rightDock)
  const openTab = useViewerStore(s => s.openRightDockTab)
  const setDock = useViewerStore(s => s.setRightDock)
  const pickedEntity = useViewerStore(s => s.pickedEntity)
  const stages = useStageStore(s => s.stages)
  const p = palette()

  // 객체 선택 → 정보 탭 자동 펼침 (선택 해제 시 자동 접힘은 없음 — 사용자가 닫을 때까지 유지)
  useEffect(() => {
    if (pickedEntity) setDock({ open: true, tab: 'info' })
  }, [pickedEntity, setDock])

  const hasModel = stages.length > 0

  return (
    <aside aria-label="표시·정보 도크" style={{
      display: 'flex', flexShrink: 0, height: '100%', minHeight: 0,
      borderLeft: `1px solid ${p.border}`, background: p.panelBg,
    }}>
      {dock.open && (
        <div style={{
          width: RIGHT_DOCK_WIDTH, display: 'flex', flexDirection: 'column', minHeight: 0,
          borderRight: `1px solid ${p.border}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px 8px',
            borderBottom: `1px solid ${p.border}`, flexShrink: 0,
          }}>
            <h2 style={{ margin: 0, fontSize: type.label, fontWeight: 900, color: p.textPrimary, flex: 1 }}>
              {TABS.find(t => t.id === dock.tab)?.label ?? '표시'}
            </h2>
            <span style={{ fontSize: type.meta, color: p.textFaint }}>Ctrl+B</span>
            <button type="button" onClick={() => setDock({ open: false })} aria-label="도크 접기" title="접기"
              style={{ background: 'transparent', border: 'none', color: p.textMuted, cursor: 'pointer', padding: 2, lineHeight: 0 }}>
              <X size={13} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!hasModel ? (
              <div style={{ padding: '14px 12px', fontSize: type.body, color: p.textMuted, lineHeight: 1.6 }}>
                모델을 열면 {dock.tab === 'display' ? '표시 설정·뷰포트 도구' : '질량·무게중심과 선택 객체 정보'}가 여기에 나타납니다.
              </div>
            ) : dock.tab === 'display' ? <DisplayTab p={p} /> : <InfoTab />}
          </div>
        </div>
      )}

      {/* 세로 탭 레일 */}
      <div role="tablist" aria-orientation="vertical" style={{
        width: RIGHT_DOCK_RAIL, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, gap: 4,
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = dock.open && dock.tab === id
          return (
            <button key={id} type="button" role="tab" aria-selected={active} onClick={() => openTab(id)}
              title={`${label} 탭 ${active ? '접기' : '열기'} (Ctrl+B)`}
              style={{
                width: 30, padding: '8px 0 7px', borderRadius: 7, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: active ? p.accentBg : 'transparent', color: active ? p.accentLight : p.textMuted,
                border: `1px solid ${active ? p.accentBorder : 'transparent'}`,
              }}>
              <Icon size={15} aria-hidden="true" />
              <span style={{ fontSize: 11, fontWeight: 800, writingMode: 'vertical-rl', letterSpacing: 1 }}>{label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function DisplayTab({ p }) {
  const renderMode = useViewerStore(s => s.renderMode)
  const setRenderMode = useViewerStore(s => s.setRenderMode)
  const displayStyle = useViewerStore(s => s.displayStyle)
  const setDisplayStyle = useViewerStore(s => s.setDisplayStyle)
  const isolateSelection = useViewerStore(s => s.isolateSelection)
  const toggleIsolate = useViewerStore(s => s.toggleIsolateSelection)
  const viewports = useViewerStore(s => s.viewports)
  const addViewport = useViewerStore(s => s.addViewport)
  const cameraLinked = useViewerStore(s => s.cameraLinked)
  const toggleCameraLink = useViewerStore(s => s.toggleCameraLink)
  const canAddViewport = viewports.length < 4
  const section3d = renderMode === 'section3d'

  const selectStyle = {
    width: '100%', fontSize: type.body, padding: '4px 6px', borderRadius: 6,
    background: p.inputBg, color: p.inputText, border: `1px solid ${p.inputBorder}`, cursor: 'pointer',
  }
  const toggleStyle = (on, onColor, onBorder) => ({
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px', borderRadius: 6,
    cursor: 'pointer', fontSize: type.meta, fontWeight: 700,
    background: on ? `${onBorder}28` : p.panelBg3, color: on ? onColor : p.textMuted,
    border: `1px solid ${on ? onBorder : p.btnBorder}`,
  })

  return (
    <>
      <Group label="표시" p={p} hint="모든 뷰포트에 함께 적용됩니다. 카메라 프리셋·내비게이션은 뷰포트 좌상단 툴바에 있습니다.">
        <label style={{ fontSize: type.meta, color: p.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
          표시 방식
          <select value={displayStyle} onChange={e => setDisplayStyle(e.target.value)} style={selectStyle} aria-label="모델 표시 방식">
            <option value="shaded">음영</option>
            <option value="xray">반투명</option>
            <option value="wire">와이어프레임</option>
            <option value="nodeOnly">노드만</option>
          </select>
        </label>

        <button type="button" onClick={() => setRenderMode(section3d ? 'cylinder' : 'section3d')}
          aria-pressed={section3d}
          title={section3d ? '3D 단면 끄기 — BEAM 을 단순 실린더로 되돌립니다.' : '3D 단면 켜기 — BEAM 을 실제 단면 형상(Bar/Rod/Tube/L/H)으로 그립니다.'}
          style={toggleStyle(section3d, '#e0954a', '#b06828')}>
          3D 단면 {section3d ? 'ON' : 'OFF'}
        </button>

        <button type="button" onClick={toggleIsolate} aria-pressed={isolateSelection}
          title="선택한 것만 남기고 나머지를 숨깁니다."
          style={toggleStyle(isolateSelection, '#b4f2ff', '#3d7fa6')}>
          선택만 보기 {isolateSelection ? 'ON' : 'OFF'}
        </button>
      </Group>

      <Group label="뷰포트" p={p} hint="뷰를 나눠 같은 모델을 다른 각도·단계로 나란히 봅니다.">
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={addViewport} disabled={!canAddViewport}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6,
              cursor: canAddViewport ? 'pointer' : 'not-allowed', fontSize: type.meta, fontWeight: 700,
              background: p.panelBg3, color: canAddViewport ? p.textSecondary : p.textDisabled,
              border: `1px solid ${p.btnBorder}`,
            }}>
            <Plus size={13} /> 뷰 추가
            <span style={{ marginLeft: 'auto', fontSize: 10, color: p.textFaint }}>{viewports.length}/4</span>
          </button>
          <button type="button" onClick={toggleCameraLink} aria-pressed={cameraLinked}
            title="여러 뷰포트의 카메라를 함께 움직입니다"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
              fontSize: type.meta, fontWeight: 700,
              background: cameraLinked ? 'rgba(124,58,237,0.16)' : p.panelBg3,
              color: cameraLinked ? '#a78bfa' : p.textMuted,
              border: `1px solid ${cameraLinked ? '#7c3aed' : p.btnBorder}`,
            }}>
            <Link size={12} /> 동기화
          </button>
        </div>
      </Group>
    </>
  )
}

function InfoTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <MassSummaryOverlay embedded />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <InspectorPanel embedded />
      </div>
    </div>
  )
}

/** 도크 안 섹션 — 라벨 + 내용. */
export function Group({ label, hint, children, p }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '9px 10px', borderBottom: `1px solid ${p.border}` }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: p.labelColor }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: type.meta, color: p.textFaint, lineHeight: 1.45 }}>{hint}</span>}
    </div>
  )
}
