import * as THREE from 'three'
import { makeScreenSpaceMaterial } from './screenSpaceMaterial.js'

// ── 후보(적용 전) 색 ────────────────────────────────────────────────────────
// 라임. 뷰포트에 이미 쓰는 색과 겹치지 않아야 "후보군" 이 즉시 읽힌다.
//   노랑 0xFFB800 = 편집 다중선택 · 앰버 = addRigid 미리보기 · 자홍 = RBE · 시안 = U-bolt/선택
export const PROPOSAL_COLOR_HEX = '#B6FF3D'
const PROPOSAL_COLOR = 0xB6FF3D
const HOVER_COLOR    = 0xFFFFFF
// 타깃(주 구조) 노드는 흰 다이아로 칠해 소그룹 노드(라임 구)와 역할이 다르다는 것을 모양·색으로 알린다.
const TARGET_COLOR   = 0xF2FFE0

// CPU 지오메트리 반지름(월드). 화면 크기는 *_PX 로 screenSpaceMaterial 이 다시 계산한다 —
// 노드 마커가 6 px 고정이 된 뒤로 후보 마커도 배율과 무관하게 항상 노드보다 크게 보여야 한다
// (Side Passage 원본은 월드 크기라 1만 노드 모델의 전체 보기에서 마커가 묻혔다 — 2026-09-11 실측).
const CORE_R   = 0.055
const HALO_R   = 0.145
const HOVER_CORE_R = 0.085
const HOVER_HALO_R = 0.21
const CORE_PX  = 11      // 코어 지름(px) — 노드 마커(6px)의 ~2배
const HALO_PX  = 22
const HOVER_CORE_PX = 15
const HOVER_HALO_PX = 30
const ssSphere = (px, geoRadius) => ({ mode: 'sphere', px, minWorld: 0, geoRadius })

function dashedLine(positions, color, opacity, order, dash = 0.16, gap = 0.07) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.LineDashedMaterial({
    color, transparent: true, opacity, dashSize: dash, gapSize: gap, depthTest: false, depthWrite: false,
  })
  const line = new THREE.LineSegments(geo, mat)
  line.computeLineDistances()
  line.renderOrder = order
  return line
}

/**
 * 그룹 자동 연결 후보(적용 전) 오버레이 — Side Passage HBeamProposalPreview 이식.
 *
 * 한 후보 = 라임 점선 + 양 끝 마커. 양 끝은 역할이 달라 모양·색을 나눈다.
 *   · 소그룹 쪽(srcNode)  — 라임 구(sphere)   = RBE2 종속
 *   · 주 구조 쪽(tgtNode) — 흰 다이아(octahedron) = RBE2 독립
 * 두 마커 모두 반투명 라임 후광(halo)을 두른다. 후광이 없으면 부재 색과 크기가 비슷해
 * 어디가 후보인지 훑어보는 것만으로는 찾을 수 없다.
 * hover 행은 전부 흰색으로 바뀌고 코어·후광이 함께 커진다.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {Array<{ srcNode:number, tgtNode:number, disabled?:boolean }>} proposals
 * @param {number|null} [hoverIndex]
 * @returns {THREE.Group|null}
 */
export function buildGroupConnectPreview(stageData, proposals, hoverIndex = null) {
  if (!stageData || !Array.isArray(proposals) || proposals.length === 0) return null

  const normal = [], hover = []
  const sPts = [], tPts = []            // 일반 행 — 소그룹 노드 / 타깃 노드
  const sHoverPts = [], tHoverPts = []  // hover 행
  proposals.forEach((p, i) => {
    // 체크 해제한 후보는 그리지 않는다 — 인덱스는 표와 맞춰 유지한다.
    if (p.disabled) return
    const a = stageData.getNodePos(p.srcNode)
    const b = stageData.getNodePos(p.tgtNode)
    if (!a || !b) return
    if (i === hoverIndex) {
      hover.push(a.x, a.y, a.z, b.x, b.y, b.z)
      sHoverPts.push(a); tHoverPts.push(b)
    } else {
      normal.push(a.x, a.y, a.z, b.x, b.y, b.z)
      sPts.push(a); tPts.push(b)
    }
  })
  if (normal.length === 0 && hover.length === 0) return null

  const group = new THREE.Group()
  group.name = 'GroupConnectPreview'
  if (normal.length) group.add(dashedLine(normal, PROPOSAL_COLOR, 0.95, 998))
  // hover 는 대시를 길게 잡아 거의 실선으로 보이게 한다 — 짧은 연결도 확실히 드러난다.
  if (hover.length)  group.add(dashedLine(hover, HOVER_COLOR, 1.0, 999, 0.5, 0.02))

  // 연결점 마커 — 점선은 세그먼트를 이어 그리며 대시 위상이 누적되므로, 길이가 짧은 구간은
  // 대시 간격(gap) 안에 통째로 들어가 화면에 전혀 안 보일 수 있다. 그래서 양 끝 마커가
  // 후보 위치를 보장하는 유일한 표시 수단이며, 단순 장식이 아니므로 지우지 말 것.
  const add = (pts, geo, mat, order) => {
    for (const pt of pts) {
      const m = new THREE.Mesh(geo, mat)
      m.position.copy(pt)
      m.renderOrder = order
      group.add(m)
    }
  }
  const solidMat = (color, opacity, ss) => makeScreenSpaceMaterial(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
  }), ss)
  // 후광 — 뒷면만 그려(BackSide) 코어를 가리지 않고 테두리 광처럼 보이게 한다.
  const haloMat = (color, opacity, ss) => makeScreenSpaceMaterial(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.BackSide,
  }), ss)

  if (sPts.length || tPts.length) {
    const halo = new THREE.SphereGeometry(HALO_R, 14, 10)
    const haloM = haloMat(PROPOSAL_COLOR, 0.22, ssSphere(HALO_PX, HALO_R))
    add(sPts, halo, haloM, 997)
    add(tPts, halo, haloM, 997)
    add(sPts, new THREE.SphereGeometry(CORE_R, 14, 10), solidMat(PROPOSAL_COLOR, 1.0, ssSphere(CORE_PX, CORE_R)), 999)
    // 팔면체는 외접 반지름이 곧 geoRadius 라 sphere 모드 스케일이 그대로 맞는다
    add(tPts, new THREE.OctahedronGeometry(CORE_R * 1.35), solidMat(TARGET_COLOR, 1.0, ssSphere(CORE_PX * 1.35, CORE_R * 1.35)), 999)
  }
  if (sHoverPts.length || tHoverPts.length) {
    const halo = new THREE.SphereGeometry(HOVER_HALO_R, 16, 12)
    const haloM = haloMat(HOVER_COLOR, 0.30, ssSphere(HOVER_HALO_PX, HOVER_HALO_R))
    add(sHoverPts, halo, haloM, 999)
    add(tHoverPts, halo, haloM, 999)
    add(sHoverPts, new THREE.SphereGeometry(HOVER_CORE_R, 16, 12), solidMat(HOVER_COLOR, 1.0, ssSphere(HOVER_CORE_PX, HOVER_CORE_R)), 1000)
    add(tHoverPts, new THREE.OctahedronGeometry(HOVER_CORE_R * 1.35), solidMat(HOVER_COLOR, 1.0, ssSphere(HOVER_CORE_PX * 1.35, HOVER_CORE_R * 1.35)), 1000)
  }
  return group
}
