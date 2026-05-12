import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

// 권상 그룹별 색 — HoistGroupHighlight / HoistPositionPanel 과 동일.
const HOIST_GROUP_COLORS = {
  1: 0x00D1FF,  // cyan
  2: 0xB57CFF,  // 보라
  3: 0x6AE07A,  // 녹색
  4: 0xFF66AA,  // 핫핑크
}

const LINE_PX = 5
const FILL_OPACITY = 0.18
const COLINEAR_TOL = 0.04   // 4점 직선 판정: 평균 변 길이 대비 편차 비율

/**
 * 권상 그룹별 도형(직선/삼각형/사각형) 미리보기 overlay.
 * hoistGroups[groupId] = nodeIds[] 를 기준으로 그룹별 1개씩 도형을 만든다.
 * 한 그룹의 노드가 2개 미만이면 그 그룹은 도형을 그리지 않는다 (마커는 HoistGroupHighlight 가 담당).
 *
 * 그룹 간 상태가 완전히 분리되어 있어 한 그룹의 노드를 추가/삭제해도 다른 그룹 도형은 영향을 받지 않는다.
 *
 * @param {Record<number, number[]>} hoistGroups   - { 1: nodeIds, 2: nodeIds, 3: nodeIds }
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {{width:number, height:number}} resolution  - LineMaterial 픽셀 굵기 환산용
 * @returns {THREE.Group}
 */
export function buildPolygonOverlay(hoistGroups, stageData, resolution) {
  const root = new THREE.Group()
  root.name = 'HoistShapeOverlay'
  if (!stageData || !hoistGroups) return root

  const res = new THREE.Vector2(
    Math.max(resolution?.width ?? 1, 1),
    Math.max(resolution?.height ?? 1, 1),
  )

  for (const groupId of [1, 2, 3, 4]) {
    const nodeIds = hoistGroups[groupId] ?? []
    const positions = nodeIds
      .map(id => stageData.getNodePos(id))
      .filter(Boolean)
    if (positions.length < 2) continue

    const colorHex = HOIST_GROUP_COLORS[groupId]

    // 3점 삼각형, 4점 사각형 (단, 4점이 거의 일직선이면 line 으로 취급)
    const closed = positions.length >= 3 && !(positions.length === 4 && isCollinear(positions))

    // 4점 닫힌 사각형은 사용자가 노드를 꼬아서 골랐어도(예: 대각선 순) 평면 위 각도순으로
    // 자동 재정렬 → bowtie / 자가교차 모양 방지. 3점 삼각형은 항상 볼록이라 정렬 불필요.
    const drawPositions = (closed && positions.length === 4)
      ? sortQuadConvex(positions)
      : positions

    root.add(makeOutline(drawPositions, closed, colorHex, res, LINE_PX))
    if (closed) {
      const fill = makeFill(drawPositions, colorHex)
      if (fill) root.add(fill)
    }
  }

  return root
}

function makeOutline(positions, closed, colorHex, resolution, linePx) {
  const pts = closed ? [...positions, positions[0]] : positions
  const flat = new Array(pts.length * 3)
  for (let i = 0; i < pts.length; i++) {
    flat[i * 3]     = pts[i].x
    flat[i * 3 + 1] = pts[i].y
    flat[i * 3 + 2] = pts[i].z
  }
  const geo = new LineGeometry()
  geo.setPositions(flat)

  const mat = new LineMaterial({
    color: colorHex,
    linewidth: linePx,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    dashed: false,
  })
  mat.resolution.copy(resolution)
  mat.worldUnits = false   // 픽셀 단위 굵기

  const line = new Line2(geo, mat)
  line.computeLineDistances()
  line.renderOrder = 55
  return line
}

function makeFill(positions, colorHex) {
  // Triangle fan from positions[0]: 3점→1삼각형, 4점→2삼각형 (1-2-3, 1-3-4)
  const triCount = positions.length - 2
  if (triCount <= 0) return null
  const verts = new Float32Array(triCount * 3 * 3)
  for (let i = 0; i < triCount; i++) {
    const a = positions[0], b = positions[i + 1], c = positions[i + 2]
    const off = i * 9
    verts[off]     = a.x; verts[off + 1] = a.y; verts[off + 2] = a.z
    verts[off + 3] = b.x; verts[off + 4] = b.y; verts[off + 5] = b.z
    verts[off + 6] = c.x; verts[off + 7] = c.y; verts[off + 8] = c.z
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.computeVertexNormals()

  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: FILL_OPACITY,
    depthTest: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 53
  return mesh
}

/**
 * 4 개의 (대체로) 동일 평면 위 점을 평면 위 각도 순으로 정렬해 자가교차하지 않는
 * 볼록 사각형을 만든다. 사용자가 노드를 꼬아서(예: 대각선 순) 선택해도 자동으로
 * 시계/반시계 방향 정렬되어 깔끔한 사각형으로 시각화된다.
 *
 * 알고리즘:
 *  1) 4 점의 기하중심 c 계산
 *  2) 4 점 중 비공선인 세 점으로 평면 법선 n 계산
 *  3) 평면 위 직교 기저 (u, w) 구축 (n 에 수직)
 *  4) 각 점을 (u, w) 기저에 사영 → 2D, atan2 각도로 정렬
 * 정렬 결과는 항상 한 방향으로 회전하는 순서가 되므로 bowtie 가 사라진다.
 */
export function sortQuadConvex(positions) {
  if (positions.length !== 4) return positions

  const c = new THREE.Vector3()
  for (const p of positions) c.add(p)
  c.multiplyScalar(0.25)

  const n = computePlaneNormal(positions)
  if (!n) return positions   // 4점이 모두 일직선 — 호출 측에서 collinear 처리됨

  // 평면 위 기저: u = n 에 수직인 임의 단위 벡터, w = n × u
  const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = ref.clone().sub(n.clone().multiplyScalar(ref.dot(n))).normalize()
  const w = new THREE.Vector3().crossVectors(n, u).normalize()

  const tmp = new THREE.Vector3()
  const annotated = positions.map(p => {
    tmp.subVectors(p, c)
    const x = tmp.dot(u)
    const y = tmp.dot(w)
    return { p, angle: Math.atan2(y, x) }
  })
  annotated.sort((a, b) => a.angle - b.angle)
  return annotated.map(a => a.p)
}

/**
 * 4점 중 비공선인 세 점을 찾아 평면 법선을 계산. 모두 일직선이면 null.
 */
function computePlaneNormal(positions) {
  const triples = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]]
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const n  = new THREE.Vector3()
  for (const [a, b, c] of triples) {
    ab.subVectors(positions[b], positions[a])
    ac.subVectors(positions[c], positions[a])
    n.crossVectors(ab, ac)
    if (n.lengthSq() > 1e-10) return n.clone().normalize()
  }
  return null
}

/**
 * 4점이 한 직선 위에 (거의) 일렬로 있는지 판정.
 * 점 1→끝점 방향 벡터 기준으로 중간 점들이 그 직선에서 얼마나 떨어져 있는지 평가.
 */
function isCollinear(positions) {
  if (positions.length < 3) return true
  const a = positions[0]
  const b = positions[positions.length - 1]
  const ab = new THREE.Vector3().subVectors(b, a)
  const baseLen = ab.length()
  if (baseLen < 1e-6) return false
  ab.normalize()
  const tmp = new THREE.Vector3()
  let maxDist = 0
  for (let i = 1; i < positions.length - 1; i++) {
    tmp.subVectors(positions[i], a)
    const along = tmp.dot(ab)
    const perp = tmp.lengthSq() - along * along
    const d = perp > 0 ? Math.sqrt(perp) : 0
    if (d > maxDist) maxDist = d
  }
  return maxDist < baseLen * COLINEAR_TOL
}
