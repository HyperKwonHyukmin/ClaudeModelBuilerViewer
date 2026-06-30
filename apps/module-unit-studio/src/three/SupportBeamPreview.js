import * as THREE from 'three'
import { makeSection } from './BeamMesh3D.js'

// 재사용 임시 객체 (GC 압박 방지)
const _y = new THREE.Vector3(0, 1, 0)
const _d = new THREE.Vector3()
const _o = new THREE.Object3D()

/**
 * 가서포트(addSupportBeam) 미리보기 — 두 노드를 잇는 청록 실선 LineSegments.
 * 기존 부재/RBE 와 색으로 구분되어 "추가된 보강재" 임을 즉시 전달.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {Array<{ startNode:number, endNode:number }>} supportBeams
 * @returns {THREE.LineSegments|null}
 */
export function buildSupportBeamPreview(stageData, supportBeams) {
  if (!stageData || !Array.isArray(supportBeams) || supportBeams.length === 0) return null
  const positions = []
  for (const sb of supportBeams) {
    const a = stageData.getNodePos(sb.startNode)
    const b = stageData.getNodePos(sb.endNode)
    if (!a || !b) continue
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  if (positions.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({
    color: 0x2DD4BF, linewidth: 3, transparent: true, opacity: 0.95,
    depthTest: false, depthWrite: false,
  })
  const line = new THREE.LineSegments(geo, mat)
  line.renderOrder = 999
  return line
}

/**
 * 가서포트를 실제 L 단면(BeamMesh3D 와 동일 makeSection geometry)으로 3D 렌더링.
 * "3D 단면" 토글(renderMode='section3d') ON 일 때 청록 실선 대신 사용한다.
 * 모든 가서포트는 동일 L 단면(기본 100×100×10t)이라 단일 geometry InstancedMesh 로 묶는다.
 * 위치/길이/방향은 buildBeamMesh3D 와 동일 규칙(중점 배치 + Y축→부재방향 회전 + Y 스케일=길이).
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {Array<{ startNode:number, endNode:number, dims?:number[] }>} supportBeams
 * @returns {THREE.InstancedMesh|null}
 */
export function buildSupportBeam3D(stageData, supportBeams) {
  if (!stageData || !Array.isArray(supportBeams) || supportBeams.length === 0) return null
  const valid = []
  for (const sb of supportBeams) {
    const start = stageData.getNodePos(sb.startNode)
    const end = stageData.getNodePos(sb.endNode)
    if (!start || !end) continue
    valid.push({ start, end })
  }
  if (valid.length === 0) return null

  const dims = supportBeams[0]?.dims ?? [100, 100, 10, 10]
  const geo = makeSection('L', dims)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2DD4BF, metalness: 0.15, roughness: 0.55, flatShading: true,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, valid.length)
  mesh.count = 0
  for (const v of valid) {
    _d.subVectors(v.end, v.start)
    const len = _d.length()
    if (len < 1e-6) continue
    _o.position.addVectors(v.start, v.end).multiplyScalar(0.5)
    _o.scale.set(1, len, 1)
    _o.quaternion.setFromUnitVectors(_y, _d.normalize())
    _o.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _o.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
