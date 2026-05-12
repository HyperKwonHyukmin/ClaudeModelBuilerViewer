import * as THREE from 'three'

/**
 * SlingAngleOverlay — Stage 4 (SlingAngleInspector) 의 60° 미만 와이어를 시각화.
 *
 * Stage 3 결과의 calculatedTopPointMm (apex 좌표) 와 Stage 4 결과의
 * results[].wires[].safe=false 정보를 결합해 lug ↔ apex 빨간 라인 + 각도 라벨을 그린다.
 *
 * StabilityIssueOverlay (Stage 5 element 단위) 와 다르게 wire 자체는 stage data
 * 의 element 가 아니므로 직접 좌표 두 점을 잇는 LineSegments 로 그린다.
 *
 * 사용자는 패널 메시지에서 "G3 L621: 55.82°" 같은 식별자를 보고 viewer 의 같은
 * 와이어를 시각적으로 확인할 수 있다.
 */

const ISSUE_COLOR = 0xFF5566   // StabilityIssueOverlay 와 동일 톤

export function buildSlingAngleOverlay(report, stageData) {
  const root = new THREE.Group()
  root.name = 'SlingAngleOverlay'
  if (!report || !stageData) return root

  const stages = Array.isArray(report.stages) ? report.stages : []
  const stage3 = stages.find(s => s.stage === 3)
  const stage4 = stages.find(s => s.stage === 4)
  if (!stage3 || !stage4) return root

  // groupId → apex Vector3 (Stage 3 의 calculatedTopPointMm)
  // lug 좌표는 stageData.getNodePos 가 scene(m) + stageData.center 보정 후 값을 반환하므로,
  // apex 도 동일하게 (mm − center) / 1000 으로 변환해야 빨간 라인이 lug ↔ apex 짧은 거리로 정상 표시된다.
  // 변환 누락 시 apex 가 mm 값(수천) 그대로 scene 에 찍혀 화면 끝까지 뻗는 비정상 직선이 그려진다.
  const c = stageData.center
  const apexByGroup = new Map()
  for (const r of (Array.isArray(stage3.results) ? stage3.results : [])) {
    const a = r?.calculatedTopPointMm
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)) {
      apexByGroup.set(r.groupId, new THREE.Vector3(
        (a.x - c.x) / 1000,
        (a.y - c.y) / 1000,
        (a.z - c.z) / 1000,
      ))
    }
  }
  if (apexByGroup.size === 0) return root

  // Stage 4 의 unsafe wire 들을 모음
  const positions = []
  const labels = []
  for (const r of (Array.isArray(stage4.results) ? stage4.results : [])) {
    const apex = apexByGroup.get(r.groupId)
    if (!apex) continue
    for (const w of (Array.isArray(r?.wires) ? r.wires : [])) {
      if (w?.safe !== false) continue
      const lug = stageData.getNodePos?.(w.lugNodeId)
      if (!lug) continue
      // line segment 양 끝점
      positions.push(lug.x, lug.y, lug.z, apex.x, apex.y, apex.z)
      // mid 위치에 라벨
      const mid = new THREE.Vector3().addVectors(lug, apex).multiplyScalar(0.5)
      labels.push({
        pos: mid,
        text: `L${w.lugNodeId} ${formatAngle(w.angleDeg)}°`,
      })
    }
  }
  if (positions.length === 0) return root

  // 빨간 LineSegments
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({
    color: ISSUE_COLOR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    linewidth: 2,
  })
  const lines = new THREE.LineSegments(geom, mat)
  lines.renderOrder = 84
  root.add(lines)

  // 라벨 (sprite) — 각 와이어 중간점
  for (const { pos, text } of labels) {
    const sprite = makeAngleLabel(text)
    sprite.position.copy(pos)
    sprite.position.z += 0.20  // 살짝 위로 띄움
    root.add(sprite)
  }

  return root
}

function formatAngle(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '-'
}

function makeAngleLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 280
  canvas.height = 76
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 24px sans-serif'
  const tw = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(118, tw + 28))
  const x = (canvas.width - boxW) / 2
  const y = 14
  const h = 42

  ctx.fillStyle = 'rgba(35, 4, 12, 0.92)'
  ctx.strokeStyle = '#FF5566'
  ctx.lineWidth = 3
  roundRect(ctx, x, y, boxW, h, 8)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#FFE1E5'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  sprite.scale.set(1.15, 0.32, 1)
  sprite.renderOrder = 85
  return sprite
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

export function hasSlingAngleIssues(report) {
  const stage4 = (report?.stages ?? []).find(s => s?.stage === 4)
  if (!stage4) return false
  for (const r of (stage4.results ?? [])) {
    for (const w of (r?.wires ?? [])) {
      if (w?.safe === false) return true
    }
  }
  return false
}
