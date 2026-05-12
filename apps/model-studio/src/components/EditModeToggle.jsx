import { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

/**
 * Sidebar 안에 들어가는 편집 모드 ON/OFF 토글 버튼.
 * Sidebar.jsx 의 ToggleBtn 과 시각적으로 동일한 스타일 — 그러나
 * 자체 store(useEditStore) 만 참조하므로 Sidebar 코드를 어지럽히지 않게 분리.
 */
export default function EditModeToggle() {
  const enabled = useEditStore(s => s.enabled)
  const toggleEnabled = useEditStore(s => s.toggleEnabled)
  const intentCount = useEditStore(s => s.intents.length)
  const hasShownEntryToast = useEditStore(s => s.hasShownEntryToast)
  const markEntryToastShown = useEditStore(s => s.markEntryToastShown)
  const setInspectorTab = useViewerStore(s => s.setInspectorTab)
  const [showHint, setShowHint] = useState(false)
  const activeColor = '#FFB800'

  useEffect(() => {
    if (!enabled || hasShownEntryToast) return
    setShowHint(true)
    markEntryToastShown()
    const id = window.setTimeout(() => setShowHint(false), 6500)
    return () => window.clearTimeout(id)
  }, [enabled, hasShownEntryToast, markEntryToastShown])

  const handleClick = () => {
    toggleEnabled()
    if (!enabled) setInspectorTab('편집')
    if (enabled) setShowHint(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleClick}
        title={enabled ? '편집 모드 끄기' : '편집 모드 켜기 — 원본 데이터는 변경되지 않습니다'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: enabled ? `${activeColor}28` : '#0f0f22',
          color: enabled ? '#f0f0f0' : '#7070a0',
          border: `1px solid ${enabled ? activeColor + 'aa' : '#2e2e50'}`,
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 11, fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          width: '100%', textAlign: 'left',
          boxShadow: enabled ? `0 0 8px ${activeColor}30` : 'none',
        }}
      >
        <Pencil size={13} />
        <span style={{ flex: 1 }}>편집 모드</span>
        {intentCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800,
            background: activeColor + '40',
            color: activeColor + 'ee',
            padding: '1px 5px', borderRadius: 8,
          }}>
            {intentCount}
          </span>
        )}
        <span style={{ fontSize: 8, fontWeight: 800, color: enabled ? activeColor + 'ee' : '#505070' }}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>

      {showHint && (
        <div style={{
          position: 'fixed',
          left: 198,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 218,
          zIndex: 1002,
          background: '#101024',
          color: '#cad8e8',
          border: `1px solid ${activeColor}`,
          borderRadius: 7,
          padding: '10px 12px',
          boxShadow: `0 10px 28px rgba(0,0,0,0.55), 0 0 16px ${activeColor}35`,
          fontSize: 12,
          lineHeight: 1.45,
        }}>
          <div style={{
            position: 'absolute',
            left: -8,
            top: '50%',
            width: 14,
            height: 14,
            transform: 'translateY(-50%) rotate(45deg)',
            background: '#101024',
            borderLeft: `1px solid ${activeColor}`,
            borderBottom: `1px solid ${activeColor}`,
          }} />
          <button
            onClick={() => setShowHint(false)}
            title="닫기"
            style={{
              position: 'absolute', right: 5, top: 5,
              background: 'transparent', border: 'none',
              color: '#7a8aaa', cursor: 'pointer', padding: 2, lineHeight: 0,
            }}
          >
            <X size={12} />
          </button>
          <div style={{ color: activeColor, fontWeight: 800, marginBottom: 4 }}>
            편집 탭을 확인하세요
          </div>
          <div>
            오른쪽 패널의 <strong style={{ color: '#FFE6A8' }}>편집</strong> 탭에서 RBE 생성, 충돌 확인, 최종 모델 출력을 진행합니다.
          </div>
        </div>
      )}
    </div>
  )
}
