import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'

const AUTO_DISMISS_MS = 4500

/**
 * 권상 UX 가이드 토스트 — useEditStore.hoistGuide 가 set 되면 화면 상단 중앙에 잠깐 보였다 사라진다.
 * id 가 변할 때마다 (같은 메시지 재발생 포함) 자동 dismiss 타이머가 리셋된다.
 *
 * kind:
 *   'error' — 저장/해석 실패 등 오류 (빨강 색)
 *   'noMode' — 권상 방식 미선택·자동해석 미실행 등 주의 안내 (호박 색)
 *   'success' — 자세안정성 평가 저장 등 완료 알림 (확인 색)
 *   기본 'info' — 일반 안내
 */
export default function HoistGuideToast() {
  const guide = useEditStore(s => s.hoistGuide)
  const dismiss = useEditStore(s => s.dismissHoistGuide)

  useEffect(() => {
    if (!guide) return
    const t = setTimeout(dismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [guide?.id, dismiss])  // id 가 바뀔 때마다 타이머 리셋

  if (!guide) return null

  const palette = paletteFor(guide.kind)
  const Icon = palette.icon

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={dismiss}
      style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex', alignItems: 'center', gap: 9,
        background: 'rgba(8, 6, 22, 0.96)',
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: '9px 14px 9px 12px',
        color: palette.text,
        boxShadow: '0 8px 26px rgba(0,0,0,0.6)',
        fontSize: 12, fontWeight: 700,
        cursor: 'pointer',
        userSelect: 'none',
        maxWidth: 480,
        animation: 'hoistGuideIn 180ms ease-out',
      }}
      title="클릭하여 닫기"
    >
      <Icon size={16} color={palette.icon_color} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{guide.message}</span>
      <X size={13} color={palette.text} style={{ opacity: 0.6 }} />
    </div>
  )
}

export function paletteFor(kind) {
  if (kind === 'error') {
    return {
      border: 'rgba(255, 85, 102, 0.6)',
      text:   '#FFC9D0',
      icon:   AlertTriangle,
      icon_color: '#FF5566',
    }
  }
  if (kind === 'noMode') {
    return {
      border: 'rgba(255, 184, 0, 0.55)',
      text:   '#FFE6A8',
      icon:   AlertTriangle,
      icon_color: '#FFB800',
    }
  }
  if (kind === 'success') {
    return {
      border: 'rgba(106, 224, 122, 0.55)',
      text:   '#C8F5CD',
      icon:   CheckCircle2,
      icon_color: '#6AE07A',
    }
  }
  return {
    border: 'rgba(0, 209, 255, 0.55)',
    text:   '#cad8e8',
    icon:   AlertTriangle,
    icon_color: '#00D1FF',
  }
}
