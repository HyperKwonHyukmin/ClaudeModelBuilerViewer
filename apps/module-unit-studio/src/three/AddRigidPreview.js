import * as THREE from 'three'

/**
 * addRigid intent 의 (independent ↔ dependents) 라인을 노란 점선 LineSegments 로 빌드.
 * 기존 RBE(자홍/시안) 와 시각적으로 분리되어 "추가 예정" 임을 즉시 전달.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {Array<{ independentNode: number, dependentNodes: number[] }>} addedRigids
 * @returns {THREE.LineSegments|null}
 */
export function buildAddRigidPreview(stageData, addedRigids) {
  if (!stageData || !Array.isArray(addedRigids) || addedRigids.length === 0) return null

  const positions = []
  for (const r of addedRigids) {
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

  // LineDashedMaterial 사용 — computeLineDistances() 호출 필수.
  const mat = new THREE.LineDashedMaterial({
    color: 0xFFD740,
    linewidth: 2,
    transparent: true,
    opacity: 0.95,
    dashSize: 0.18,
    gapSize: 0.10,
    depthTest: false,
    depthWrite: false,
  })
  const line = new THREE.LineSegments(geo, mat)
  line.computeLineDistances()
  line.renderOrder = 998
  return line
}
