/**
 * viewportFraming — "모델 전체가 화면에 담기는" 카메라 프레이밍 계산 (순수 함수).
 *
 * three.js / React 에 의존하지 않는다. ThreeViewport 의 표준 뷰(A/S/D)·전체보기(F)·최초
 * 씬 빌드가 모두 이 계산을 거쳐 같은 규칙으로 프레이밍된다.
 *
 * 과거 fitCamera 는 bbox 의 "최대 변" 하나만 보고 배율을 잡아, 종횡비가 큰 모듈이나
 * 축정렬 뷰(평면/정면/측면)에서 모델이 화면 밖으로 삐져나가거나 반대로 과하게 축소됐다.
 * 여기서는 실제 시선 기준 화면 평면(right/camUp)에 bbox 를 투영해 필요한 반폭/반높이를
 * 직접 구한다.
 */

// Z-up 좌표계(X 종방향 / Y 횡방향 / Z 수직) 기준 표준 시선 방향 + 화면 위쪽 축.
// dir 은 "타깃에서 카메라로 향하는" 방향이다(카메라는 -dir 을 바라본다).
const STANDARD_VIEWS = {
  top:   { dir: { x: 0, y: 0,  z: 1 },       up: { x: 1, y: 0, z: 0 } },  // 평면도(A) — 위에서 내려다봄
  front: { dir: { x: 0, y: -1, z: 0 },       up: { x: 0, y: 0, z: 1 } },  // 정면도(S) — Y- 에서 봄
  side:  { dir: { x: 1, y: 0,  z: 0 },       up: { x: 0, y: 0, z: 1 } },  // 측면도(D) — X+ 에서 봄
  iso:   { dir: { x: 0.9, y: -0.7, z: 0.6 }, up: { x: 0, y: 0, z: 1 } },  // 등각 — 정면 우측 상단
}

// 화면 여백 — 모델이 프레임에 딱 붙지 않도록 8% 만 띄운다.
const FIT_MARGIN = 1.08

function _len(v) { return Math.hypot(v.x, v.y, v.z) }

function _normalized(v) {
  const l = _len(v)
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null
}

function _cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

// 축정렬 bbox(반extent h, 기준점 중심)를 단위벡터 axis 에 투영했을 때의 반길이.
// 8 꼭짓점을 다 돌 필요 없이 |axis·h| 성분합이 최대 투영이다.
function _projectedHalf(axis, h) {
  return Math.abs(axis.x) * h.x + Math.abs(axis.y) * h.y + Math.abs(axis.z) * h.z
}

/**
 * 모델 bbox 전체가 화면에 담기는 카메라 프레이밍 값을 계산한다.
 *
 * @param {{ halfExtents:{x:number,y:number,z:number}, dir:{x:number,y:number,z:number},
 *           up:{x:number,y:number,z:number}, fovDeg?:number, aspect?:number, margin?:number }} opts
 * @returns {{ distance:number, orthoHalfHeight:number, halfWidth:number, halfHeight:number, halfDepth:number }}
 */
function computeFitFraming({ halfExtents, dir, up, fovDeg = 45, aspect = 1, margin = FIT_MARGIN }) {
  const h = {
    x: Math.abs(halfExtents?.x ?? 0),
    y: Math.abs(halfExtents?.y ?? 0),
    z: Math.abs(halfExtents?.z ?? 0),
  }
  const d = _normalized(dir ?? {}) ?? { x: 0, y: 0, z: 1 }

  // 화면 가로축(right) — up 이 시선과 평행하면 외적이 0 이라 대체 축으로 다시 만든다.
  let right = _normalized(_cross(up ?? { x: 0, y: 0, z: 1 }, d))
  if (!right) {
    const alt = Math.abs(d.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
    right = _normalized(_cross(alt, d)) ?? { x: 1, y: 0, z: 0 }
  }
  // 화면 세로축 — right 와 시선에 직교하므로 up 이 비스듬해도 정규직교가 보장된다.
  const camUp = _normalized(_cross(d, right)) ?? { x: 0, y: 0, z: 1 }

  const halfWidth  = _projectedHalf(right, h) * margin
  const halfHeight = _projectedHalf(camUp, h) * margin
  const halfDepth  = _projectedHalf(d, h)

  const a = aspect > 0 ? aspect : 1
  const tanV = Math.tan((fovDeg * Math.PI / 180) / 2)
  // 세로 화각과 가로 화각(=세로×aspect) 중 더 빡빡한 쪽이 거리를 정한다.
  // 모델 앞면이 near 로 잘리지 않도록 깊이 절반을 더한다.
  const fitDist = Math.max(halfHeight / tanV, halfWidth / (tanV * a))
  const distance = Math.max(fitDist + halfDepth, 1e-3)

  // 직교는 거리가 아니라 frustum 반높이가 배율 — 가로가 넘치면 aspect 로 환산해 키운다.
  const orthoHalfHeight = Math.max(halfHeight, halfWidth / a, 1e-4)

  return { distance, orthoHalfHeight, halfWidth, halfHeight, halfDepth }
}

/**
 * 기준점(pivot)에서 잰 모델 bbox 반extent 를 scene 단위(m)로 반환한다.
 *
 * 이 스튜디오는 회전 중심을 무게중심(CoG)에 고정하므로 프레이밍 기준점이 bbox 중심이
 * 아닐 수 있다. 직교 frustum 은 타깃을 중심으로 대칭이라, bbox 중심 기준 반extent 를
 * 그대로 쓰면 CoG 가 치우친 모델에서 반대쪽 끝이 화면 밖으로 잘린다. 그래서 "먼 쪽 면까지의
 * 거리"를 반extent 로 삼아 어떤 pivot 에서도 전체가 남게 한다.
 *
 * @param {{bbox?:object, center?:{x:number,y:number,z:number}}} stageData
 * @param {{x:number,y:number,z:number}|null} pivot  scene 좌표(m). null 이면 bbox 중심.
 */
function sceneHalfExtentsAbout(stageData, pivot) {
  const b = stageData?.bbox
  if (!b) return { x: 0.5, y: 0.5, z: 0.5 }
  const c = stageData.center ?? { x: 0, y: 0, z: 0 }
  const p = pivot ?? { x: 0, y: 0, z: 0 }

  const half = (min, max, cc, pp) => {
    const lo = (min - cc) / 1000
    const hi = (max - cc) / 1000
    return Math.max(Math.abs(hi - pp), Math.abs(pp - lo), 0)
  }
  return {
    x: half(b.minX, b.maxX, c.x, p.x ?? 0),
    y: half(b.minY, b.maxY, c.y, p.y ?? 0),
    z: half(b.minZ, b.maxZ, c.z, p.z ?? 0),
  }
}

export { computeFitFraming, sceneHalfExtentsAbout, STANDARD_VIEWS, FIT_MARGIN }
