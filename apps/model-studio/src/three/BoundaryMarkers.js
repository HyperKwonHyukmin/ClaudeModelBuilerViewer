import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const DIAMOND_SIZE = 0.14   // octahedron radius (≈ 140 mm)

/**
 * Builds a Group of diamond-shaped (OctahedronGeometry) markers for SPC nodes —
 * 파이프라인이 BDF 출력에 사용한 spcNodeIds 집합이 'Spc' 태그로 직렬화되어 들어온다.
 * 'Boundary' 태그도 함께 포함 — Spc 태그가 없는 구버전 JSON 호환을 위함이며, 두 집합은
 * Set으로 중복 제거된다 (현재 파이프라인은 Boundary ⊂ Spc).
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildBoundaryMarkers(stageData) {
  const group = new THREE.Group()
  const geo = new THREE.OctahedronGeometry(DIAMOND_SIZE)
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.boundary, metalness: 0.2, roughness: 0.55 })

  const allIds = [...new Set([
    ...stageData.nodesByTag('Spc'),
    ...stageData.nodesByTag('Boundary'),
  ])]

  if (allIds.length === 0) return group

  const mesh = new THREE.InstancedMesh(geo, mat, allIds.length)
  mesh.count = 0
  const m = new THREE.Matrix4()
  const nodeIds = []   // instance index → nodeId (편집 모드 deleteMask 용)
  const originalMatrices = new Float32Array(allIds.length * 16)
  for (const id of allIds) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    m.setPosition(pos)
    mesh.setMatrixAt(mesh.count, m)
    m.toArray(originalMatrices, mesh.count * 16)
    nodeIds[mesh.count] = id
    mesh.count++
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { nodeIds, originalMatrices }
  group.add(mesh)
  return group
}
