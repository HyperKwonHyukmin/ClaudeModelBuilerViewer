import { useEffect, useState, useMemo, useCallback } from 'react'
import { X, Check } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { createIntent, validateIntent } from '../data/EditIntent.js'

/**
 * Phase 3 — Rigid 연결 다이얼로그.
 *
 *   props.onClose() 가 호출되면 부모(EditPanel)가 다이얼로그를 닫는다.
 *
 * 다이얼로그가 열리면 useEditStore.pendingNodeSelection 의 노드들이
 * 후보가 되며, 사용자는 그 중 1개를 독립 노드로 지정한 뒤 remark/cm 를
 * 입력해 새 RBE intent 를 추가한다.
 */
export default function AddRigidDialog({ onClose }) {
  const pendingNodeSelection = useEditStore(s => s.pendingNodeSelection)
  const intents              = useEditStore(s => s.intents)
  const addIntent            = useEditStore(s => s.addIntent)
  const clearNodeSelection   = useEditStore(s => s.clearNodeSelection)

  const stages = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null

  const [indep, setIndep]   = useState(pendingNodeSelection[0] ?? null)
  const [remark, setRemark] = useState('UBOLT')
  const [cm, setCm]         = useState('123456')
  const effectiveIndep = pendingNodeSelection.includes(indep) ? indep : (pendingNodeSelection[0] ?? null)

  // 선택 노드가 모두 빠지면 다이얼로그를 닫는다.
  // 독립 노드는 렌더 중 effectiveIndep 로 보정해 effect 안 setState 를 피한다.
  useEffect(() => {
    if (pendingNodeSelection.length === 0) {
      onClose?.()
    }
  }, [pendingNodeSelection.length, onClose])

  // Esc 로 닫기
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
  }, [onClose])
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // 즉시 검증 — error 면 추가 차단, warning 은 사용자에게 보여주고 진행 허용
  const validation = useMemo(() => {
    const dependentNodes = pendingNodeSelection.filter(id => id !== effectiveIndep)
    const draft = createIntent('addRigid', { independentNode: effectiveIndep, dependentNodes, remark: remark || null, cm: cm || null })
    return validateIntent(draft, lastStage, intents)
  }, [pendingNodeSelection, effectiveIndep, remark, cm, lastStage, intents])

  const handleAdd = () => {
    const dependentNodes = pendingNodeSelection.filter(id => id !== effectiveIndep)
    const r = addIntent({
      kind: 'addRigid',
      params: { independentNode: effectiveIndep, dependentNodes, remark: remark || null, cm: cm || null },
    })
    if (r.ok) {
      clearNodeSelection()
      onClose?.()
    }
    // r.ok=false (error) 면 다이얼로그를 그대로 두고 사용자에게 errors[] 노출 (validation 이 보여줌)
  }

  if (pendingNodeSelection.length === 0) return null

  const hasError = validation.status === 'error'
  const dependentNodes = pendingNodeSelection.filter(id => id !== effectiveIndep)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380, maxWidth: '90vw', maxHeight: '88vh', overflowY: 'auto',
          background: '#0d0d22',
          border: '1px solid rgba(255, 184, 0, 0.45)',
          borderRadius: 8,
          padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFB800', letterSpacing: 1.4, textTransform: 'uppercase' }}>
            새 RBE 만들기
          </div>
          <button onClick={onClose} title="닫기"
            style={{ background: 'transparent', border: 'none', color: '#9a9ad0', cursor: 'pointer', padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        {/* 선택된 노드 목록 + 독립 라디오 */}
        <Section title={`선택 노드 (${pendingNodeSelection.length}개) — 독립 노드 선택`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
            {pendingNodeSelection.map(id => (
              <label key={id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px',
                background: id === effectiveIndep ? 'rgba(255,184,0,0.18)' : '#0f0f22',
                border: `1px solid ${id === effectiveIndep ? 'rgba(255,184,0,0.6)' : '#2e2e50'}`,
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: 11, color: '#cad8e8',
              }}>
                <input type="radio" name="indep" checked={id === effectiveIndep} onChange={() => setIndep(id)} />
                <span style={{ flex: 1 }}>Node #{id}</span>
                <span style={{ fontSize: 10, color: id === effectiveIndep ? '#FFB800' : '#8aa0b8', fontWeight: 700 }}>
                  {id === effectiveIndep ? '독립' : '종속'}
                </span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#7a8aaa' }}>
            종속 노드 {dependentNodes.length}개: {dependentNodes.slice(0, 6).join(', ')}{dependentNodes.length > 6 ? ` 외 ${dependentNodes.length - 6}` : ''}
          </div>
        </Section>

        {/* remark / cm */}
        <Section title="속성">
          <Field label="Remark">
            <input type="text" value={remark} onChange={e => setRemark(e.target.value)} placeholder="UBOLT"
              style={inputStyle} />
          </Field>
          <Field label="DOF (cm)">
            <input type="text" value={cm} onChange={e => setCm(e.target.value)} placeholder="123456"
              maxLength={6} style={inputStyle} />
            <div style={{ fontSize: 10, color: '#7a8aaa', marginTop: 2 }}>
              1~6자리, 각 자리 1~6 (예: 123, 23, 123456)
            </div>
          </Field>
        </Section>

        {/* 검증 결과 */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div style={{
            border: `1px solid ${hasError ? '#FF8866' : '#FFAA55'}`,
            background: hasError ? 'rgba(255,136,102,0.08)' : 'rgba(255,170,85,0.08)',
            borderRadius: 5, padding: '6px 9px',
            fontSize: 10, color: hasError ? '#FFB3A8' : '#FFD9A8', lineHeight: 1.55,
          }}>
            {validation.errors.map((e, i) => <div key={'e'+i}>⛔ {e}</div>)}
            {validation.warnings.map((w, i) => <div key={'w'+i}>⚠ {w}</div>)}
          </div>
        )}

        {/* 액션 */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>취소</button>
          <button
            onClick={handleAdd}
            disabled={hasError}
            style={{
              ...addBtnStyle,
              background: hasError ? '#3a2a1a' : '#FFB80022',
              color:      hasError ? '#5a5a80' : '#FFE8A0',
              borderColor: hasError ? '#3a3a50' : 'rgba(255,184,0,0.6)',
              cursor: hasError ? 'not-allowed' : 'pointer',
            }}
          >
            <Check size={12} /> RBE 추가
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 스타일 / 부속 ──────────────────────────────────────────────────────

const inputStyle = {
  width: '100%',
  background: '#0f0f22',
  color: '#e0e0e0',
  border: '1px solid #2e2e50',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 11, fontFamily: 'monospace',
}

const cancelBtnStyle = {
  background: 'transparent', color: '#9a9ad0',
  border: '1px solid #2e2e50', borderRadius: 5,
  padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

const addBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 5,
  border: '1px solid', borderRadius: 5,
  padding: '5px 12px', fontSize: 11, fontWeight: 700,
}

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, color: '#7ab2d4', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 800 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: '#7a8aaa' }}>{label}</span>
      {children}
    </div>
  )
}
