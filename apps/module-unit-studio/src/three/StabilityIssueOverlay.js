import * as THREE from 'three'
import { buildElementsHighlight } from './SelectionHighlight.js'

// 응력 초과(빨강 0xFF5566)와 헷갈리지 않도록 간섭 element 는 진한 보라로 구분.
// 권상 그룹 2 의 보라(0xB57CFF)와 톤 차이를 두기 위해 채도/명도가 더 강한 0x9D3DFF.
const ISSUE_COLOR = 0x9D3DFF

export function getStabilityIssueElementIds(report) {
  const ids = new Set()

  const warnings = report?.overall?.userSummary?.warnings
  if (Array.isArray(warnings)) {
    for (const w of warnings) {
      const id = Number(w?.metrics?.elementId)
      if (Number.isInteger(id)) ids.add(id)
    }
  }

  const stages = Array.isArray(report?.stages) ? report.stages : []
  for (const stage of stages) {
    const conflicts = Array.isArray(stage?.conflicts) ? stage.conflicts : []
    for (const c of conflicts) {
      const id = Number(c?.elementId)
      if (Number.isInteger(id)) ids.add(id)
    }
  }

  return [...ids]
}

/**
 * @param {object} report
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {{ deletedElementIds?: Set<number> }} [opts]
 *   분석 이후 사용자가 추가로 삭제한 element 는 시각화에서 제외해야 한다 (분석 결과는 stale 이지만
 *   사용자가 즉시 반영을 기대하므로 overlay 단에서 필터링).
 */
export function buildStabilityIssueOverlay(report, stageData, opts = {}) {
  const root = new THREE.Group()
  root.name = 'StabilityIssueOverlay'
  if (!report || !stageData) return root

  const deletedElementIds = opts.deletedElementIds ?? null
  const elementIds = getStabilityIssueElementIds(report)
    .filter(id => !deletedElementIds || !deletedElementIds.has(id))
  if (elementIds.length === 0) return root

  const highlight = buildElementsHighlight(elementIds, stageData)
  if (highlight.children.length > 0) {
    highlight.traverse(obj => {
      if (obj.material?.color) obj.material.color.setHex(ISSUE_COLOR)
      if (obj.material) obj.material.opacity = 0.92
      obj.renderOrder = 82
    })
    root.add(highlight)
  }

  for (const elementId of elementIds) {
    const elem = stageData.elements.find(e => e.id === elementId)
    if (!elem) continue
    const a = stageData.getNodePos(elem.startNode)
    const b = stageData.getNodePos(elem.endNode)
    if (!a || !b) continue
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
    const label = makeIssueLabel(`간섭 E${elementId}`)
    label.position.set(mid.x, mid.y, mid.z + 0.28)
    root.add(label)
  }

  return root
}

function makeIssueLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 260
  canvas.height = 76
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 26px sans-serif'
  const textWidth = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(118, textWidth + 28))
  const x = (canvas.width - boxW) / 2
  const y = 14
  const h = 42

  ctx.fillStyle = 'rgba(22, 6, 38, 0.92)'
  ctx.strokeStyle = '#9D3DFF'
  ctx.lineWidth = 3
  roundRect(ctx, x, y, boxW, h, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#EEDDFF'
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
  sprite.scale.set(1.06, 0.31, 1)
  sprite.renderOrder = 83
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
