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
 * 위치/길이/방향은 buildBeamMesh3D 와 동일 규칙(중점 배치 + Y축→부재방향 회전 + Y 스케일=길이).
 *
 * ⚠ 단면이 3종(100×100×10t / 100×100×13t / 130×130×12t)이라 **치수별로 InstancedMesh 를
 * 나눠** Group 으로 담는다. InstancedMesh 는 geometry 를 하나만 가지므로, 예전처럼
 * 첫 부재의 dims 로 전부 그리면 굵기가 다른 앵글이 같은 굵기로 보인다.
 *
 * ⚠ 솔리드만 넣으면 **구조물 안에 묻혀 안 보인다.** 가서포트는 기존 부재 사이를 잇는 100mm
 * 앵글이라 주위 부재에 가려지는데, 선 미리보기(`buildSupportBeamPreview`)는 `depthTest:false`
 * 로 항상 위에 떠 있어서 "3D 단면으로 바꾸면 가서포트가 사라진다" 로 보였다. 그래서 솔리드에
 * **중심선을 겹쳐** 넣는다 — 방금 추가한 것을 항상 찾을 수 있어야 하는 미리보기 오버레이라
 * 보고서 그림(`solid3d` + 2D 중심선)과 같은 방식을 쓴다.
 * 솔리드 자체를 `depthTest:false` 로 만들면 안 된다 — 면 정렬이 깨져 뒷면이 앞면을 덮는다.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {Array<{ startNode:number, endNode:number, dims?:number[] }>} supportBeams
 * @returns {THREE.Group|null}
 */
export function buildSupportBeam3D(stageData, supportBeams) {
  if (!stageData || !Array.isArray(supportBeams) || supportBeams.length === 0) return null

  // dims 키별로 부재를 모은다 (Map 은 삽입 순서를 지켜 렌더 순서가 안정적).
  const byDims = new Map()
  for (const sb of supportBeams) {
    const start = stageData.getNodePos(sb.startNode)
    const end = stageData.getNodePos(sb.endNode)
    if (!start || !end) continue
    const dims = sb.dims ?? [100, 100, 10, 10]
    const key = dims.join('x')
    let bucket = byDims.get(key)
    if (!bucket) { bucket = { dims, items: [] }; byDims.set(key, bucket) }
    bucket.items.push({ start, end })
  }
  if (byDims.size === 0) return null

  const group = new THREE.Group()
  for (const { dims, items } of byDims.values()) {
    const geo = makeSection('L', dims)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2DD4BF, metalness: 0.15, roughness: 0.55, flatShading: true,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, items.length)
    mesh.count = 0
    for (const v of items) {
      _d.subVectors(v.end, v.start)
      const len = _d.length()
      if (len < 1e-6) continue
      _o.position.addVectors(v.start, v.end).multiplyScalar(0.5)
      _o.scale.set(1, len, 1)
      _o.quaternion.setFromUnitVectors(_y, _d.normalize())
      _o.updateMatrix()
      mesh.setMatrixAt(mesh.count++, _o.matrix)
    }
    if (mesh.count === 0) { geo.dispose(); mat.dispose(); continue }
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  if (group.children.length === 0) return null

  // 가려짐 방지용 중심선 — 선 모드와 같은 밝기로 둔다. 흐리게(0.5) 하면 어두운 배경에 섞여
  // 다시 "안 보인다" 가 된다(실측: 배경 혼합 후 g≈119 로 청록으로 읽히지 않음).
  const guide = buildSupportBeamPreview(stageData, supportBeams)
  if (guide) group.add(guide)
  return group
}
