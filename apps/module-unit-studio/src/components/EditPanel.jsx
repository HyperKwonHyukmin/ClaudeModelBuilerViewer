import { useState, useMemo, useEffect, useCallback } from 'react'
import { Trash2, X, Link2, Eraser } from 'lucide-react'
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
 * 편집 의도(deleteGroup / addRigid 등)는 여기서 누적·검증·전체 초기화한다.
 * 적용된 모델 JSON 출력은 권상 위치 패널의 "자세안정성 평가 실행" 단일 진입점이
 * 자동으로 처리한다 (intents 가 있으면 _edited.json 을 먼저 저장).
 */
export default function EditPanel() {
  const enabled          = useEditStore(s => s.enabled)
  const intents          = useEditStore(s => s.intents)
  const selectedIntentId = useEditStore(s => s.selectedIntentId)
  const selectIntent     = useEditStore(s => s.selectIntent)
  const removeIntent     = useEditStore(s => s.removeIntent)
  const clearIntents     = useEditStore(s => s.clearIntents)
  const addIntent        = useEditStore(s => s.addIntent)

  const stages = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null
  const deleteMask = useMemo(() => computeDeleteMask(lastStage, intents), [lastStage, intents])

  const pendingNodeSelection = useEditStore(s => s.pendingNodeSelection)
  const clearNodeSelection   = useEditStore(s => s.clearNodeSelection)

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

  const handleClear = () => {
    if (intents.length === 0) return
    if (!window.confirm(`${intents.length}개의 편집 intent 를 모두 삭제할까요?`)) return
    clearIntents()
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
      {(deleteMask.deletedNodeIds.size > 0 || deleteMask.deletedElementIds.size > 0 || deleteMask.addedRigids.length > 0) && (
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

      {/* 고립 노드 정리 — element 삭제로 인해 어떤 element/RBE/PointMass 도 참조하지 않게 된 노드 */}
      {deleteMask.orphanCandidateNodeIds.size > 0 && (
        <OrphanCleanupBox
          orphanIds={[...deleteMask.orphanCandidateNodeIds]}
          intents={intents}
          addIntent={addIntent}
          removeIntent={removeIntent}
        />
      )}

      {/* 안내 — 적용된 모델 출력은 권상 위치 패널의 "자세안정성 평가 실행" 이 자동 처리 */}
      {intents.length > 0 && (
        <div style={{
          fontSize: 10, color: '#7a8aaa', lineHeight: 1.5,
          padding: '5px 7px',
          background: 'rgba(255,184,0,0.06)',
          border: '1px solid rgba(255,184,0,0.22)',
          borderRadius: 5,
        }}>
          이 편집 의도는 <strong style={{ color: '#FFE6A8' }}>자세안정성 평가 실행</strong> 시
          자동으로 모델에 반영되어 <code style={{ color: '#FFE6A8' }}>_edited.json</code> 으로 저장됩니다.
        </div>
      )}

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

// ── 고립 노드 정리 박스 ───────────────────────────────────────────────────

/**
 * orphanCandidateNodeIds 가 있으면 사용자에게 정리할지 묻는 1클릭 배지.
 * 이미 동일한 노드 집합을 가리키는 deleteOrphanNodes intent 가 있으면 "정리됨" 상태로 표시.
 */
function OrphanCleanupBox({ orphanIds, intents, addIntent, removeIntent }) {
  // 기존 deleteOrphanNodes intent 중 현재 orphan 집합과 정확히 일치하는 것 (없으면 신규 추가 모드)
  const existing = intents.find(i => {
    if (i.kind !== 'deleteOrphanNodes') return false
    const ids = i.params?.nodeIds ?? []
    if (ids.length !== orphanIds.length) return false
    const set = new Set(ids)
    return orphanIds.every(n => set.has(n))
  })

  const handleAdd = () => {
    addIntent({ kind: 'deleteOrphanNodes', params: { nodeIds: [...orphanIds] } })
  }
  const handleUndo = () => {
    if (existing) removeIntent(existing.id)
  }

  const preview = orphanIds.slice(0, 6).join(', ')
  const tail = orphanIds.length > 6 ? ` 외 ${orphanIds.length - 6}` : ''

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      background: 'rgba(204, 68, 255, 0.10)',
      border: '1px solid rgba(204, 68, 255, 0.45)',
      borderRadius: 5, padding: '6px 8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, color: '#E5BFFF', fontWeight: 700 }}>
          고립 노드 {orphanIds.length}개
        </span>
        <span style={{ fontSize: 9, color: '#9a7abd' }} title="element / RBE / PointMass 어디에도 참조되지 않는 노드">
          참조 없음
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#b89cd0', lineHeight: 1.4, wordBreak: 'break-all' }}>
        N: {preview}{tail}
      </div>
      <button
        onClick={existing ? handleUndo : handleAdd}
        title={existing ? '고립 노드 삭제 의도 취소' : '이 노드들을 일괄 삭제 의도에 추가'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '5px 9px',
          background: existing ? 'rgba(122, 138, 170, 0.18)' : 'rgba(204, 68, 255, 0.22)',
          color:      existing ? '#cad8e8'                    : '#F0D6FF',
          border: `1px solid ${existing ? '#3a3a5a' : 'rgba(204, 68, 255, 0.6)'}`,
          borderRadius: 5, fontSize: 10, fontWeight: 700,
          cursor: 'pointer',
        }}>
        {existing
          ? (<><X size={11} /> 정리 의도 취소</>)
          : (<><Eraser size={11} /> 고립 노드 {orphanIds.length}개 정리</>)}
      </button>
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
          <span style={{ color: '#e88a8a', fontWeight: 700 }}>요소 삭제</span>
          : 3D 뷰포트에서 요소 클릭 → 우측 Inspector 의 <strong>이 요소 삭제</strong> 버튼
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
          완성되면 좌상단 <strong>권상 위치 설정 → 자세안정성 평가 실행</strong> 으로
          편집 적용 모델(<code>_edited.json</code>)과 권상 설정이 함께 저장됩니다.
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
