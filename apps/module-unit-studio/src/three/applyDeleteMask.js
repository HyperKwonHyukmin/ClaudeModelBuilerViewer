import * as THREE from 'three'

/**
 * applyDeleteMask — buildScene 결과에 deleteMask 를 적용해 삭제 대상 인스턴스를 hide.
 *
 * **idempotent 보장**: 매 호출마다 마커/RBE 위치를 originalMatrices/originalPositions
 * 에서 먼저 복원한 뒤, 새 마스크에 따라 다시 hide 한다. 따라서 intent 가 추가/제거될
 * 때마다 호출하면 시각 상태가 항상 마스크 내용과 정확히 일치한다.
 *
 * NodePoints/BeamMesh 의 복원은 호출자(applyFullVisibility)가 책임진다 —
 *   - BeamMesh:  applyGroupVisibility 가 originalMatrices 에서 복원
 *   - NodePoints: applyFreeNodeFilters 가 nodePositions 에서 복원
 *   - Markers/RBE: 이 함수가 자체 복원
 *
 * 호출 순서: applyLayers → applyGroupVisibility → applyFreeNodeFilters → applyDeleteMask.
 */

const _m = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _rot = new THREE.Quaternion()
const _scl = new THREE.Vector3()
const _hiddenScale = new THREE.Vector3(0.0001, 0.0001, 0.0001)
const _identityRot = new THREE.Quaternion()

/**
 * @param {{ root: THREE.Group, layers: object, pickables: object }} sceneData
 * @param {{ deletedNodeIds: Set<number>, deletedElementIds: Set<number> }|null} mask
 */
export function applyDeleteMask(sceneData, mask) {
  if (!sceneData) return
  const elemSet = mask?.deletedElementIds ?? EMPTY_SET
  const nodeSet = mask?.deletedNodeIds    ?? EMPTY_SET

  // 1) 마커/RBE/Sprite 복원 — 매 호출마다 (idempotent)
  restoreMarkerGroup(sceneData.layers?.boundaries)
  restoreMarkerGroup(sceneData.layers?.uboltMarkers)
  restoreSpriteGroup(sceneData.layers?.uboltDof)
  restoreMassMarkers(sceneData.layers?.masses ?? sceneData.pickables?.masses)
  restoreRbeLines(sceneData.pickables?.rigidLines)

  // 2) BeamMesh hide — 호출자 가 originalMatrices 로 이미 복원했다고 가정
  if (elemSet.size > 0) {
    for (const m of collectBeamMeshes(sceneData)) hideElementsInBeamMesh(m, elemSet)
  }

  // 3) 노드 기반 hide
  if (nodeSet.size > 0) {
    const nodes = sceneData.layers?.nodes ?? sceneData.pickables?.nodes
    if (nodes) hideNodesInPointsMesh(nodes, nodeSet)

    if (sceneData.layers?.boundaries)   hideMarkerGroupByNode(sceneData.layers.boundaries,   nodeSet)
    if (sceneData.layers?.uboltMarkers) hideMarkerGroupByNode(sceneData.layers.uboltMarkers, nodeSet)
    if (sceneData.layers?.uboltDof)     hideSpriteGroupByNode(sceneData.layers.uboltDof,     nodeSet)
    const masses = sceneData.layers?.masses ?? sceneData.pickables?.masses
    if (masses) hideMassesByNode(masses, nodeSet)

    if (sceneData.pickables?.rigidLines) {
      for (const line of sceneData.pickables.rigidLines) hideRbeFullyDeletedSegments(line, nodeSet)
    }
  }
}

const EMPTY_SET = new Set()

// ── 복원 헬퍼 ──────────────────────────────────────────────────────────────

function restoreMarkerGroup(group) {
  if (!group?.traverse) return
  group.traverse(obj => {
    if (!obj?.isInstancedMesh) return
    restoreInstancesFromOriginal(obj)
  })
}

function restoreMassMarkers(mesh) {
  if (!mesh?.isInstancedMesh) return
  restoreInstancesFromOriginal(mesh)
}

function restoreInstancesFromOriginal(mesh) {
  const original = mesh.userData?.originalMatrices
  if (!original) return
  for (let i = 0; i < mesh.count; i++) {
    _m.fromArray(original, i * 16)
    mesh.setMatrixAt(i, _m)
  }
  mesh.instanceMatrix.needsUpdate = true
}

function restoreSpriteGroup(group) {
  if (!group?.traverse) return
  group.traverse(obj => {
    if (obj?.isSprite) obj.visible = true
  })
}

function restoreRbeLines(rigidLines) {
  if (!Array.isArray(rigidLines)) return
  for (const line of rigidLines) {
    const original = line.userData?.originalPositions
    const posAttr  = line.geometry?.attributes?.position
    if (!original || !posAttr) continue
    posAttr.array.set(original)
    posAttr.needsUpdate = true
  }
}

// ── hide 헬퍼 ─────────────────────────────────────────────────────────────

function collectBeamMeshes(sceneData) {
  const out = []
  if (sceneData.layers?.structure?.userData?.elementIds) out.push(sceneData.layers.structure)
  if (sceneData.layers?.pipe?.userData?.elementIds)      out.push(sceneData.layers.pipe)
  if (Array.isArray(sceneData.pickables?.beams)) {
    for (const m of sceneData.pickables.beams) {
      if (m?.userData?.elementIds) out.push(m)
    }
  }
  return out
}

function hideElementsInBeamMesh(mesh, deletedElementIds) {
  const { elementIds, originalMatrices } = mesh.userData ?? {}
  if (!elementIds || !originalMatrices) return
  for (let i = 0; i < mesh.count; i++) {
    if (!deletedElementIds.has(elementIds[i])) continue
    _m.fromArray(originalMatrices, i * 16)
    _m.decompose(_pos, _rot, _scl)
    _m.compose(_pos, _rot, _scl.setScalar(0.0001))
    mesh.setMatrixAt(i, _m)
  }
  mesh.instanceMatrix.needsUpdate = true
}

function hideNodesInPointsMesh(mesh, deletedNodeIds) {
  const { nodeIds, nodePositions } = mesh.userData ?? {}
  if (!nodeIds || !nodePositions) return
  for (let i = 0; i < mesh.count; i++) {
    if (!deletedNodeIds.has(nodeIds[i])) continue
    _m.compose(nodePositions[i], _identityRot, _hiddenScale)
    mesh.setMatrixAt(i, _m)
  }
  mesh.instanceMatrix.needsUpdate = true
}

function hideMassesByNode(mesh, deletedNodeIds) {
  const data = mesh.userData?.massData
  if (!Array.isArray(data)) return
  for (let i = 0; i < mesh.count; i++) {
    if (!deletedNodeIds.has(data[i]?.nodeId)) continue
    mesh.getMatrixAt(i, _m)
    _m.decompose(_pos, _rot, _scl)
    _m.compose(_pos, _rot, _hiddenScale)
    mesh.setMatrixAt(i, _m)
  }
  mesh.instanceMatrix.needsUpdate = true
}

function hideMarkerGroupByNode(group, deletedNodeIds) {
  if (!group?.traverse) return
  group.traverse(obj => {
    if (!obj?.isInstancedMesh) return
    const nodeIds = obj.userData?.nodeIds
    if (!Array.isArray(nodeIds)) return
    for (let i = 0; i < obj.count; i++) {
      if (!deletedNodeIds.has(nodeIds[i])) continue
      obj.getMatrixAt(i, _m)
      _m.decompose(_pos, _rot, _scl)
      _m.compose(_pos, _rot, _hiddenScale)
      obj.setMatrixAt(i, _m)
    }
    obj.instanceMatrix.needsUpdate = true
  })
}

function hideSpriteGroupByNode(group, deletedNodeIds) {
  if (!group?.traverse) return
  group.traverse(obj => {
    if (!obj?.isSprite) return
    const nid = obj.userData?.nodeId
    if (nid != null && deletedNodeIds.has(nid)) obj.visible = false
  })
}

/**
 * RBE LineSegments — independent + 모든 dependent 가 함께 삭제된 segment 만 collapse.
 * 일부만 삭제된 'broken' segment 는 별도 highlight overlay 가 노란색으로 그린다.
 */
function hideRbeFullyDeletedSegments(line, deletedNodeIds) {
  const rigidData = line.userData?.rigidData
  const posAttr = line.geometry?.attributes?.position
  if (!Array.isArray(rigidData) || !posAttr) return
  let mutated = false
  for (let segIdx = 0; segIdx < rigidData.length; segIdx++) {
    const meta = rigidData[segIdx]
    if (!meta) continue
    const indDeleted = deletedNodeIds.has(meta.independentNode)
    const deps = meta.dependentNodes ?? []
    let depDeletedCount = 0
    for (const d of deps) if (deletedNodeIds.has(d)) depDeletedCount++
    const allDepsDeleted = deps.length > 0 && depDeletedCount === deps.length
    if (!(indDeleted && allDepsDeleted)) continue
    const v0 = segIdx * 2
    const x = posAttr.getX(v0)
    const y = posAttr.getY(v0)
    const z = posAttr.getZ(v0)
    posAttr.setXYZ(v0,     x, y, z)
    posAttr.setXYZ(v0 + 1, x, y, z)
    mutated = true
  }
  if (mutated) posAttr.needsUpdate = true
}
