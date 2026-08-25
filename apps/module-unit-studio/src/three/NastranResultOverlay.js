import * as THREE from 'three'
import { utilizationColor, COLOR_EXCEEDED, COLOR_NO_RESULT } from '../utils/stressColorRamp.js'

/**
 * NastranResultOverlay — Phase 5 색맵핑 viewer.
 *
 * Unit 구조 해석 결과(nastranResult.json)의 부재 응력과 wire 장력을 색으로 시각화한다.
 *
 * 입력 스키마:
 *   result.members[]  = { elementId, maxStressMPa, utilization, exceedsLimit, type }
 *   result.wires[]    = { wireElementId, axialForceN, isCompression, isSlack, hasResult, ... }
 *   result.evaluation = { structuralAllowableMPa, ... }
 *
 * 색 정책:
 *   부재: 활용도(utilization = σ/허용응력)를 BAND_COUNT 개 밴드로 나눠
 *         utils/stressColorRamp.js 의 연속 램프로 칠한다
 *         (파랑=여유 → 청록 → 초록 → 호박 → 주황=한계 근접 → 빨강=초과).
 *         활용도가 없으면 회색, 엔진이 exceedsLimit 을 준 부재는 항상 빨강.
 *   와이어: !hasResult ? 회색(90A4B0)
 *           isCompression ? 노랑(FFC447 — 슬랙 가능 경고)
 *           else 녹색(37E08A — 정상 인장)
 *
 * StabilityIssueOverlay 와 동일하게 stage data 의 element 위에 cylinder
 * highlight 를 덮어쓰는 방식. depthTest:false 로 항상 위에 그려진다.
 */

// 부재 색은 utils/stressColorRamp.js 의 활용도 램프가 정한다(연속 컨투어).
// 밴드 수 — 늘리면 컨투어가 매끄러워지고 draw call 이 그만큼 늘어난다. 10이면
// 활용도 10% 단위로 구분되어 실무 판독에 충분하다.
const BAND_COUNT = 10
const COLOR_WIRE_TENSION      = 0x37E08A  // 녹색 (정상 인장)
const COLOR_WIRE_COMPRESSION  = 0xFFC447  // 노랑 (압축, 슬랙 가능)
const COLOR_WIRE_NO_RESULT    = 0x90A4B0  // 회색 (F06 결과 누락)

// 반경 — base element/beam 보다 살짝 두껍게 해서 색이 잘 보이게.
// 부재 응력 색상 overlay 는 선택 highlight 와 겹치므로 기존 대비 20% 얇게 유지한다.
const MEMBER_R = 0.0368
const WIRE_R   = 0.062

const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()

function makeMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  })
}

/**
 * @param {object} result        nastranResult.json 본체
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {{ deletedElementIds?: Set<number> }} [opts]
 * @returns {THREE.Group}
 */
export function buildNastranResultOverlay(result, stageData, opts = {}) {
  const root = new THREE.Group()
  root.name = 'NastranResultOverlay'
  if (!result || !stageData) return root

  const deleted = opts.deletedElementIds ?? null
  const allow = (id) => !deleted || !deleted.has(id)

  // elementId → element / wireElementId → wire 인덱스(1회 구성).
  // 아래 bucket/chain/mid 에서 루프마다 stageData.elements.find() 하던 O(W×E) 선형탐색을 O(1) 조회로 대체.
  const elemById = new Map()
  for (const e of (stageData.elements ?? [])) elemById.set(e.id, e)
  const wireById = new Map()
  for (const w of (result.wires ?? [])) {
    if (Number.isInteger(w?.wireElementId)) wireById.set(w.wireElementId, w)
  }

  // 멤버 분류 — 활용도(σ/허용응력) 밴드별로 나눈다.
  //
  // 예전에는 exceedsLimit 불리언 하나로 ok/fail 두 통에만 담았다. 그러면 허용치의
  // 98% 인 부재와 30% 인 부재가 같은 파란색이 되어, 정작 설계 여유가 없는 구간을
  // 3D 에서 찾을 수 없었다(utilization 은 이미 결과에 들어 있는데 버려지고 있었다).
  //
  // 밴드로 양자화하는 이유는 성능이다. 부재마다 색을 다르게 하려면 InstancedMesh 를
  // 쪼개야 하는데, BAND_COUNT 개 통으로 묶으면 draw call 이 12개 안쪽으로 유지되면서도
  // 눈으로는 연속 컨투어로 읽힌다(상용 FEA 의 banded contour 와 같은 방식).
  const memberBands = new Map()   // bandIndex → elementId[]
  const memberExceeded = []
  const memberNoResult = []
  for (const m of (result.members ?? [])) {
    const id = m?.elementId
    if (!Number.isInteger(id) || !allow(id)) continue
    const u = Number(m?.utilization)
    // 초과 판정의 최종 권한은 엔진(exceedsLimit)에 있다. 활용도가 없어도 엔진이
    // 초과라고 하면 초과로 그린다.
    if (m.exceedsLimit || u > 1) { memberExceeded.push(id); continue }
    if (!Number.isFinite(u)) { memberNoResult.push(id); continue }
    const band = Math.min(BAND_COUNT - 1, Math.max(0, Math.floor(u * BAND_COUNT)))
    if (!memberBands.has(band)) memberBands.set(band, [])
    memberBands.get(band).push(id)
  }

  // 와이어 분류
  const wireTension     = []
  const wireCompression = []
  const wireNoResult    = []
  for (const w of (result.wires ?? [])) {
    const id = w?.wireElementId
    if (!Number.isInteger(id) || !allow(id)) continue
    if (!w.hasResult) wireNoResult.push(id)
    else if (w.isCompression) wireCompression.push(id)
    else wireTension.push(id)
  }

  // 부재 → 와이어 순서로 add (와이어가 위에 그려져야 가독성 ↑)
  if (memberNoResult.length) root.add(buildBucket(memberNoResult, elemById, stageData, COLOR_NO_RESULT, MEMBER_R, 0.55, 69))
  for (const [band, ids] of memberBands) {
    if (!ids.length) continue
    // 밴드 중앙값의 색으로 칠한다 — 경계값이 아니라 대표값이라야 밴드가 고르게 보인다.
    const color = utilizationColor((band + 0.5) / BAND_COUNT)
    // 활용도가 높을수록 불투명하게 — 여유 있는 부재는 뒤로 물러나고 한계 근접 부재가 드러난다.
    const opacity = 0.62 + 0.30 * (band / (BAND_COUNT - 1))
    root.add(buildBucket(ids, elemById, stageData, color, MEMBER_R, opacity, 70 + band))
  }
  if (memberExceeded.length) root.add(buildBucket(memberExceeded, elemById, stageData, COLOR_EXCEEDED, MEMBER_R, 0.96, 70 + BAND_COUNT))
  if (wireNoResult.length)    root.add(buildBucket(wireNoResult,    elemById, stageData, COLOR_WIRE_NO_RESULT,   WIRE_R,   0.70, 90))
  if (wireTension.length)     root.add(buildBucket(wireTension,     elemById, stageData, COLOR_WIRE_TENSION,     WIRE_R,   0.88, 91))
  if (wireCompression.length) root.add(buildBucket(wireCompression, elemById, stageData, COLOR_WIRE_COMPRESSION, WIRE_R,   0.95, 92))

  // 와이어 라벨 — wire CROD 는 lifting BDF 단계에서 처음 생성되므로 사용자가 보고 있는
  // stage JSON 의 elements 에는 들어있지 않은 게 일반적이다. 따라서:
  //   A) stageData.elements 에 wire 가 있으면 → chain grouping 으로 양 끝 사이 mid 계산
  //   B) 없으면 → result.wires 각 record 의 lugNodeId(stage nodeMap) + apexCoordByGroup
  //               (stability visualization 의 apex 좌표 mm)로 직접 mid 계산
  const apexCoordByGroup = opts.apexCoordByGroup ?? {}
  const renderedWireEids = new Set()
  let chainCount = 0
  // (A) chain grouping
  for (const compEids of groupWireChains(result.wires ?? [], elemById, allow)) {
    if (compEids.length === 0) continue
    compEids.sort((a, b) => a - b)
    const repEid = compEids[0]
    const repWire = wireById.get(repEid)
    if (!repWire) continue
    const mid = computeChainMid(compEids, elemById, stageData)
    if (!mid) continue

    chainCount++
    for (const e of compEids) renderedWireEids.add(e)
    const force = repWire.axialForceN
    const valuePart = !repWire.hasResult ? '결과 누락'
      : (force == null ? '-' : `${Number(force).toLocaleString()} N`)
    const labelText = `Wire E${repEid} · ${valuePart}`
    const labelColor = !repWire.hasResult ? '#90A4B0'
      : (repWire.isCompression ? '#FFC447' : '#37E08A')
    const sprite = makeWireForceLabel(labelText, labelColor)
    sprite.position.set(mid.x, mid.y, mid.z + 0.4)
    root.add(sprite)
  }
  // (B) fallback — chain 에 잡히지 않은 wire (stage 에 element 가 없음) 는 lug+apex 좌표로 직접 표시
  let fallbackCount = 0
  for (const w of (result.wires ?? [])) {
    const eid = w?.wireElementId
    if (!Number.isInteger(eid) || !allow(eid)) continue
    if (renderedWireEids.has(eid)) continue   // chain 에서 이미 표시됨
    const lugId = w.lugNodeId
    const groupId = Number(w.groupId)
    const lugPos = stageData.getNodePos(lugId)
    const apexMm = apexCoordByGroup[groupId]
    if (!lugPos || !apexMm) continue
    // apex mm → scene m (StabilityWireOverlay 와 동일 변환).
    const c = stageData.center
    const apexScene = new THREE.Vector3(
      (apexMm.x - c.x) / 1000,
      (apexMm.y - c.y) / 1000,
      (apexMm.z - c.z) / 1000,
    )
    const mid = new THREE.Vector3().addVectors(lugPos, apexScene).multiplyScalar(0.5)

    fallbackCount++
    const force = w.axialForceN
    const valuePart = !w.hasResult ? '결과 누락'
      : (force == null ? '-' : `${Number(force).toLocaleString()} N`)
    const labelText = `Wire E${eid} · ${valuePart}`
    const labelColor = !w.hasResult ? '#90A4B0'
      : (w.isCompression ? '#FFC447' : '#37E08A')
    const sprite = makeWireForceLabel(labelText, labelColor)
    sprite.position.set(mid.x, mid.y, mid.z + 0.4)
    root.add(sprite)
  }
  // 디버그 출력 — 개발 빌드에서만(프로덕션 콘솔 오염 방지). 라벨이 왜 안 나오는지 진단용.
  if (import.meta.env?.DEV) {
    console.log('[NastranResultOverlay] wire labels:', {
      totalWires: (result.wires ?? []).length,
      chainLabels: chainCount,
      fallbackLabels: fallbackCount,
      apexGroupsAvailable: Object.keys(apexCoordByGroup).length,
    })
  }

  return root
}

function makeWireForceLabel(text, color) {
  const canvas = document.createElement('canvas')
  // 큰 모델에서도 또렷이 보이도록 텍스트/캔버스를 크게. 폰트는 monospace 36px,
  // 텍스트 자체는 흰색으로 채워 가독성을 높이고 보더만 wire 상태색(green/yellow/gray)으로 강조.
  canvas.width = 560
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 36px monospace'
  const tw = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(140, tw + 44))
  const x = (canvas.width - boxW) / 2
  const y = 16
  const h = 64

  // 배경 (반투명 흑)
  ctx.fillStyle = 'rgba(8, 6, 22, 0.94)'
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  roundRect(ctx, x, y, boxW, h, 10)
  ctx.fill()
  ctx.stroke()

  // 텍스트 — 흰색 (보더가 상태색이므로 텍스트는 가독성 최우선).
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  // 씬 단위(m) 기준 — 권상 wire(5~6m) 길이 대비 라벨 박스가 너무 크면 가독성 떨어져
  // 화면을 덮음. 사용자 피드백으로 v0.0.32 대비 절반 크기로 축소.
  sprite.scale.set(1.75, 0.3, 1)
  sprite.renderOrder = 86
  return sprite
}

/**
 * wireElementId 들을 노드 연결로 그룹핑 — 같은 chain(connected component)을 한 묶음으로 반환.
 * BDF 에서 하나의 권상 wire 가 여러 segment 로 쪼개져 있을 때 chain 별 라벨 1개로 줄이기 위함.
 *
 * @param {Array} wires - result.wires
 * @param {Map<number, object>} elemById - elementId → element 인덱스
 * @param {(id:number)=>boolean} allow - deletedElementIds 필터
 * @returns {number[][]}
 */
function groupWireChains(wires, elemById, allow) {
  // wireElementId → element
  const wireElems = new Map()
  for (const w of wires) {
    const id = w?.wireElementId
    if (!Number.isInteger(id) || !allow(id)) continue
    const elem = elemById.get(id)
    if (elem) wireElems.set(id, elem)
  }
  if (wireElems.size === 0) return []

  // node → 그 노드에 연결된 wire-element id 들
  const nodeToWireEids = new Map()
  for (const [eid, elem] of wireElems) {
    for (const n of [elem.startNode, elem.endNode]) {
      if (n == null) continue
      if (!nodeToWireEids.has(n)) nodeToWireEids.set(n, [])
      nodeToWireEids.get(n).push(eid)
    }
  }

  // BFS 로 connected component
  const visited = new Set()
  const components = []
  for (const startEid of wireElems.keys()) {
    if (visited.has(startEid)) continue
    const comp = []
    const queue = [startEid]
    while (queue.length) {
      const cur = queue.shift()
      if (visited.has(cur)) continue
      visited.add(cur)
      comp.push(cur)
      const elem = wireElems.get(cur)
      for (const n of [elem.startNode, elem.endNode]) {
        for (const nbr of (nodeToWireEids.get(n) ?? [])) {
          if (!visited.has(nbr)) queue.push(nbr)
        }
      }
    }
    components.push(comp)
  }
  return components
}

/**
 * chain 의 두 endpoint(노드 degree=1) 사이 mid 좌표. endpoint 가 정확히 2개가 아니면
 * (loop / 분기) 모든 노드 좌표의 평균을 fallback 으로 사용.
 *
 * @param {number[]} compEids
 * @param {Map<number, object>} elemById - elementId → element 인덱스
 * @param {object} stageData
 * @returns {THREE.Vector3|null}
 */
function computeChainMid(compEids, elemById, stageData) {
  const nodeDeg = new Map()
  for (const eid of compEids) {
    const elem = elemById.get(eid)
    if (!elem) continue
    nodeDeg.set(elem.startNode, (nodeDeg.get(elem.startNode) ?? 0) + 1)
    nodeDeg.set(elem.endNode, (nodeDeg.get(elem.endNode) ?? 0) + 1)
  }
  const endpoints = [...nodeDeg.entries()].filter(([, c]) => c === 1).map(([n]) => n)
  if (endpoints.length === 2) {
    const a = stageData.getNodePos(endpoints[0])
    const b = stageData.getNodePos(endpoints[1])
    if (a && b) return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  }
  // fallback — 모든 노드 평균
  const sum = new THREE.Vector3()
  let cnt = 0
  for (const node of nodeDeg.keys()) {
    const p = stageData.getNodePos(node)
    if (p) { sum.add(p); cnt++ }
  }
  if (cnt === 0) return null
  return sum.multiplyScalar(1 / cnt)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function buildBucket(elementIds, elemById, stageData, color, radius, opacity, renderOrder) {
  const elems = []
  for (const id of elementIds) { const e = elemById.get(id); if (e) elems.push(e) }
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 8, 1)
  const mat = makeMat(color, opacity)
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(elems.length, 1))
  mesh.count = 0
  mesh.renderOrder = renderOrder
  mesh.frustumCulled = false  // 큰 모델에서 일부 chunk 가 culled 되는 현상 방지

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue
    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue
    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/**
 * elementId → 결과 record lookup. PickTooltip 이 element 호버/클릭 시 응력/장력 표시에 사용.
 * 큰 모델에서도 O(1) 조회가 되도록 Map 으로 캐시.
 */
export function buildNastranResultLookup(result) {
  const memberMap = new Map()
  const wireMap = new Map()
  if (result) {
    for (const m of (result.members ?? [])) {
      if (Number.isInteger(m?.elementId)) memberMap.set(m.elementId, m)
    }
    for (const w of (result.wires ?? [])) {
      if (Number.isInteger(w?.wireElementId)) wireMap.set(w.wireElementId, w)
    }
  }
  return {
    memberMap,
    wireMap,
    allowableMPa: result?.evaluation?.structuralAllowableMPa ?? 220,
  }
}

export const NASTRAN_RESULT_COLORS = {
  memberOk:        '#4488FF',
  memberFail:      '#FF5566',
  wireTension:     '#37E08A',
  wireCompression: '#FFC447',
  wireNoResult:    '#90A4B0',
}
