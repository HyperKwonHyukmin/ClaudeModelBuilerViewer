import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const MASS_SIZE = 0.09   // cube half-extent → 90 mm side length

/**
 * Builds an InstancedMesh of cubes for point masses.
 * userData에 instance index → pointMass 정보 매핑을 저장해 raycaster 클릭 시
 * 해당 PointMass의 mass·nodeId 등을 즉시 조회 가능하도록 한다.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildMassMarkers(stageData) {
  const masses = stageData.pointMasses
  const geo = new THREE.BoxGeometry(MASS_SIZE, MASS_SIZE, MASS_SIZE)
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.mass, metalness: 0.2, roughness: 0.55 })
  const mesh = new THREE.InstancedMesh(geo, mat, masses.length)
  mesh.count = 0

  const massData = []   // index → { id, nodeId, mass, sourceName }
  const originalMatrices = new Float32Array(masses.length * 16)   // 편집 모드 deleteMask 복원용
  const m = new THREE.Matrix4()
  for (const pm of masses) {
    const pos = stageData.getNodePos(pm.nodeId)
    if (!pos) continue
    m.setPosition(pos)
    mesh.setMatrixAt(mesh.count, m)
    m.toArray(originalMatrices, mesh.count * 16)
    massData[mesh.count] = { id: pm.id, nodeId: pm.nodeId, mass: pm.mass, sourceName: pm.sourceName }
    mesh.count++
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { massData, originalMatrices }
  return mesh
}
