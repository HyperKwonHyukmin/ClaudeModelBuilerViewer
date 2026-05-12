import { useState, useMemo, useEffect, useCallback } from 'react'
import { Download, Trash2, X, Link2 } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { summarizeIntent } from '../data/EditIntent.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'
import AddRigidDialog from './AddRigidDialog.jsx'
import ConflictSummary from './ConflictSummary.jsx'

/**
 * EditPanel — 사이드바 안에 위치하는 EditIntent 목록 패널.
 * 편집 모드가 OFF 일 때는 아무것도 렌더하지 않는다.
 *
 * Phase 1 범위: 목록 · 개별 삭제 · 전체 초기화 · Export · Import.
 * Phase 2/3 에서 이 패널 위쪽에 "그룹 삭제 / Rigid 묶기" 같은 도구 버튼이 추가된다.
 */
export default function EditPanel() {
  const enabled          = useEditStore(s => s.enabled)
  const intents          = useEditStore(s => s.intents)
  const selectedIntentId = useEditStore(s => s.selectedIntentId)
  const selectIntent     = useEditStore(s => s.selectIntent)
  const removeIntent     = useEditStore(s => s.removeIntent)
  const clearIntents     = useEditStore(s => s.clearIntents)
  const exportToFile     = useEditStore(s => s.exportToFile)

  const stages = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null
  const deleteMask = useMemo(() => computeDeleteMask(lastStage, intents), [lastStage, intents])

  const pendingNodeSelection = useEditStore(s => s.pendingNodeSelection)
  const clearNodeSelection   = useEditStore(s => s.clearNodeSelection)

  const [status, setStatus] = useState(null) // { color, text }
  const [showAddRigid, setShowAddRigid] = useState(false)

  // 글로벌 단축키 — 편집 모드 ON 일 때만
  // Esc:        AddRigidDialog 가 열려있으면 그쪽에서 처리 → 그 외에는 다중 선택/intent 선택 비움
  // Delete:     selectedIntentId 가 있으면 그 intent 제거
  // Ctrl/Cmd+Z: 마지막 intent 제거 (간이 undo)
  const handleHotkey = useCallback((e) => {
    if (showAddRigid) return  // 다이얼로그가 자체 처리
    const tag = (e.target?.tagName ?? '').toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
    if (e.key === 'Escape') {
      if (pendingNodeSelection.length > 0) { e.preventDefault(); clearNodeSelection() }
      else if (selectedIntentId) { e.preventDefault(); selectIntent(null) }
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIntentId) {
      e.preventDefault()
      removeIntent(selectedIntentId)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && intents.length > 0) {
      e.preventDefault()
      removeIntent(intents[intents.length - 1].id)
    }
  }, [showAddRigid, pendingNodeSelection.length, selectedIntentId, intents, clearNodeSelection, selectIntent, removeIntent])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleHotkey)
    return () => window.removeEventListener('keydown', handleHotkey)
  }, [enabled, handleHotkey])

  if (!enabled) return null

  const handleExport = async () => {
    const r = await exportToFile()
    if (!r.ok) {
      setStatus({ color: '#FF8866', text: r.error ?? '내보내기 실패' })
      return
    }
    const where =
      r.location === 'folder'   ? '원본 폴더에 저장' :
      r.location === 'picker'   ? '선택한 위치에 저장' :
      r.location === 'download' ? '다운로드 폴더에 저장' : '저장'
    setStatus({ color: '#6ac58f', text: `${where}: ${r.fileName}` })
  }

  const handleClear = () => {
    if (intents.length === 0) return
    if (!window.confirm(`${intents.length}개의 편집 intent 를 모두 삭제할까요?`)) return
    clearIntents()
    setStatus(null)
  }

  // 검증 상태별 카운트
  const errCount  = intents.filter(i => i.validation?.status === 'error').length
  const warnCount = intents.filter(i => i.validation?.status === 'warning').length

  return (
    <div style={{
      padding: '11px 8px 10px',
      borderBottom: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10, color: '#FFB800', letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 800,
        marginBottom: 2, paddingLeft: 2,
      }}>
        <span>편집 의도</span>
        <span style={{ fontSize: 9, color: '#7070a0', letterSpacing: 0.5, textTransform: 'none' }}>
          {intents.length} 개
          {warnCount > 0 && <span style={{ color: '#FFAA55' }}> · 경고 {warnCount}</span>}
          {errCount  > 0 && <span style={{ color: '#FF8866' }}> · 오류 {errCount}</span>}
        </span>
      </div>

      {/* 다중 선택 → Rigid 만들기 (편집 모드에서 Shift+Click 으로 노드 누적) */}
      {pendingNodeSelection.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          background: 'rgba(255,184,0,0.10)',
          border: '1px solid rgba(255,184,0,0.45)',
          borderRadius: 5, padding: '6px 8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#FFE6A8', fontWeight: 700 }}>
              선택 노드 {pendingNodeSelection.length}개
            </span>
            <button
              onClick={clearNodeSelection}
              title="선택 초기화"
              style={{
                background: 'transparent', border: 'none',
                color: '#7a8aaa', cursor: 'pointer', padding: 1, lineHeight: 0,
              }}>
              <X size={11} />
            </button>
          </div>
          <button
            onClick={() => setShowAddRigid(true)}
            disabled={pendingNodeSelection.length < 2}
            title={pendingNodeSelection.length < 2 ? 'Rigid 는 최소 2개 노드 필요' : 'RBE 만들기'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '5px 9px',
              background: pendingNodeSelection.length < 2 ? '#0f0f1e' : 'rgba(255,184,0,0.22)',
              color:      pendingNodeSelection.length < 2 ? '#5a5a80' : '#FFE6A8',
              border: `1px solid ${pendingNodeSelection.length < 2 ? '#2a2a40' : 'rgba(255,184,0,0.6)'}`,
              borderRadius: 5, fontSize: 10, fontWeight: 700,
              cursor: pendingNodeSelection.length < 2 ? 'not-allowed' : 'pointer',
            }}>
            <Link2 size={11} /> Rigid 로 묶기
          </button>
          <div style={{ fontSize: 9, color: '#7a8aaa', lineHeight: 1.4 }}>
            3D 뷰포트에서 <strong>Shift + 클릭</strong>으로 노드 추가/제거
          </div>
        </div>
      )}

      {/* derived 영향 요약 — 삭제/추가 의도가 있을 때만 */}
      {(deleteMask.deletedNodeIds.size > 0 || deleteMask.addedRigids.length > 0) && (
        <div style={{
          fontSize: 9, color: '#cad8e8', lineHeight: 1.5,
          background: 'rgba(255, 184, 0, 0.08)',
          border: '1px solid rgba(255, 184, 0, 0.25)',
          borderRadius: 5, padding: '4px 7px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          <div>노드 <strong>{deleteMask.derivedNodeCount.toLocaleString()}</strong> · 요소 <strong>{deleteMask.derivedElementCount.toLocaleString()}</strong> · RBE <strong>{deleteMask.derivedRigidCount.toLocaleString()}</strong></div>
          {deleteMask.addedRigids.length > 0 && (
            <div style={{ color: '#FFE066' }}>
              ＋ 추가될 RBE {deleteMask.addedRigids.length}개 — 노란 점선
            </div>
          )}
          {deleteMask.brokenRbeCount > 0 && (
            <div style={{ color: '#FFAA55' }}>
              ⚠ 끊기는 RBE {deleteMask.brokenRbeCount}개 — 노란선 강조
            </div>
          )}
          {deleteMask.fullyRemovedRbeIds.size > 0 && (
            <div style={{ color: '#7a8aaa' }}>
              완전히 제거되는 RBE {deleteMask.fullyRemovedRbeIds.size}개
            </div>
          )}
        </div>
      )}

      {/* 메인 액션 — 최종 모델 출력 (강조) */}
      <button
        onClick={handleExport}
        disabled={intents.length === 0}
        title={intents.length === 0 ? '편집 의도를 먼저 추가하세요' : '편집 의도를 JSON 으로 저장 → 파이프라인이 BDF 에 적용'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '11px 12px',
          background: intents.length === 0
            ? 'linear-gradient(180deg, #1a1a2e 0%, #14142a 100%)'
            : 'linear-gradient(180deg, #FFB800 0%, #d99500 100%)',
          color: intents.length === 0 ? '#5a5a80' : '#1a1a0a',
          border: `1px solid ${intents.length === 0 ? '#2a2a40' : '#FFB800'}`,
          borderRadius: 7,
          fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
          cursor: intents.length === 0 ? 'not-allowed' : 'pointer',
          boxShadow: intents.length === 0 ? 'none' : '0 0 14px rgba(255, 184, 0, 0.42)',
          transition: 'all 0.15s ease',
        }}
      >
        <Download size={15} strokeWidth={2.5} />
        최종 모델 출력
      </button>

      {/* 보조 액션 — 전체 초기화 */}
      <button
        onClick={handleClear}
        disabled={intents.length === 0}
        title="모든 편집 의도 제거"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '4px 9px',
          background: 'transparent',
          color: intents.length === 0 ? '#3a3a50' : '#7070a0',
          border: `1px solid ${intents.length === 0 ? '#1e1e30' : '#2e2e50'}`,
          borderRadius: 5, fontSize: 10, fontWeight: 600,
          cursor: intents.length === 0 ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-end',
        }}
        onMouseEnter={e => {
          if (intents.length > 0) {
            e.currentTarget.style.background = 'rgba(192,74,74,0.18)'
            e.currentTarget.style.color = '#e07070'
            e.currentTarget.style.borderColor = '#7a3a3a'
          }
        }}
        onMouseLeave={e => {
          if (intents.length > 0) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#7070a0'
            e.currentTarget.style.borderColor = '#2e2e50'
          }
        }}
      >
        <Trash2 size={11} /> 전체 초기화
      </button>

      {status && (
        <div style={{ fontSize: 9, color: status.color, padding: '1px 2px', lineHeight: 1.4 }}>
          {status.text}
        </div>
      )}

      {/* 충돌·경고 요약 — 펼침 가능 */}
      <ConflictSummary intents={intents} deleteMask={deleteMask} stageData={lastStage} />

      {/* AddRigid 다이얼로그 */}
      {showAddRigid && <AddRigidDialog onClose={() => setShowAddRigid(false)} />}

      {/* intent 목록 */}
      {intents.length === 0 ? (
        <EmptyStateGuide hasSelection={pendingNodeSelection.length > 0} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 240, overflowY: 'auto' }}>
          {intents.map((intent, idx) => (
            <IntentRow
              key={intent.id}
              index={idx + 1}
              intent={intent}
              selected={intent.id === selectedIntentId}
              onSelect={() => selectIntent(intent.id === selectedIntentId ? null : intent.id)}
              onRemove={() => removeIntent(intent.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Empty-state 가이드 ────────────────────────────────────────────────────

function EmptyStateGuide({ hasSelection }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '6px 4px',
      fontSize: 10, color: '#7a8aaa', lineHeight: 1.55,
    }}>
      <div style={{ fontStyle: 'italic', textAlign: 'center', color: '#5a5a80' }}>
        편집 의도가 없습니다
      </div>
      <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <li>
          <span style={{ color: '#FF6B6B', fontWeight: 700 }}>그룹 삭제</span>
          : 모델 확인 패널에서 <strong>Group</strong> 모드 → 각 그룹의 휴지통 아이콘
        </li>
        <li>
          <span style={{ color: '#FFB800', fontWeight: 700 }}>Rigid 만들기</span>
          : 3D 뷰포트에서 <strong>Shift + 클릭</strong>으로 노드 2개 이상 선택
          {hasSelection && (
            <span style={{ color: '#FFE066', display: 'block', marginTop: 2 }}>
              ✓ 선택됨 — 위 "Rigid 로 묶기" 버튼을 누르세요
            </span>
          )}
        </li>
        <li>
          완성되면 <strong>최종 모델 출력</strong> → 파이프라인이 BDF 에 적용
        </li>
      </ol>
    </div>
  )
}

// ── Intent 한 줄 ───────────────────────────────────────────────────────────

function IntentRow({ index, intent, selected, onSelect, onRemove }) {
  const v = intent.validation ?? { status: 'ok', warnings: [], errors: [] }
  const badgeColor = v.status === 'error' ? '#FF8866' : v.status === 'warning' ? '#FFAA55' : '#6ac58f'
  const badgeLabel = v.status === 'error' ? 'ERR' : v.status === 'warning' ? 'WARN' : 'OK'
  const tip = [...v.errors, ...v.warnings].join('\n') || '검증 통과'

  return (
    <div
      onClick={onSelect}
      title="클릭으로 선택 — Delete 키로 제거"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: selected ? 'rgba(255, 184, 0, 0.18)' : '#0f0f22',
        border: `1px solid ${selected ? 'rgba(255, 184, 0, 0.6)' : '#2e2e50'}`,
        borderRadius: 5,
        padding: '4px 6px',
        cursor: 'pointer',
      }}
    >
      <span style={{
        fontSize: 9, fontWeight: 800,
        color: '#5a5a80',
        minWidth: 14, textAlign: 'right',
      }}>{index}.</span>

      <span style={{
        fontSize: 9, fontWeight: 800,
        background: badgeColor + '30',
        color: badgeColor,
        padding: '1px 4px', borderRadius: 3,
      }} title={tip}>{badgeLabel}</span>

      <span style={{
        flex: 1, fontSize: 10, color: '#cad8e8',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={summarizeIntent(intent)}>
        {summarizeIntent(intent)}
      </span>

      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        title="이 intent 제거"
        style={{
          background: 'transparent', border: 'none',
          color: '#7070a0', cursor: 'pointer',
          padding: 2, lineHeight: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#FF8866'}
        onMouseLeave={e => e.currentTarget.style.color = '#7070a0'}
      >
        <X size={12} />
      </button>
    </div>
  )
}

