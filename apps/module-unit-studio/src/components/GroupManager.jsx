import { useState, useMemo } from 'react'
import { Trash2, RotateCcw, Eye, EyeOff, Crosshair, RefreshCw } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'
import { getGroupDisplayCount, groupColorCss } from '../utils/groupPalette.js'
import { useGroupRefresh } from '../hooks/useGroupRefresh.js'

/**
 * GroupManager — Edit 리본과 Model Check 리본이 함께 쓰는 단일 그룹 관리 컴포넌트.
 * (ModelBuilderStudio 의 useGroupDeletion 처럼 "같은 그룹 목록 · 같은 삭제 방식" 통일.)
 *
 * 두 기준을 전환한다:
 *   · 연결 그룹  — 마지막 단계의 connectivity 그룹.
 *   · 부재 종류  — 구조/배관(category).
 * 각 그룹은 확인(표시 토글)·단독 뷰·삭제(intent 추가/취소)가 가능하다.
 *
 * "그룹 새로고침": 삭제 표시한 연결 그룹을 목록에서 즉시 내리고 남은 그룹만 보여준다(미리보기).
 * 실제 모델 반영은 기존대로 "자세안정성 평가 실행" 시.
 */
const CATEGORY_DEFS = [
  { key: 'Structure', label: '구조', color: '#5BA8E5', layerKey: 'structure' },
  { key: 'Pipe',      label: '배관', color: '#FFAA22', layerKey: 'pipe' },
]

export default function GroupManager() {
  const [basis, setBasis] = useState('connectivity')   // 'connectivity' | 'category'

  const stages    = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null

  const intents      = useEditStore(s => s.intents)
  const addIntent    = useEditStore(s => s.addIntent)
  const removeIntent = useEditStore(s => s.removeIntent)

  const viewports        = useViewerStore(s => s.viewports)
  const activeViewportId = useViewerStore(s => s.activeViewportId)
  const toggleGroupFilter  = useViewerStore(s => s.toggleViewportGroupFilter)
  const setAllGroupFilters = useViewerStore(s => s.setAllViewportGroupFilters)
  const soloGroup          = useViewerStore(s => s.soloViewportGroup)
  const layers   = useViewerStore(s => s.layers)
  const setLayer = useViewerStore(s => s.setLayer)
  const activeVp = viewports.find(v => v.id === activeViewportId)
  const groupFilters = activeVp?.groupFilters ?? {}

  const deleteMask = useMemo(() => computeDeleteMask(lastStage, intents), [lastStage, intents])
  const { refresh, showAll, isHidden, hiddenCount } = useGroupRefresh(deleteMask.deletedGroupIds)

  const connGroups = lastStage?.finalGroups ?? lastStage?.groups ?? []
  const hasConn = connGroups.length > 0

  // 부재 종류 그룹 — 구조/배관별 BEAM 요소·노드 수 집계
  const categoryGroups = useMemo(() => {
    const els = lastStage?.elements ?? []
    return CATEGORY_DEFS.map(d => {
      const beams = els.filter(e => e.type === 'BEAM' && e.category === d.key)
      const nodeSet = new Set()
      for (const e of beams) {
        if (e.startNode != null) nodeSet.add(e.startNode)
        if (e.endNode   != null) nodeSet.add(e.endNode)
      }
      return { ...d, elemCount: beams.length, nodeCount: nodeSet.size }
    }).filter(d => d.elemCount > 0)
  }, [lastStage])

  if (!hasConn && categoryGroups.length === 0) return null

  // 연결 그룹이 없으면 부재 종류로 강제
  const effBasis = (basis === 'connectivity' && !hasConn) ? 'category' : basis
  const { maxIndividual, hasOthers, displayCount } = getGroupDisplayCount(connGroups)

  // 삭제 표시 수(전체) — 새로고침 버튼 안내용
  const pendingDeleteCount = deleteMask.deletedGroupIds.size

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '6px 7px 7px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid #20203a',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: '#7ab2d4', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, paddingLeft: 1 }}>
          그룹 관리
        </span>
        <button
          type="button"
          onClick={() => {
            if (effBasis === 'connectivity') setAllGroupFilters(activeViewportId, true, connGroups, maxIndividual)
            else { setLayer('structure', true); setLayer('pipe', true) }
          }}
          title="모든 그룹 다시 표시"
          style={{ background: 'transparent', border: 'none', color: '#5d6b86', cursor: 'pointer', fontSize: 9, fontWeight: 700, padding: '1px 2px' }}
        >전체 표시</button>
      </div>

      {/* 기준 선택 */}
      <div style={{ display: 'flex', gap: 4 }}>
        <BasisBtn active={effBasis === 'connectivity'} disabled={!hasConn} onClick={() => setBasis('connectivity')}>
          연결 그룹 ({connGroups.length})
        </BasisBtn>
        <BasisBtn active={effBasis === 'category'} disabled={categoryGroups.length === 0} onClick={() => setBasis('category')}>
          부재 종류 ({categoryGroups.length})
        </BasisBtn>
      </div>

      {/* 그룹 새로고침 — 삭제 표시한 연결 그룹을 목록에서 내리고 남은 그룹만 표시(미리보기) */}
      {effBasis === 'connectivity' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={refresh}
            disabled={pendingDeleteCount === 0}
            title="삭제 표시한 그룹을 목록에서 내리고 남은 그룹만 표시합니다 (모델 반영은 평가 실행 시)"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '5px 8px', borderRadius: 5,
              background: pendingDeleteCount > 0 ? 'rgba(70,130,180,0.20)' : '#0f0f1e',
              color: pendingDeleteCount > 0 ? '#bfe0ff' : '#4a4a66',
              border: `1px solid ${pendingDeleteCount > 0 ? '#2e5a7a' : '#23233a'}`,
              fontSize: 10, fontWeight: 800,
              cursor: pendingDeleteCount > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <RefreshCw size={11} /> 그룹 새로고침{pendingDeleteCount > 0 ? ` (${pendingDeleteCount})` : ''}
          </button>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={showAll}
              title="새로고침으로 내린 그룹을 다시 모두 표시"
              style={{
                flexShrink: 0, padding: '5px 8px', borderRadius: 5,
                background: 'transparent', color: '#7a8aaa',
                border: '1px solid #2a2a44', fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
              }}
            >전체 보기</button>
          )}
        </div>
      )}

      {/* 연결 그룹 기준 — 새로고침으로 숨겨진 그룹은 목록에서 제외(번호는 안정적으로 유지) */}
      {effBasis === 'connectivity' && connGroups.slice(0, maxIndividual)
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => !isHidden(g.id))
        .map(({ g, i }) => {
          const intent = intents.find(it => it.kind === 'deleteGroup' && it.params?.groupId === g.id)
          const elemCount = g.elementIds?.length ?? 0
          const nodeCount = g.nodeCount ?? g.nodeIds?.length ?? 0
          return (
            <ManagerRow
              key={g.id}
              color={groupColorCss(i, displayCount)}
              label={`그룹 ${i + 1}`}
              sub={`${elemCount}개 요소 / ${nodeCount}개 노드`}
              visible={groupFilters[i] !== false}
              pending={!!intent}
              onToggleVisible={() => toggleGroupFilter(activeViewportId, i)}
              onSolo={() => soloGroup(activeViewportId, i, connGroups, maxIndividual)}
              onDelete={() => {
                if (intent) { removeIntent(intent.id); return }
                addIntent({ kind: 'deleteGroup', params: { groupId: g.id, memberNodeCount: nodeCount } })
              }}
            />
          )
        })}
      {effBasis === 'connectivity' && hasOthers && (
        <ManagerRow
          color={groupColorCss(maxIndividual, displayCount)}
          label={`기타 (${connGroups.length - maxIndividual}개)`}
          sub="소그룹 묶음 — 개별 삭제 불가"
          visible={groupFilters['others'] !== false}
          pending={false}
          onToggleVisible={() => toggleGroupFilter(activeViewportId, 'others')}
          onSolo={() => soloGroup(activeViewportId, 'others', connGroups, maxIndividual)}
          onDelete={null}
        />
      )}

      {/* 부재 종류 기준 */}
      {effBasis === 'category' && categoryGroups.map((c) => {
        const intent = intents.find(it => it.kind === 'deleteCategory' && it.params?.category === c.key)
        const visible = layers[c.layerKey] !== false
        return (
          <ManagerRow
            key={c.key}
            color={c.color}
            label={c.label}
            sub={`${c.elemCount}개 요소 / ${c.nodeCount}개 노드`}
            visible={visible}
            pending={!!intent}
            onToggleVisible={() => setLayer(c.layerKey, !visible)}
            onSolo={() => {
              setLayer('structure', c.key === 'Structure')
              setLayer('pipe',      c.key === 'Pipe')
            }}
            onDelete={() => {
              if (intent) { removeIntent(intent.id); return }
              if (!window.confirm(`${c.label} 부재 ${c.elemCount}개를 모두 삭제 의도에 추가합니다.\n적용 전까지는 미리보기이며 언제든 취소할 수 있습니다.\n\n진행할까요?`)) return
              addIntent({ kind: 'deleteCategory', params: { category: c.key, elementCount: c.elemCount } })
            }}
          />
        )
      })}
    </div>
  )
}

// 기준 선택 버튼 (연결 그룹 / 부재 종류)
function BasisBtn({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '4px 4px',
        background: active ? 'rgba(70,130,180,0.22)' : 'transparent',
        color: disabled ? '#3a3a50' : active ? '#cfe4f5' : '#7a8aaa',
        border: `1px solid ${active ? '#2e5a7a' : '#2a2a44'}`,
        borderRadius: 5, fontSize: 9.5, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

// 그룹 1행 — 색 점 + 라벨/카운트 + (확인·단독·삭제) 액션
function ManagerRow({ color, label, sub, visible, pending, onToggleVisible, onSolo, onDelete }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '5px 6px',
      background: 'rgba(255,255,255,0.015)',
      border: '1px solid #1d1d34', borderRadius: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: pending ? '#FF6B6B' : (visible ? color : '#2a2a3a'),
          boxShadow: (!pending && visible) ? `0 0 5px ${color}aa` : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0, opacity: pending ? 0.55 : 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: pending ? '#FFB3B3' : '#cdd8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}{pending && <span style={{ fontWeight: 600 }}> · 삭제 예정</span>}
          </div>
          <div style={{ fontSize: 9, color: '#60708a' }}>{sub}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <ManagerBtn active={visible} onClick={onToggleVisible} title={visible ? '숨기기' : '표시'}>
          {visible ? <Eye size={11} /> : <EyeOff size={11} />}<span>확인</span>
        </ManagerBtn>
        <ManagerBtn onClick={onSolo} title="이 그룹만 보기 (단독 뷰)">
          <Crosshair size={11} /><span>단독</span>
        </ManagerBtn>
        {onDelete && (
          <ManagerBtn danger pending={pending} onClick={onDelete} title={pending ? '삭제 의도 취소(복원)' : '삭제 의도 추가'}>
            {pending ? <RotateCcw size={12} /> : <Trash2 size={12} />}
          </ManagerBtn>
        )}
      </div>
    </div>
  )
}

function ManagerBtn({ children, onClick, title, active, danger, pending }) {
  const base = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    padding: '4px 5px', borderRadius: 5, fontSize: 10, fontWeight: 700,
    cursor: 'pointer', lineHeight: 1, whiteSpace: 'nowrap',
  }
  let style
  if (danger) {
    style = pending
      ? { ...base, width: 30, flexShrink: 0, background: 'rgba(255,107,107,0.18)', color: '#FFB3B3', border: '1px solid rgba(255,107,107,0.55)' }
      : { ...base, width: 30, flexShrink: 0, background: 'transparent', color: '#9a6a6a', border: '1px solid #3a2a2a' }
  } else if (active) {
    style = { ...base, flex: 1, background: 'rgba(70,130,180,0.20)', color: '#cfe4f5', border: '1px solid #2e5a7a' }
  } else {
    style = { ...base, flex: 1, background: 'transparent', color: '#7a8aaa', border: '1px solid #2a2a44' }
  }
  return <button type="button" onClick={onClick} title={title} style={style}>{children}</button>
}
