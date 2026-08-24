import { useState } from 'react'
import { Keyboard, X } from 'lucide-react'

/**
 * ViewportShortcutsHelp — 뷰포트 우하단에 고정된 "⌨ 단축키" 버튼 + 팝오버(클릭 토글).
 *
 * ThreeViewport 의 키보드/마우스 단축키(F/A/S/D, 노드 더블클릭 pivot, Shift·Ctrl+클릭, Esc/Delete/Ctrl+Z)를
 * 코드 주석에만 두지 않고 사용자에게 노출한다. 순수 표시용 — 전역 스토어/뷰포트 로직에 영향을 주지 않는다.
 */
const SHORTCUTS = [
  { keys: ['F'], desc: '등각 전체 보기 (비스듬히)' },
  { keys: ['A'], desc: '평면도 (↑X ←Y)' },
  { keys: ['S'], desc: '정면도 (X·Z 종단면)' },
  { keys: ['D'], desc: '측면도 (Y·Z 횡단면)' },
  { keys: ['노드 더블클릭'], desc: '회전 중심(pivot) 지정' },
  { keys: ['빈 공간 더블클릭'], desc: '회전 중심 리셋(무게중심)' },
  { keys: ['Shift', '클릭'], desc: '노드 다중 선택 (Rigid·권상·가서포트)' },
  { keys: ['Ctrl', '클릭'], desc: '요소 다중 선택 (일괄 삭제)' },
  { keys: ['Esc'], desc: '선택 해제' },
  { keys: ['Delete'], desc: '선택 요소/편집 삭제' },
  { keys: ['Ctrl', 'Z'], desc: '마지막 편집 되돌리기 (일괄=한 번에)' },
]

export default function ViewportShortcutsHelp() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {open && (
        <div style={{
          width: 262, maxWidth: 'calc(100vw - 24px)',
          background: 'rgba(11,11,30,0.97)', border: '1px solid #25254a',
          borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', borderBottom: '1px solid #1e1e38',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: '#90E8FF' }}>
              <Keyboard size={13} /> 뷰포트 단축키
            </span>
            <button onClick={() => setOpen(false)} aria-label="닫기"
              style={{ background: 'transparent', border: 'none', color: '#7a8aaa', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
              <X size={13} />
            </button>
          </div>
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SHORTCUTS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  {s.keys.map((k, j) => (
                    <kbd key={j} style={{
                      fontSize: 9.5, fontWeight: 700, color: '#cfe6ff',
                      background: '#181834', border: '1px solid #2e2e50', borderRadius: 4,
                      padding: '1px 5px', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}>{k}</kbd>
                  ))}
                </span>
                <span style={{ fontSize: 10, color: '#9fb4cc', textAlign: 'right', lineHeight: 1.35 }}>{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        title="뷰포트 단축키 보기"
        aria-label="뷰포트 단축키"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
          background: open ? 'rgba(0,209,255,0.14)' : 'rgba(11,11,30,0.9)',
          border: `1px solid ${open ? '#00D1FF66' : '#2a2a4a'}`,
          color: open ? '#90E8FF' : '#9fb4cc',
          fontSize: 10.5, fontWeight: 700,
        }}
      >
        <Keyboard size={13} /> 단축키
      </button>
    </div>
  )
}
