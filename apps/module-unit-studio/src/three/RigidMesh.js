import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'
import { isUboltRigid } from './rigidClassification.js'

/**
 * RBE2 rigid 연결을 LineSegments로 그린다. 한 Group 안에 두 개의 LineSegments를 둠:
 *   - uboltLines : remark === 'UBOLT'  (시안색, 위치 식별용)
 *   - otherLines : 그 외 RBE          (마젠타, 기존 색상)
 *
 * 두 mesh 모두 같은 'rigids' 레이어 그룹에 속해 있어 LayerPanel의 RBE 토글은 함께 ON/OFF 된다.
 *
 * 각 LineSegments mesh 의 userData.rigidData[i] 는 i 번째 세그먼트(2 정점)에 해당하는 RBE 의
 * 메타데이터 — Raycaster.intersectObject 가 반환하는 hit.index (정점 인덱스) 를 2 로 나누면
 * 세그먼트 인덱스가 되어 이 배열을 곧바로 인덱싱할 수 있다.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildRigidMesh(stageData) {
  const group = new THREE.Group()

  const uboltVerts = [], uboltData = []
  const otherVerts = [], otherData = []

  for (const rigid of stageData.rigids) {
    if (!rigid.dependentNodes?.length) continue
    const indPos = stageData.getNodePos(rigid.independentNode)
    if (!indPos) continue
    const isUbolt    = isUboltRigid(rigid)
    const targetVerts = isUbolt ? uboltVerts : otherVerts
    const targetData  = isUbolt ? uboltData  : otherData
    const meta = {
      id: rigid.id,
      independentNode: rigid.independentNode,
      dependentNodes:  rigid.dependentNodes,
      remark: rigid.remark ?? null,
      cm:     rigid.cm ?? null,
    }
    for (const depId of rigid.dependentNodes) {
      const depPos = stageData.getNodePos(depId)
      if (!depPos) continue
      targetVerts.push(indPos.x, indPos.y, indPos.z, depPos.x, depPos.y, depPos.z)
      // 한 세그먼트당 같은 rigid 메타데이터 1개 — dependentNode 는 rigid.dependentNodes 전체를 그대로 둠
      // (어느 dep 가 클릭됐는지는 hit segment 의 정점 좌표로 별도 추정 가능하지만, 일단은 RBE 단위 식별이 목적)
      targetData.push(meta)
    }
  }

  if (otherVerts.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(otherVerts, 3))
    const mat = new THREE.LineBasicMaterial({ color: COLORS.rigid })
    const mesh = new THREE.LineSegments(geo, mat)
    mesh.userData.rigidData = otherData
    // 편집 모드 deleteMask 가 일부 segment 좌표를 변형해도 다음 적용에서 복원할 수 있도록 사본 보관
    mesh.userData.originalPositions = new Float32Array(otherVerts)
    group.add(mesh)
  }

  if (uboltVerts.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(uboltVerts, 3))
    const mat = new THREE.LineBasicMaterial({ color: COLORS.uboltRigid, linewidth: 2 })
    const mesh = new THREE.LineSegments(geo, mat)
    mesh.userData.rigidData = uboltData
    mesh.userData.originalPositions = new Float32Array(uboltVerts)
    group.add(mesh)
  }

  return group
}
