import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

/**
 * 우상단 정보 패널 — 단순화 버전.
 * 메타/모델지표/연결성/진단 등은 모두 제거하고, Node 또는 Element 를 클릭하면
 * "연결된 Node ID" 만 표시한다. 아무것도 선택하지 않으면 패널을 숨긴다.
 *
 *  - Element 클릭 → 그 요소가 잇는 두 노드(시작/끝) ID
 *  - Node 클릭    → 클릭한 노드 + 요소로 연결된 이웃 노드 ID 들
 *  - Mass/RBE 클릭 → 연결된 노드 ID (부착 노드 / 독립·종속 노드)
 */
const MAX_IDS = 80   // 표시 상한 (종속노드 많은 RBE 대비)

export default function InspectorPanel() {
  const { stages } = useStageStore()
  const { viewports, activeViewportId, pickedEntity, clearPickedEntity } = useViewerStore()

  const activeVp = viewports.find(v => v.id === activeViewportId)
  const stage = activeVp ? stages[activeVp.stageIndex] : null

  const info = useMemo(
    () => (stage && pickedEntity ? connectedNodeInfo(pickedEntity, stage) : null),
    [stage, pickedEntity],
  )

  // 파일 미로드 / 선택 없음 / 노드 정보 없음 → 아무것도 표시하지 않는다.
  if (!stage || !info) return null

  const shown = info.nodeIds.slice(0, MAX_IDS)
  const overflow = info.nodeIds.length - shown.length

  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 26,
      width: 240, maxWidth: '90vw',
      background: 'rgba(18,18,42,0.95)', border: '1px solid #2a3a5a',
      borderRadius: 8, boxShadow: '0 6px 22px rgba(0,0,0,0.45)',
      backdropFilter: 'blur(2px)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderBottom: '1px solid #20203e',
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: info.color, letterSpacing: 0.3 }}>
          {info.title}
        </span>
        <button
          onClick={clearPickedEntity}
          title="선택 해제"
          style={{ background: 'transparent', border: 'none', color: '#667', cursor: 'pointer', display: 'flex', padding: 2 }}
        ><X size={13} /></button>
      </div>

      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 10, color: '#7a8aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
          연결된 Node ID {info.nodeIds.length > 0 ? `(${info.nodeIds.length})` : ''}
        </div>
        {info.nodeIds.length === 0 ? (
          <div style={{ fontSize: 11, color: '#667' }}>연결된 노드가 없습니다.</div>
        ) : (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 4,
          }}>
            {shown.map(id => (
              <span key={id} style={{
                fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#cfe4ff',
                background: '#10102a', border: '1px solid #2a3a5a',
                borderRadius: 4, padding: '2px 6px',
              }}>{id}</span>
            ))}
            {overflow > 0 && (
              <span style={{ fontSize: 11, color: '#7a8aaa', padding: '2px 4px' }}>외 {overflow}개</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 선택된 엔티티의 "연결된 Node ID" 목록을 계산한다.
 * @returns {{ title:string, color:string, nodeIds:number[] } | null}
 */
function connectedNodeInfo(entity, stage) {
  if (!entity) return null

  if (entity.type === 'node') {
    const id = entity.nodeId
    if (id == null) return null
    // 요소(BEAM 등)로 이 노드와 직접 연결된 이웃 노드.
    const neighbors = new Set()
    for (const e of stage.elements ?? []) {
      if (e.startNode === id && e.endNode != null) neighbors.add(e.endNode)
      else if (e.endNode === id && e.startNode != null) neighbors.add(e.startNode)
    }
    neighbors.delete(id)
    return {
      title: `노드 N${id}`,
      color: '#4682B4',
      nodeIds: [...neighbors].sort((a, b) => a - b),
    }
  }

  if (entity.type === 'mass') {
    return {
      title: `질량 ${entity.id ?? ''}`.trim(),
      color: '#FF99BB',
      nodeIds: entity.nodeId != null ? [entity.nodeId] : [],
    }
  }

  if (entity.type === 'rigid') {
    const ids = []
    if (entity.independentNode != null) ids.push(entity.independentNode)
    for (const d of entity.dependentNodes ?? []) if (d != null) ids.push(d)
    return {
      title: `RBE ${entity.id ?? ''}`.trim(),
      color: entity.remark === 'UBOLT' ? '#00E5FF' : '#FF44FF',
      nodeIds: ids,
    }
  }

  if (entity.type === 'sourceName') {
    // CSV 행 선택은 직접 연결된 단일 노드 개념이 없으므로 표시하지 않는다.
    return null
  }

  // 그 외(element) — 요소가 잇는 두 노드.
  const ids = [entity.startNode, entity.endNode].filter(v => v != null)
  return {
    title: `요소 E${entity.id ?? ''}`.trim(),
    color: '#4682B4',
    nodeIds: ids,
  }
}
