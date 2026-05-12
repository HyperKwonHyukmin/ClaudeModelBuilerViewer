import { useRef, useState, useMemo } from 'react'
import { SlidersHorizontal, Trash2, RotateCcw } from 'lucide-react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { getGroupDisplayCount, groupColorCss } from '../utils/groupPalette.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'

const FREE_NODE_DEFS = [
  { key: 'normal', label: 'Shared',  color: '#FF4455' },
  { key: 'free',   label: 'Free',    color: '#FFDD00' },
  { key: 'orphan', label: 'Orphan',  color: '#CC44FF' },
]

const MODE_DEFS = [
  { key: 'category', icon: '▬', label: 'Default Mode', desc: '구조 / 배관 구분색' },
  { key: 'freeNode', icon: '○', label: 'Node Check', desc: '노드 연결 상태' },
  { key: 'group',    icon: '⊞', label: 'Group',      desc: '연결 그룹' },
]

export default function LayerPanel({ viewportId, stageData, isEditTargetStage = true }) {
  const [collapsed, setCollapsed] = useState(false)
  const [hint, setHint] = useState(null)
  const hintTimerRef = useRef(null)
  const {
    viewports,
    setViewportColorMode,
    toggleViewportFreeNodeFilter,
    toggleViewportGroupFilter,
    setAllViewportGroupFilters,
    layers,
    toggleLayer,
  } = useViewerStore()

  const editEnabled = useEditStore(s => s.enabled)
  const editIntents = useEditStore(s => s.intents)
  const addEditIntent    = useEditStore(s => s.addIntent)
  const removeEditIntent = useEditStore(s => s.removeIntent)

  // derived 카운트 — intents 가 그룹/노드/요소를 얼마나 줄이는지.
  // intents 가 1개 이상이면 편집 모드 토글과 무관하게 미리보기를 보여준다 (편집 모드를 꺼도 적용 유지).
  // 마지막 단계 viewport 에서만 의미있음 (intent 가 그 단계 기준이라).
  const deleteMask = useMemo(
    () => (isEditTargetStage && editIntents.length > 0) ? computeDeleteMask(stageData, editIntents) : null,
    [isEditTargetStage, stageData, editIntents],
  )

  // editAllowed 는 새 intent 를 추가/삭제하는 액션 권한이므로 편집 모드일 때만 true.
  // 미리보기 표시(deleteMask)와는 별도 개념.
  const editAllowed = editEnabled && isEditTargetStage

  const vp = viewports.find(v => v.id === viewportId)
  if (!vp) return null

  const { colorMode, freeNodeFilters, groupFilters } = vp

  const showHint = (text) => {
    setHint(text)
    window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setHint(null), 2600)
  }

  // 마지막 stage 기준 그룹 분류로 색·번호 통일 (없으면 stage 자기 그룹 사용)
  const groups = stageData?.finalGroups ?? stageData?.groups ?? []
  const { maxIndividual, hasOthers, displayCount } = getGroupDisplayCount(groups)
  const totalOthers = hasOthers ? groups.length - maxIndividual : 0
  const othersElemCount = totalOthers > 0
    ? groups.slice(maxIndividual).reduce((s, g) => s + g.elementIds.length, 0)
    : 0

  if (collapsed) {
    return (
      <button
        onClick={() => {
          setCollapsed(false)
          showHint('모델 확인 패널에서 색상 기준과 필터를 바꿀 수 있습니다.')
        }}
        title="모델 확인 패널 열기"
        style={{
          position: 'absolute', bottom: 12, left: 12, zIndex: 20,
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8, 6, 22, 0.92)', color: '#7ab2d4',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}
      >
        <SlidersHorizontal size={16} />
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 20,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(8, 6, 22, 0.92)',
      backdropFilter: 'blur(12px)',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.1)',
      userSelect: 'none',
      minWidth: 168,
      overflow: 'visible',
      boxShadow: '0 6px 28px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 8px 7px 12px',
        fontSize: 11, color: '#7ab2d4', letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 800,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ flex: 1 }}>모델 확인</span>
        <button
          onClick={() => {
            setCollapsed(true)
            showHint('모델 확인 패널을 접었습니다. 아이콘을 누르면 다시 열립니다.')
          }}
          title="패널 접기"
          style={{ background: 'transparent', border: 'none', color: '#516b84', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {hint && <PanelHint text={hint} onClose={() => setHint(null)} />}

      {/* Mode selector */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '5px 6px', gap: 2 }}>
        {MODE_DEFS.map(({ key, icon, label, desc }) => {
          const active = colorMode === key
          return (
            <button
              key={key}
              onClick={() => {
                setViewportColorMode(viewportId, key)
                showHint(modeHint(key))
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px',
                background: active ? 'rgba(70,130,180,0.2)' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${active ? '#4682B4' : 'transparent'}`,
                borderRadius: '0 6px 6px 0',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s ease', width: '100%',
              }}
            >
              <span style={{ fontSize: 13, color: active ? '#5BA8E5' : '#3a3a6a', width: 16, textAlign: 'center' }}>{icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#e8e8f0' : '#555' }}>{label}</span>
                <span style={{ fontSize: 10, color: active ? '#7a9ab8' : '#3a3a5a' }}>{desc}</span>
              </div>
              {active && <span style={{ marginLeft: 'auto', color: '#4682B4', fontSize: 10 }}>▶</span>}
            </button>
          )
        })}
      </div>

      {/* Free Node 서브 컨트롤 */}
      {colorMode === 'freeNode' && (
        <SubSection title="Node 타입 필터">
          {FREE_NODE_DEFS.map(({ key, label, color }) => {
            // Orphan 필터 행에는 일괄 삭제(또는 취소) 버튼을 함께 노출한다.
            // - 미리보기 가시성(toggle)과 삭제 의도(addIntent/removeIntent)는 독립 동작.
            // - 편집 모드(editAllowed) 가 아니라도 노출하지만 실제 mutate 는 차단한다.
            //   (LayerPanel 의 다른 그룹 삭제 버튼은 편집 모드 전용이지만, Orphan 정리는
            //    element 참조가 없는 안전 작업이라 편집 모드 의존이 과하다고 판단.)
            if (key === 'orphan') {
              const orphanIds = stageData?.getOrphanNodeIds?.() ?? []
              return (
                <OrphanFilterRow
                  key={key}
                  on={freeNodeFilters[key] ?? true}
                  color={color}
                  label={label}
                  orphanIds={orphanIds}
                  onToggleFilter={() => {
                    toggleViewportFreeNodeFilter(viewportId, key)
                    showHint(freeNodeHint(key))
                  }}
                  deleteIntent={findOrphanIntent(editIntents)}
                  editAllowed={editAllowed}
                  onAddDelete={() => {
                    if (orphanIds.length === 0) {
                      showHint('삭제할 Orphan 노드가 없습니다.')
                      return
                    }
                    const preview = orphanIds.slice(0, 6).join(', ')
                    const tail = orphanIds.length > 6 ? ` …외 ${orphanIds.length - 6}` : ''
                    const ok = window.confirm(
                      `Orphan 노드 ${orphanIds.length}개를 삭제 의도에 추가합니다.\n` +
                      `예: ${preview}${tail}\n\n` +
                      `진행할까요? (적용 전까지는 미리보기이며, 우측 편집 탭에서 취소할 수 있습니다.)`
                    )
                    if (!ok) return
                    addEditIntent({ kind: 'deleteOrphanNodes', params: { nodeIds: [...orphanIds] } })
                    showHint(`Orphan 노드 ${orphanIds.length}개 삭제 의도를 추가했습니다.`)
                  }}
                  onCancelDelete={() => {
                    const intent = findOrphanIntent(editIntents)
                    if (intent) removeEditIntent(intent.id)
                    showHint('Orphan 노드 삭제 의도를 취소했습니다.')
                  }}
                />
              )
            }
            return (
              <FilterBtn key={key} on={freeNodeFilters[key] ?? true} color={color} label={label}
                onClick={() => {
                  toggleViewportFreeNodeFilter(viewportId, key)
                  showHint(freeNodeHint(key))
                }} />
            )
          })}
        </SubSection>
      )}

      {/* Group 서브 컨트롤 */}
      {colorMode === 'group' && groups.length > 0 && (
        <SubSection title={
          deleteMask && deleteMask.deletedGroupIds.size > 0
            ? `그룹 (${deleteMask.derivedGroupCount} / 원본 ${groups.length})`
            : `그룹 (${groups.length}개)`
        }>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              onClick={() => {
                setAllViewportGroupFilters(viewportId, true, groups, maxIndividual)
                showHint('모든 그룹을 다시 표시합니다.')
              }}
              style={allBtnStyle('#1e3a5a')}
            >전체 표시</button>
            <button
              onClick={() => {
                setAllViewportGroupFilters(viewportId, false, groups, maxIndividual)
                showHint('모든 그룹을 숨깁니다. 필요한 그룹만 다시 켤 수 있습니다.')
              }}
              style={allBtnStyle('#2a1a3a')}
            >전체 숨김</button>
          </div>
          {editEnabled && !isEditTargetStage && (
            <div style={{
              fontSize: 10, color: '#FFAA55', lineHeight: 1.4,
              padding: '5px 7px',
              background: 'rgba(255,170,85,0.08)',
              border: '1px solid rgba(255,170,85,0.35)',
              borderRadius: 4,
            }}>
              편집은 마지막 단계에서만 가능합니다 — 단계를 마지막으로 변경하세요.
            </div>
          )}
          {groups.slice(0, maxIndividual).map((g, i) => {
            const deleteIntent = editAllowed ? findDeleteIntent(editIntents, g.id) : null
            return (
              <GroupRow
                key={g.id}
                color={groupColorCss(i, displayCount)}
                label={`그룹 ${i + 1}`}
                sub={`${g.elementIds.length}개 요소 / ${g.nodeCount ?? g.nodeIds?.length ?? 0}개 노드`}
                visible={groupFilters[i] !== false}
                onToggle={() => {
                  toggleViewportGroupFilter(viewportId, i)
                  showHint(`${i + 1}번 그룹 표시를 전환했습니다.`)
                }}
                editEnabled={editAllowed}
                deleteIntent={deleteIntent}
                onAddDelete={() => {
                  addEditIntent({ kind: 'deleteGroup', params: {
                    groupId: g.id, memberNodeCount: g.nodeCount ?? g.nodeIds?.length ?? 0,
                  } })
                  showHint(`${i + 1}번 그룹 삭제 의도를 추가했습니다. 우측 편집 탭에서 확인하세요.`)
                }}
                onCancelDelete={() => {
                  if (deleteIntent) removeEditIntent(deleteIntent.id)
                  showHint(`${i + 1}번 그룹 삭제 의도를 취소했습니다.`)
                }}
              />
            )
          })}
          {hasOthers && (
            <FilterBtn on={groupFilters['others'] !== false}
              color={groupColorCss(maxIndividual, displayCount)}
              label={`기타 (${totalOthers}개)`} sub={`${othersElemCount}개 요소`}
              onClick={() => {
                toggleViewportGroupFilter(viewportId, 'others')
                showHint('기타 그룹 묶음 표시를 전환했습니다.')
              }} />
          )}
        </SubSection>
      )}

      {colorMode === 'group' && groups.length === 0 && (
        <div style={{ padding: '6px 12px 8px', fontSize: 11, color: '#444' }}>그룹 데이터 없음</div>
      )}

      <SubSection title="해석 결과 표시">
        <FilterBtn
          on={layers.stabilityIssues !== false}
          color="#9D3DFF"
          label="간섭 Element"
          sub="자세안정성 경고 위치"
          onClick={() => {
            toggleLayer('stabilityIssues')
            showHint('자세안정성 경고 Element 표시를 전환했습니다.')
          }}
        />
      </SubSection>
    </div>
  )
}

function PanelHint({ text, onClose }) {
  return (
    <div style={{
      position: 'absolute',
      left: 'calc(100% + 8px)',
      top: 42,
      width: 190,
      zIndex: 30,
      background: '#101024',
      color: '#cad8e8',
      border: '1px solid rgba(122,178,212,0.65)',
      borderRadius: 7,
      padding: '9px 26px 9px 11px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
      fontSize: 12,
      lineHeight: 1.5,
      pointerEvents: 'auto',
    }}>
      <div style={{
        position: 'absolute',
        left: -7,
        top: 18,
        width: 12,
        height: 12,
        transform: 'rotate(45deg)',
        background: '#101024',
        borderLeft: '1px solid rgba(122,178,212,0.65)',
        borderBottom: '1px solid rgba(122,178,212,0.65)',
      }} />
      <button
        onClick={onClose}
        title="닫기"
        style={{
          position: 'absolute', right: 5, top: 5,
          background: 'transparent', border: 'none',
          color: '#7a8aaa', cursor: 'pointer', padding: 2, lineHeight: 0,
          fontSize: 13,
        }}
      >
        ×
      </button>
      {text}
    </div>
  )
}

function modeHint(mode) {
  if (mode === 'category') return 'Default Mode: 구조와 배관을 기본 색상으로 구분합니다.'
  if (mode === 'freeNode') return 'Node Check: Shared, Free, Orphan 노드 상태를 색으로 확인합니다.'
  if (mode === 'group') return 'Group: 연결 그룹별로 색을 나누고, 편집 모드에서는 그룹 삭제 의도를 추가할 수 있습니다.'
  return '모델 확인 표시 기준을 변경했습니다.'
}

function freeNodeHint(key) {
  if (key === 'normal') return 'Shared 노드는 여러 요소에 연결된 정상 연결 노드입니다.'
  if (key === 'free') return 'Free 노드는 한쪽만 연결된 자유단 후보입니다.'
  if (key === 'orphan') return 'Orphan 노드는 요소에 연결되지 않은 고립 노드입니다.'
  return '노드 타입 필터를 전환했습니다.'
}

function SubSection({ title, children }) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '7px 8px 9px' }}>
      <div style={{ fontSize: 10, color: '#7ab2d4', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, paddingLeft: 2, fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {children}
      </div>
    </div>
  )
}

function FilterBtn({ on, color, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: on ? `${color}1e` : 'transparent',
        color: on ? color : '#3a3a5a',
        border: `1px solid ${on ? color + '99' : '#252535'}`,
        borderRadius: 6,
        padding: sub ? '6px 9px' : '6px 11px',
        fontSize: 12, fontWeight: 700,
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s ease', width: '100%',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: on ? color : '#2a2a3a',
        boxShadow: on ? `0 0 5px ${color}aa` : 'none',
        transition: 'all 0.15s ease',
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span>{label}</span>
        {sub && <span style={{ fontSize: 10, color: on ? color : '#2a2a4a', opacity: on ? 0.65 : 1, fontWeight: 400 }}>{sub}</span>}
      </div>
    </button>
  )
}

const allBtnStyle = (bg) => ({
  flex: 1, padding: '5px 0',
  background: bg, color: '#aaa',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
})

// 그룹 row — visibility 토글 버튼 + (편집 모드 시) 삭제 의도 버튼
function GroupRow({
  color, label, sub, visible, onToggle,
  editEnabled, deleteIntent, onAddDelete, onCancelDelete,
}) {
  const pendingDelete = !!deleteIntent
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <div style={{ flex: 1, minWidth: 0, opacity: pendingDelete ? 0.55 : 1 }}>
        <FilterBtn
          on={visible}
          color={pendingDelete ? '#FF6B6B' : color}
          label={pendingDelete ? `${label} · 삭제 예정` : label}
          sub={sub}
          onClick={onToggle}
        />
      </div>
      {editEnabled && (
        <button
          onClick={pendingDelete ? onCancelDelete : onAddDelete}
          title={pendingDelete ? '삭제 의도 취소' : '이 그룹 삭제 의도 추가'}
          style={{
            width: 28, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: pendingDelete ? 'rgba(255,107,107,0.18)' : 'transparent',
            color: pendingDelete ? '#FFB3B3' : '#7070a0',
            border: `1px solid ${pendingDelete ? 'rgba(255,107,107,0.55)' : '#252535'}`,
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!pendingDelete) {
              e.currentTarget.style.background = 'rgba(192,74,74,0.18)'
              e.currentTarget.style.color = '#e07070'
              e.currentTarget.style.borderColor = '#7a3a3a'
            }
          }}
          onMouseLeave={(e) => {
            if (!pendingDelete) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#7070a0'
              e.currentTarget.style.borderColor = '#252535'
            }
          }}
        >
          {pendingDelete ? <RotateCcw size={12} /> : <Trash2 size={12} />}
        </button>
      )}
    </div>
  )
}

function findDeleteIntent(intents, groupId) {
  return intents.find(i => i.kind === 'deleteGroup' && i.params?.groupId === groupId) ?? null
}

function findOrphanIntent(intents) {
  return intents.find(i => i.kind === 'deleteOrphanNodes') ?? null
}

// Orphan 필터 row — 좌측 가시성 토글 + 우측 일괄 삭제(또는 취소) 버튼
function OrphanFilterRow({
  on, color, label, orphanIds,
  onToggleFilter, deleteIntent, editAllowed,
  onAddDelete, onCancelDelete,
}) {
  const pending = !!deleteIntent
  const count = orphanIds.length
  const disabled = !editAllowed || (count === 0 && !pending)
  const sub = pending
    ? `${deleteIntent.params?.nodeIds?.length ?? 0}개 삭제 예정`
    : (count > 0 ? `${count}개 검출` : '없음')
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <div style={{ flex: 1, minWidth: 0, opacity: pending ? 0.55 : 1 }}>
        <FilterBtn
          on={on}
          color={pending ? '#FF6B6B' : color}
          label={pending ? `${label} · 삭제 예정` : label}
          sub={sub}
          onClick={onToggleFilter}
        />
      </div>
      <button
        onClick={pending ? onCancelDelete : onAddDelete}
        disabled={disabled}
        title={
          !editAllowed ? '편집 모드(마지막 단계)에서만 삭제 의도를 추가할 수 있습니다.'
          : pending ? 'Orphan 삭제 의도 취소'
          : (count === 0 ? '삭제할 Orphan 노드가 없습니다.' : `Orphan ${count}개 일괄 삭제`)
        }
        style={{
          width: 28, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: pending ? 'rgba(255,107,107,0.18)' : 'transparent',
          color: disabled ? '#3a3a4a' : pending ? '#FFB3B3' : '#7070a0',
          border: `1px solid ${pending ? 'rgba(255,107,107,0.55)' : '#252535'}`,
          borderRadius: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (disabled || pending) return
          e.currentTarget.style.background = 'rgba(192,74,74,0.18)'
          e.currentTarget.style.color = '#e07070'
          e.currentTarget.style.borderColor = '#7a3a3a'
        }}
        onMouseLeave={(e) => {
          if (disabled || pending) return
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#7070a0'
          e.currentTarget.style.borderColor = '#252535'
        }}
      >
        {pending ? <RotateCcw size={12} /> : <Trash2 size={12} />}
      </button>
    </div>
  )
}
