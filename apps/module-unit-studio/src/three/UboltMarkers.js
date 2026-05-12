import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'
import { isUboltRigid } from './rigidClassification.js'

const MARKER_RADIUS = 0.06   // 60mm — 작지만 식별 가능

/**
 * U-bolt RBE의 independent node 위치에 작은 시안색 구체 마커를 InstancedMesh로 그린다.
 * 줌아웃 상태에서도 U-bolt 분포를 한눈에 파악하기 위함.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildUboltMarkers(stageData) {
  const group = new THREE.Group()
  const ubolts = (stageData.rigids ?? []).filter(isUboltRigid)
  if (ubolts.length === 0) return group

  const geo = new THREE.SphereGeometry(MARKER_RADIUS, 12, 8)
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.uboltRigid, transparent: true, opacity: 0.9 })

  const mesh = new THREE.InstancedMesh(geo, mat, ubolts.length)
  mesh.count = 0
  const m = new THREE.Matrix4()
  const nodeIds = []   // instance index → independentNode (편집 모드 deleteMask 용)
  const originalMatrices = new Float32Array(ubolts.length * 16)
  for (const r of ubolts) {
    const pos = stageData.getNodePos(r.independentNode)
    if (!pos) continue
    m.setPosition(pos)
    mesh.setMatrixAt(mesh.count, m)
    m.toArray(originalMatrices, mesh.count * 16)
    nodeIds[mesh.count] = r.independentNode
    mesh.count++
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { nodeIds, originalMatrices }
  group.add(mesh)
  return group
}
