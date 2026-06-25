import { useState, useEffect, useCallback } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore, computeMassFallback } from '../store/useEditStore.js'

/**
 * 모델 회전 다이얼로그 — 축(X/Y/Z) + 각도(deg) 입력 → CoG 피벗 기준 회전.
 *  props.onClose()        : 닫기
 *  props.onApplied(result): 회전 적용 후 결과 전달 ({axis, angleDeg, changedNodeCount, invalidatedStability})
 */
export default function RotateModelDialog({ onClose, onApplied }) {
  const [axis, setAxis] = useState('Z')
  const [angleText, setAngleText] = useState('90')

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
  }, [onClose])
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const angleDeg = Number(angleText)
  const angleValid = angleText.trim() !== '' && Number.isFinite(angleDeg)
  const hasError = !angleValid

  const handleApply = () => {
    if (hasError) return
    const stages = useStageStore.getState().stages
    if (!stages.length) { onClose?.(); return }
    const last = stages[stages.length - 1]
    const pivot = computeMassFallback(last)?.centerOfGravityMm ?? null
    const result = useStageStore.getState().rotateModel({ axis, angleDeg, pivot })
    useEditStore.getState().addIntent({ kind: 'rotateModel', params: { axis, angleDeg } })
    onApplied?.(result)
    onClose?.()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '90vw',
          background: '#0d0d22', border: '1px solid rgba(255, 184, 0, 0.45)',
          borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFB800', letterSpacing: 1.4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={13} /> 모델 회전
          </div>
          <button onClick={onClose} title="닫기"
            style={{ background: 'transparent', border: 'none', color: '#7070a0', cursor: 'pointer', padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        <Section title="회전 축">
          <div style={{ display: 'flex', gap: 6 }}>
            {['X', 'Y', 'Z'].map(a => (
              <label key={a} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '6px 8px', cursor: 'pointer',
                background: a === axis ? 'rgba(255,184,0,0.18)' : '#0f0f22',
                border: `1px solid ${a === axis ? 'rgba(255,184,0,0.6)' : '#2e2e50'}`,
                borderRadius: 5, fontSize: 12, color: '#cad8e8', fontWeight: 700,
              }}>
                <input type="radio" name="rot-axis" checked={a === axis} onChange={() => setAxis(a)} />
                {a}축
              </label>
            ))}
          </div>
        </Section>

        <Section title="회전 각도 (°)">
          <input type="number" value={angleText} onChange={e => setAngleText(e.target.value)} step="1" placeholder="90"
            style={inputStyle} />
          <div style={{ fontSize: 9, color: '#7a8aaa' }}>
            무게중심(CoG) 기준으로 회전합니다. 회전은 누적되며 되돌리려면 모델을 다시 로드하세요.
          </div>
        </Section>

        {hasError && (
          <div style={{
            border: '1px solid #FF8866', background: 'rgba(255,136,102,0.08)',
            borderRadius: 5, padding: '6px 9px', fontSize: 10, color: '#FFB3A8',
          }}>
            ⛔ 회전 각도를 숫자로 입력하세요.
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>취소</button>
          <button
            onClick={handleApply}
            disabled={hasError}
            style={{
              ...applyBtnStyle,
              background: hasError ? '#3a2a1a' : '#FFB80022',
              color:      hasError ? '#5a5a80' : '#FFE8A0',
              borderColor: hasError ? '#3a3a50' : 'rgba(255,184,0,0.6)',
              cursor: hasError ? 'not-allowed' : 'pointer',
            }}
          >
            <RotateCcw size={12} /> 회전 적용
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', background: '#0f0f22', color: '#e0e0e0',
  border: '1px solid #2e2e50', borderRadius: 4, padding: '5px 8px',
  fontSize: 11, fontFamily: 'monospace',
}
const cancelBtnStyle = {
  background: 'transparent', color: '#7070a0', border: '1px solid #2e2e50',
  borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}
const applyBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 5, border: '1px solid',
  borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700,
}

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 9, color: '#7ab2d4', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 800 }}>
        {title}
      </div>
      {children}
    </div>
  )
}
