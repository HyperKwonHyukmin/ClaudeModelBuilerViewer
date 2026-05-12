import * as THREE from 'three'

/**
 * brokenRbeIds 에 속한 RBE 들을 노란색 두꺼운 점선 overlay 로 그린다.
 * "이 RBE 는 그룹 삭제로 끊깁니다" 시각 경고용.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {Set<number>} brokenRbeIds
 * @returns {THREE.LineSegments|null}
 */
export function buildBrokenRbeHighlight(stageData, brokenRbeIds) {
  if (!stageData || !brokenRbeIds || brokenRbeIds.size === 0) return null

  const positions = []
  for (const r of stageData.rigids ?? []) {
    if (!brokenRbeIds.has(r.id)) continue
    const indPos = stageData.getNodePos(r.independentNode)
    if (!indPos) continue
    for (const dep of r.dependentNodes ?? []) {
      const depPos = stageData.getNodePos(dep)
      if (!depPos) continue
      positions.push(indPos.x, indPos.y, indPos.z, depPos.x, depPos.y, depPos.z)
    }
  }
  if (positions.length === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({
    color: 0xFFB800,
    linewidth: 2,
    transparent: true,
    opacity: 0.95,
    depthTest: false,    // 모델/RBE 에 가려져도 보이도록
    depthWrite: false,
  })
  const line = new THREE.LineSegments(geo, mat)
  line.renderOrder = 998   // SelectionHighlight(?) 과 Sprite 사이
  return line
}
