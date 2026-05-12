/**
 * Computes metric differences between two StageData objects.
 * Uses healthMetrics (from JSON or client-computed) and connectivity.
 *
 * @param {import('./StageData.js').StageData} stageA
 * @param {import('./StageData.js').StageData} stageB
 * @returns {Array<{label:string, a:number, b:number, delta:number, deltaPercent:number}>}
 */
export function stageDiff(stageA, stageB) {
  const ta = stageA?.healthMetrics?.totals ?? {}
  const tb = stageB?.healthMetrics?.totals ?? {}
  const ia = stageA?.healthMetrics?.issues ?? {}
  const ib = stageB?.healthMetrics?.issues ?? {}
  const ca = stageA?.connectivity ?? {}
  const cb = stageB?.connectivity ?? {}

  const row = (label, a, b) => {
    a = a ?? 0; b = b ?? 0
    const delta = b - a
    const deltaPercent = a !== 0 ? (delta / a) * 100 : (b !== 0 ? 100 : 0)
    return { label, a, b, delta, deltaPercent }
  }

  return [
    row('노드 수', ta.nodeCount, tb.nodeCount),
    row('요소 수 (전체)', ta.elementCount, tb.elementCount),
    row('요소 수 (구조)', ta.elementsByCategory?.Structure, tb.elementsByCategory?.Structure),
    row('요소 수 (배관)', ta.elementsByCategory?.Pipe, tb.elementsByCategory?.Pipe),
    row('RBE 수', ta.rigidCount, tb.rigidCount),
    row('질량 수', ta.pointMassCount, tb.pointMassCount),
    row('총 길이 (m)', ta.totalLengthMm != null ? +(ta.totalLengthMm / 1000).toFixed(1) : 0,
                       tb.totalLengthMm != null ? +(tb.totalLengthMm / 1000).toFixed(1) : 0),
    row('그룹 수', ca.groupCount, cb.groupCount),
    row('Orphan 노드', ia.orphanNodes ?? ca.isolatedNodeCount, ib.orphanNodes ?? cb.isolatedNodeCount),
    row('자유단 노드', ia.freeEndNodes, ib.freeEndNodes),
    row('단락 요소', ia.shortElements, ib.shortElements),
    row('미연결 그룹', ia.disconnectedGroups, ib.disconnectedGroups),
  ]
}
