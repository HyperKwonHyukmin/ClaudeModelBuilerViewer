import { useState } from 'react'
import { Box, Pencil, Cable, Activity, CheckCircle2 } from 'lucide-react'
import { useViewerStore } from '../store/useViewerStore.js'

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
  { key: 'analyze',    label: 'Analyze',     Icon: Activity },
]

export default function TopMenuBar() {
  const activeMode = useViewerStore(s => s.activeMode)
  const setActiveMode = useViewerStore(s => s.setActiveMode)
  const [hoveredKey, setHoveredKey] = useState(null)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, height: 42, flexShrink: 0,
      padding: '0 12px', background: '#0b0b1e', borderBottom: '1px solid #1e1e38',
      userSelect: 'none',
    }}>
      {/* 브랜드 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Box size={15} color="#6ee7b7" />
        <span style={{ fontSize: 13, fontWeight: 900, color: '#e6f1ff', letterSpacing: 0.4 }}>ModuleUnit</span>
        <span style={{ fontSize: 11, color: '#6ee7b7', fontWeight: 700 }}>Studio</span>
      </div>

      {/* 브랜드 ↔ 탭 구분선 */}
      <div style={{ width: 1, height: 18, background: '#1e1e38', flexShrink: 0 }} />

      {/* 모드 탭 */}
      <nav style={{ display: 'flex', gap: 4 }}>
        {TABS.map(({ key, label, Icon }) => {
          const active = activeMode === key
          const hovered = !active && hoveredKey === key
          return (
            <button
              key={key}
              type="button"
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
              <Icon size={15} /> {label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
