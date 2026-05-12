import * as THREE from 'three'

const LABEL_SCALE = 0.09        // 약 90mm — 줌인 시 분간 가능한 최소 크기
const FONT_PX     = 56          // 텍스처 캔버스 글자 크기
const PAD_PX      = 14
const BG_RGBA     = 'rgba(10, 10, 24, 0.78)'
const FG_COLOR    = '#FFE066'   // 따뜻한 노랑 — 배경(짙은 남청)과 강한 대비

/**
 * cm 코드별로 텍스처를 캐시.
 * 동일 cm("23", "13", "123456" 등)을 가진 sprite는 같은 Material을 공유 → GPU 메모리·draw call 절감.
 */
function makeCmTexture(cm) {
  const text = String(cm ?? '')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // 1차 측정으로 너비 산출
  ctx.font = `bold ${FONT_PX}px monospace`
  const w = Math.ceil(ctx.measureText(text).width) + PAD_PX * 2
  const h = FONT_PX + PAD_PX * 2
  canvas.width  = w
  canvas.height = h

  // 다시 폰트 설정 (canvas 리사이즈 시 컨텍스트 리셋됨)
  ctx.font         = `bold ${FONT_PX}px monospace`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  // 둥근 사각 배경
  ctx.fillStyle = BG_RGBA
  const r = 14
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r)
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h)
  ctx.lineTo(r, h);     ctx.quadraticCurveTo(0, h, 0, h - r)
  ctx.lineTo(0, r);     ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fill()

  // 외곽선 (살짝)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 텍스트
  ctx.fillStyle = FG_COLOR
  ctx.fillText(text, w / 2, h / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  tex.needsUpdate = true
  return { texture: tex, aspect: w / h }
}

/**
 * U-bolt RBE (remark === 'UBOLT')의 independent node 위치에 cm DOF 코드 텍스트를 붙인 Sprite Group을 만든다.
 * 동일 cm을 가진 sprite는 같은 SpriteMaterial(텍스처)을 공유한다 — 189개 sprite가 7개 머티리얼 안쪽으로 묶인다.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildUboltDofLabels(stageData) {
  const group = new THREE.Group()
  const ubolts = (stageData.rigids ?? []).filter(r => r.remark === 'UBOLT' && r.cm != null)
  if (ubolts.length === 0) return group

  // cm별 텍스처/머티리얼 캐시
  const matCache = new Map()
  const getMaterial = (cm) => {
    let entry = matCache.get(cm)
    if (entry) return entry
    const { texture, aspect } = makeCmTexture(cm)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,    // 모델에 가려져도 보이도록 (DOF 검증이 목적)
      depthWrite: false,
      sizeAttenuation: true,
    })
    entry = { material, texture, aspect }
    matCache.set(cm, entry)
    return entry
  }

  for (const r of ubolts) {
    const pos = stageData.getNodePos(r.independentNode)
    if (!pos) continue
    const { material, aspect } = getMaterial(r.cm)
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(pos)
    sprite.scale.set(LABEL_SCALE * aspect, LABEL_SCALE, 1)
    sprite.renderOrder = 999    // 다른 객체보다 늦게 그려져 위에 오도록
    sprite.userData = { type: 'uboltDofLabel', rigidId: r.id, cm: r.cm, nodeId: r.independentNode }
    group.add(sprite)
  }

  // disposeScene 헬퍼가 sprite material/texture를 정리할 수 있도록 자식에 부착되어 있음
  return group
}
