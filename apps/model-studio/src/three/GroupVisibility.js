import * as THREE from 'three'

const _m   = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _rot = new THREE.Quaternion()
const _scl = new THREE.Vector3()

/**
 * Shows/hides beam instances by connectivity group.
 * Hidden instances are scaled to near-zero; shown instances restored from originalMatrices.
 *
 * @param {THREE.InstancedMesh} mesh
 * @param {object} groupFilters  — { [groupId|'others']: boolean }  (missing key = true/visible)
 * @param {number} maxIndividual — groups 0..maxIndividual-1 are individual; rest = 'others'
 */
export function applyGroupVisibility(mesh, groupFilters, maxIndividual) {
  if (!mesh?.userData?.elementGroupIds || !mesh?.userData?.originalMatrices) return

  const { elementGroupIds, originalMatrices } = mesh.userData

  for (let i = 0; i < mesh.count; i++) {
    const gId = elementGroupIds[i]
    const key = (gId >= 0 && gId < maxIndividual) ? gId : 'others'
    const visible = groupFilters[key] !== false   // undefined = true (all visible by default)

    _m.fromArray(originalMatrices, i * 16)

    if (!visible) {
      // Scale to near-zero while preserving position
      _m.decompose(_pos, _rot, _scl)
      _m.compose(_pos, _rot, _scl.setScalar(0.0001))
    }

    mesh.setMatrixAt(i, _m)
  }

  mesh.instanceMatrix.needsUpdate = true
}
