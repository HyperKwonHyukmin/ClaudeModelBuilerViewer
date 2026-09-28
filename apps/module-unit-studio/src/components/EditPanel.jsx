import { useState, useMemo, useEffect, useCallback } from 'react'
import { Trash2, X, Link2, Eraser } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { summarizeIntent, makeBatchId } from '../data/EditIntent.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'
import GroupManager from './GroupManager.jsx'
import SupportBeamSection from './SupportBeamSection.jsx'
import GroupAutoConnectSection from './GroupAutoConnectSection.jsx'
import { Accordion } from './shell/TabPanel.jsx'
import AddRigidDialog from './AddRigidDialog.jsx'
import ConflictSummary from './ConflictSummary.jsx'
import ModelTransformSection from './ModelTransformSection.jsx'
import BdfExportSection from './BdfExportSection.jsx'

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
  const undoLastIntent   = useEditStore(s => s.undoLastIntent)

  // rotateModel 은 provenance 전용이라 개별 삭제/Ctrl+Z 대상이 아니다(되돌리기는 Sidebar '회전 초기화').
  // 목록/카운트/전체초기화는 삭제 가능한 intent 만 대상으로 한다.
  const listIntents = intents.filter(i => i.kind !== 'rotateModel')

  const stages           = useStageStore(s => s.stages)
  const lastStage        = stages.length > 0 ? stages[stages.length - 1] : null
  const pickedEntity     = useViewerStore(s => s.pickedEntity)
  const viewports        = useViewerStore(s => s.viewports)
  const activeViewportId = useViewerStore(s => s.activeViewportId)
  const activeVp         = viewports.find(v => v.id === activeViewportId)
  const isLastStage      = activeVp != null && stages.length > 0 && activeVp.stageIndex === stages.length - 1
  const deleteMask = useMemo(() => computeDeleteMask(lastStage, intents), [lastStage, intents])

  const pendingNodeSelection  = useEditStore(s => s.pendingNodeSelection)
  const clearNodeSelection    = useEditStore(s => s.clearNodeSelection)
  const multiSelElements      = useEditStore(s => s.multiSelElements)
  const clearMultiSelElements = useEditStore(s => s.clearMultiSelElements)

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
      if (multiSelElements.length > 0) { e.preventDefault(); clearMultiSelElements(); return }
      if (pendingNodeSelection.length > 0) { e.preventDefault(); clearNodeSelection() }
      else if (selectedIntentId) { e.preventDefault(); selectIntent(null) }
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIntentId) {
        // 인텐트 목록에서 선택된 항목 제거
        e.preventDefault()
        removeIntent(selectedIntentId)
        return
      }
      if (pickedEntity?.type === 'element' && isLastStage) {
        // 3D 뷰에서 선택된 element 를 삭제 의도에 토글 (추가 / 취소)
        e.preventDefault()
        const existing = intents.find(i => i.kind === 'deleteElement' && i.params?.elementId === pickedEntity.id)
        if (existing) {
          removeIntent(existing.id)
        } else {
          addIntent({
            kind: 'deleteElement',
            params: {
              elementId: pickedEntity.id,
              category:  pickedEntity.category,
              startNode: pickedEntity.startNode,
              endNode:   pickedEntity.endNode,
            },
          })
        }
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      // 액션(batch) 단위 되돌리기 — 일괄 삭제 N건은 한 번에, rotateModel provenance 는 건너뜀.
      e.preventDefault()
      undoLastIntent()
    }
  }, [showAddRigid, multiSelElements.length, clearMultiSelElements, pendingNodeSelection.length, selectedIntentId, intents, clearNodeSelection, selectIntent, removeIntent, pickedEntity, isLastStage, addIntent, undoLastIntent])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleHotkey)
    return () => window.removeEventListener('keydown', handleHotkey)
  }, [enabled, handleHotkey])

  if (!enabled) return null

  const handleClear = () => {
    if (listIntents.length === 0) return
    if (!window.confirm(`${listIntents.length}개의 편집 intent 를 모두 삭제할까요? (회전은 '회전 초기화'로만 해제됩니다)`)) return
    clearIntents()
  }

  // 검증 상태별 카운트 (삭제 가능한 intent 기준)
  const errCount  = listIntents.filter(i => i.validation?.status === 'error').length
  const warnCount = listIntents.filter(i => i.validation?.status === 'warning').length

  return (
    <>
      {/* 그룹 관리 — Model Check 리본과 동일한 공용 컴포넌트(GroupManager).
          연결 그룹/부재 종류 기준 전환, 각 그룹 확인(표시)·단독 뷰·삭제 + "그룹 새로고침". */}
      <Accordion title="그룹 관리" tone="alt" defaultOpen>
        <GroupManager />
      </Accordion>

      {/* 자동 연결 — 분리된 소그룹을 주 구조에 잇는 RBE2 후보를 계산해 미리보기 후 적용한다.
          그룹을 '확인'하는 그룹 관리 바로 아래에 둔다(발견 → 연결이 한 자리에서 끝나도록). */}
      <Accordion title="자동 연결" tone="alt" defaultOpen={false}>
        <GroupAutoConnectSection />
      </Accordion>

      {/* 형상 좌표를 바꾸는 조작은 Edit 단계에서만 수행한다. */}
      <Accordion title="형상 변환" defaultOpen={false}>
        <ModelTransformSection />
      </Accordion>

      {/* 가서포트(보강) 추가 — Analyze 탭에 있던 것을 편집 도구인 여기로 옮겼다(사용자 요청).
          픽 모드 게이트도 ViewportContainer 에서 Edit 탭 기준으로 바뀌었다. */}
      <Accordion title="가서포트(보강)" tone="alt" defaultOpen={false}>
        <SupportBeamSection />
      </Accordion>

      {/* 중간 산출물이 필요한 사용자를 위한 명시적 내보내기(정식 저장은 Save 탭). */}
      <Accordion title="중간 산출물" defaultOpen={false}>
        <BdfExportSection compact />
      </Accordion>

      <Accordion title="편집 의도" defaultOpen
        badge={listIntents.length > 0
          ? `${listIntents.length}${errCount > 0 ? ` · 오류 ${errCount}` : warnCount > 0 ? ` · 경고 ${warnCount}` : ''}`
          : null}>
      {/* 선택된 부재 삭제 — 우측 인스펙터는 정보만 출력하므로, 부재 삭제 액션은 좌측 패널에서 수행한다.
          3D 뷰포트에서 부재를 클릭하면 여기에 삭제 버튼이 나타난다. */}
      {pickedEntity?.type === 'element' && isLastStage && (
        <PickedElementDeleteSection
          pickedEntity={pickedEntity}
          lastStage={lastStage}
          intents={intents}
          addIntent={addIntent}
          removeIntent={removeIntent}
        />
      )}

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
          <div style={{ fontSize: 10, color: '#7a8aaa', lineHeight: 1.4 }}>
            3D 뷰포트에서 <strong>Shift + 클릭</strong>으로 노드 추가/제거
          </div>
        </div>
      )}

      {/* Ctrl+Click 다중 선택 element → 일괄 삭제 */}
      {multiSelElements.length > 0 && (
        <BulkDeleteBox
          elements={multiSelElements}
          intents={intents}
          addIntent={addIntent}
          removeIntent={removeIntent}
          clearMultiSelElements={clearMultiSelElements}
        />
      )}

      {/* derived 영향 요약 — 삭제/추가 의도가 있을 때만 */}
      {(deleteMask.deletedNodeIds.size > 0 || deleteMask.deletedElementIds.size > 0 || deleteMask.addedRigids.length > 0) && (
        <div style={{
          fontSize: 10, color: '#cad8e8', lineHeight: 1.5,
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
        disabled={listIntents.length === 0}
        title="모든 편집 의도 제거"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '4px 9px',
          background: 'transparent',
          color: listIntents.length === 0 ? '#3a3a50' : '#9a9ad0',
          border: `1px solid ${listIntents.length === 0 ? '#1e1e30' : '#2e2e50'}`,
          borderRadius: 5, fontSize: 10, fontWeight: 600,
          cursor: listIntents.length === 0 ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-end',
        }}
        onMouseEnter={e => {
          if (listIntents.length > 0) {
            e.currentTarget.style.background = 'rgba(192,74,74,0.18)'
            e.currentTarget.style.color = '#e07070'
            e.currentTarget.style.borderColor = '#7a3a3a'
          }
        }}
        onMouseLeave={e => {
          if (listIntents.length > 0) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#9a9ad0'
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

      {/* intent 목록 (rotateModel provenance 제외 — 되돌리기는 '회전 초기화') */}
      {listIntents.length === 0 ? (
        <EmptyStateGuide hasSelection={pendingNodeSelection.length > 0} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 240, overflowY: 'auto' }}>
          {listIntents.map((intent, idx) => (
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
      </Accordion>
    </>
  )
}

// 그룹 관리 컴포넌트는 components/GroupManager.jsx 로 분리됨 (Edit·Model Check 공용).

// ── 선택된 부재 삭제 ─────────────────────────────────────────────────────
// 우측 인스펙터를 정보 전용으로 바꾸면서, 부재 삭제 액션은 좌측 Edit 패널에서 수행한다.
// 3D 뷰포트에서 부재를 클릭하면 노출된다.
function PickedElementDeleteSection({ pickedEntity, lastStage, intents, addIntent, removeIntent }) {
  const id = pickedEntity.id
  const existing = intents.find(i => i.kind === 'deleteElement' && i.params?.elementId === id)

  // 이미 그룹/부재종류 삭제에 포함된 요소인지
  const inDeletedSet = (() => {
    const g = (lastStage?.groups ?? []).find(gr => (gr.elementIds ?? []).includes(id))
    if (g && intents.some(i => i.kind === 'deleteGroup' && i.params?.groupId === g.id)) return true
    if (intents.some(i => i.kind === 'deleteCategory' && i.params?.category === pickedEntity.category)) return true
    return false
  })()

  const catLabel = pickedEntity.category === 'Structure' ? '구조' : pickedEntity.category === 'Pipe' ? '배관' : (pickedEntity.category ?? '')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      padding: '6px 8px',
      background: 'rgba(70,130,180,0.10)',
      border: '1px solid rgba(70,130,180,0.45)',
      borderRadius: 5,
    }}>
      <div style={{ fontSize: 10, color: '#9fc8e8', fontWeight: 700 }}>
        선택된 부재 #{id}{catLabel && <span style={{ color: '#7a8aaa', fontWeight: 600 }}> · {catLabel}</span>}
      </div>
      {inDeletedSet ? (
        <div style={{ fontSize: 10, color: '#9aaad0', lineHeight: 1.4 }}>
          이 부재가 속한 그룹/종류가 이미 삭제 예정입니다.
        </div>
      ) : existing ? (
        <button
          type="button"
          onClick={() => removeIntent(existing.id)}
          title="이 부재 삭제 의도 취소"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '5px 9px',
            background: 'rgba(255,184,0,0.18)', color: '#FFE6A8',
            border: '1px solid rgba(255,184,0,0.6)', borderRadius: 5,
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
          }}
        ><X size={11} /> 삭제 의도 취소</button>
      ) : (
        <button
          type="button"
          onClick={() => addIntent({
            kind: 'deleteElement',
            params: {
              elementId: id,
              category:  pickedEntity.category,
              startNode: pickedEntity.startNode,
              endNode:   pickedEntity.endNode,
            },
          })}
          title="이 부재를 삭제 의도에 추가"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '5px 9px',
            background: 'rgba(192,74,74,0.16)', color: '#e88a8a',
            border: '1px solid rgba(192,74,74,0.5)', borderRadius: 5,
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
          }}
        ><Trash2 size={11} /> 이 부재 삭제</button>
      )}
    </div>
  )
}

// ── Ctrl+Click 다중 선택 element 일괄 삭제 박스 ──────────────────────────

function BulkDeleteBox({ elements, intents, addIntent, removeIntent, clearMultiSelElements }) {
  const allAlreadyMarked = elements.every(el =>
    intents.some(i => i.kind === 'deleteElement' && i.params?.elementId === el.id)
  )

  const handleBulkAdd = () => {
    // 한 번의 '일괄 삭제' = 하나의 사용자 액션. 공통 batchId 를 부여해 Ctrl+Z 로 전체를 한 번에 되돌린다.
    const batchId = makeBatchId()
    for (const el of elements) {
      const exists = intents.find(i => i.kind === 'deleteElement' && i.params?.elementId === el.id)
      if (!exists) {
        addIntent({ kind: 'deleteElement', params: { elementId: el.id, category: el.category, startNode: el.startNode, endNode: el.endNode } }, { batchId })
      }
    }
    clearMultiSelElements()
  }

  const handleBulkUndo = () => {
    for (const el of elements) {
      const existing = intents.find(i => i.kind === 'deleteElement' && i.params?.elementId === el.id)
      if (existing) removeIntent(existing.id)
    }
    clearMultiSelElements()
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      background: 'rgba(255,107,53,0.10)',
      border: '1px solid rgba(255,107,53,0.45)',
      borderRadius: 5, padding: '6px 8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, color: '#FFB899', fontWeight: 700 }}>
          선택 요소 {elements.length}개
        </span>
        <button
          onClick={clearMultiSelElements}
          title="선택 초기화"
          style={{ background: 'transparent', border: 'none', color: '#7a8aaa', cursor: 'pointer', padding: 1, lineHeight: 0 }}>
          <X size={11} />
        </button>
      </div>
      <button
        onClick={allAlreadyMarked ? handleBulkUndo : handleBulkAdd}
        title={allAlreadyMarked ? '일괄 삭제 의도 취소' : `선택한 요소 ${elements.length}개를 삭제 의도에 추가`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '5px 9px',
          background: allAlreadyMarked ? 'rgba(122,138,170,0.18)' : 'rgba(255,107,53,0.22)',
          color:      allAlreadyMarked ? '#cad8e8'                : '#FFD4C0',
          border: `1px solid ${allAlreadyMarked ? '#3a3a5a' : 'rgba(255,107,53,0.6)'}`,
          borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer',
        }}>
        {allAlreadyMarked
          ? (<><X size={11} /> {elements.length}개 삭제 의도 취소</>)
          : (<><Trash2 size={11} /> {elements.length}개 요소 일괄 삭제</>)}
      </button>
      <div style={{ fontSize: 10, color: '#7a8aaa', lineHeight: 1.4 }}>
        3D 뷰포트에서 <strong>Ctrl + 클릭</strong>으로 요소 추가/제거
      </div>
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
        <span style={{ fontSize: 10, color: '#9a7abd' }} title="element / RBE / PointMass 어디에도 참조되지 않는 노드">
          참조 없음
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#b89cd0', lineHeight: 1.4, wordBreak: 'break-all' }}>
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
      <div style={{ fontStyle: 'italic', textAlign: 'center', color: '#8aa0b8' }}>
        편집 의도가 없습니다
      </div>
      <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <li>
          <span style={{ color: '#7ab2d4', fontWeight: 700 }}>그룹 관리</span>
          : 위 <strong>그룹 관리</strong>에서 연결 그룹/부재 종류를 전환하고 각 그룹을 확인·단독 뷰·삭제
        </li>
        <li>
          <span style={{ color: '#e88a8a', fontWeight: 700 }}>부재 삭제</span>
          : 3D 뷰포트에서 부재 클릭 → 위 <strong>선택된 부재</strong> 삭제 버튼 또는 <strong>Del</strong> 키
          <br />
          <span style={{ color: '#FF6B35', fontWeight: 600 }}>다중 삭제</span>
          : <strong>Ctrl + 클릭</strong>으로 부재 여러 개 선택 후 일괄 추가
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
          완성되면 상단 <strong>Hoist 탭 → 자세안정성 평가 실행</strong> 으로
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
        fontSize: 10, fontWeight: 800,
        color: '#8aa0b8',
        minWidth: 14, textAlign: 'right',
      }}>{index}.</span>

      <span style={{
        fontSize: 10, fontWeight: 800,
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
          color: '#9a9ad0', cursor: 'pointer',
          padding: 2, lineHeight: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#FF8866'}
        onMouseLeave={e => e.currentTarget.style.color = '#9a9ad0'}
      >
        <X size={12} />
      </button>
    </div>
  )
}
