import { useState } from 'react'
import { Box, Pencil, Cable, Activity, CheckCircle2 } from 'lucide-react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { getModelHealth } from '../data/modelHealth.js'

// 화면 최상단 가로 바 — 좌측 브랜드 + 4개 모드 탭(Model | Edit | Hoist | Analyze).
// 워크플로우 파이프라인(좌→우): 모델 로드 → FE 편집 → 권상(Hoist) 설정 → 해석.
// 참조 MooringFittingStudio 의 TopRibbon(.ribbon-tabbar / .ribbon-tab.active) 룩을
// 이 앱의 Tailwind4 + 인라인 다크 컬러 관례로 재현한다(emerald #6ee7b7 강조).
// 활성 모드는 useViewerStore.activeMode 로 읽고, 클릭 시 setActiveMode 로 전환한다(props 없음).
// 'Hoist' 본문 라벨은 한글 "권상" 과 코드 hoist* 식별자(hoistMode/HoistPositionPanel)와 1:1 대응.
const TABS = [
  { key: 'model',      label: 'Model',       Icon: Box },
  { key: 'modelCheck', label: 'Model Check', Icon: CheckCircle2 },
  { key: 'edit',       label: 'Edit',        Icon: Pencil },
  { key: 'hoist',      label: 'Hoist',       Icon: Cable },
  { key: 'analyze',    label: 'Analysis',    Icon: Activity },
]

export default function TopMenuBar() {
  const activeMode = useViewerStore(s => s.activeMode)
  const setActiveMode = useViewerStore(s => s.setActiveMode)
  const stages = useStageStore(s => s.stages)
  const intents = useEditStore(s => s.intents)
  const hoistMode = useEditStore(s => s.hoistMode)
  const hoistGroups = useEditStore(s => s.hoistGroups)
  const stability = useStabilityStore(s => s.overallStatus)
  const structural = useUnitStructuralStore(s => s.status)
  const [hoveredKey, setHoveredKey] = useState(null)
  const health = getModelHealth(stages.at(-1))
  const statuses = {
    model: stages.length ? 'done' : 'wait',
    modelCheck: health.status === 'error' ? 'error' : health.status === 'warn' ? 'warn' : health.status === 'pass' ? 'done' : 'wait',
    edit: intents.length ? 'done' : 'wait',
    hoist: stability === 'fail' ? 'error' : stability === 'warn' ? 'warn' : stability === 'pass' ? 'done' : hoistMode && Object.values(hoistGroups).some(g => g?.length) ? 'active' : 'wait',
    analyze: structural === 'Failed' ? 'error' : structural === 'Success' ? 'done' : structural === 'Running' || structural === 'Pending' ? 'active' : 'wait',
  }

  return (
    <div className="module-studio-topbar" style={{
      display: 'flex', alignItems: 'center', gap: 12, height: 42, flexShrink: 0,
      padding: '0 12px', background: '#0b0b1e', borderBottom: '1px solid #1e1e38',
      userSelect: 'none',
    }}>
      {/* 브랜드 */}
      <div className="module-studio-brand" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Box size={15} color="#6ee7b7" />
        <span style={{ fontSize: 13, fontWeight: 900, color: '#e6f1ff', letterSpacing: 0.4 }}>ModuleUnit</span>
        <span style={{ fontSize: 11, color: '#6ee7b7', fontWeight: 700 }}>Studio</span>
      </div>

      {/* 브랜드 ↔ 탭 구분선 */}
      <div style={{ width: 1, height: 18, background: '#1e1e38', flexShrink: 0 }} />

      {/* 모드 탭 */}
      <nav className="module-studio-tabs" role="tablist" aria-label="스튜디오 모드" style={{ display: 'flex', gap: 4, minWidth: 0 }}>
        {TABS.map(({ key, label, Icon }) => {
          const active = activeMode === key
          const hovered = !active && hoveredKey === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${label} 모드`}
              onClick={() => setActiveMode(key)}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(k => (k === key ? null : k))}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
                fontSize: 12, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap',
                background: active ? 'rgba(110,231,183,0.16)' : hovered ? 'rgba(110,231,183,0.06)' : 'transparent',
                color: active ? '#6ee7b7' : hovered ? '#bfe9d8' : '#8aa0b8',
                border: `1px solid ${active ? 'rgba(110,231,183,0.55)' : 'transparent'}`,
                boxShadow: active ? '0 0 10px rgba(110,231,183,0.20)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={15} /> <span className="module-studio-tab-label">{label}</span>
              <span aria-label={`${label} 상태 ${statuses[key]}`} style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: statuses[key] === 'done' ? '#37E08A' : statuses[key] === 'warn' ? '#FFC447' : statuses[key] === 'error' ? '#FF5566' : statuses[key] === 'active' ? '#00D1FF' : '#3c4960',
                boxShadow: statuses[key] === 'wait' ? 'none' : `0 0 5px ${statuses[key] === 'done' ? '#37E08A' : statuses[key] === 'warn' ? '#FFC447' : statuses[key] === 'error' ? '#FF5566' : '#00D1FF'}`,
              }} />
            </button>
          )
        })}
      </nav>
    </div>
  )
}
