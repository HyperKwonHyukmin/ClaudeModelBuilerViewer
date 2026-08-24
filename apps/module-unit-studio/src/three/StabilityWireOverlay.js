import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const GROUP_COLORS = {
  1: 0x00D1FF,  // cyan
  2: 0xB57CFF,  // 보라
  3: 0x6AE07A,  // 녹색
  4: 0xFF66AA,  // 핫핑크
}

const APEX_R = 0.16

export function buildStabilityWireOverlay(report, stageData, resolution) {
  const root = new THREE.Group()
  root.name = 'StabilityWireOverlay'
  if (!report || !stageData) return root

  const wires = Array.isArray(report?.visualization?.wires)
    ? report.visualization.wires
    : []
  if (wires.length === 0) return root

  const res = new THREE.Vector2(
    Math.max(resolution?.width ?? 1, 1),
    Math.max(resolution?.height ?? 1, 1),
  )

  const apexKeySet = new Set()
  for (const wire of wires) {
    const start = scenePoint(wire.startMm, stageData)
    const end = scenePoint(wire.endMm, stageData)
    if (!start || !end) continue

    const groupId = Number(wire.groupId)
    const color = GROUP_COLORS[groupId] ?? 0x90E8FF
    const line = makeLine(start, end, color, wire.safe === false ? 4 : 3, res)
    root.add(line)

    const apexKey = `${groupId}:${wire.startMm?.x}:${wire.startMm?.y}:${wire.startMm?.z}`
    if (!apexKeySet.has(apexKey)) {
      apexKeySet.add(apexKey)
      root.add(makeApexMarker(start, groupId, color))
    }
    // wire 중간 라벨은 권상 해석 이후 NastranResultOverlay 에서만 표시 — BDF wireElementId 가
    // 이 시점엔 부여되지 않았으므로 식별자 라벨 표기 보류.
  }

  return root
}

function scenePoint(pointMm, stageData) {
  if (!pointMm || !Number.isFinite(pointMm.x) || !Number.isFinite(pointMm.y) || !Number.isFinite(pointMm.z)) {
    return null
  }
  const c = stageData.center
  return new THREE.Vector3(
    (pointMm.x - c.x) / 1000,
    (pointMm.y - c.y) / 1000,
    (pointMm.z - c.z) / 1000,
  )
}

function makeLine(start, end, color, linePx, resolution) {
  const geo = new LineGeometry()
  geo.setPositions([start.x, start.y, start.z, end.x, end.y, end.z])
  const mat = new LineMaterial({
    color,
    linewidth: linePx,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    dashed: false,
  })
  mat.resolution.copy(resolution)
  mat.worldUnits = false
  const line = new Line2(geo, mat)
  line.computeLineDistances()
  // renderOrder 76~78 대역 — HoistGroupCog(70~72)·NastranResult 버킷(70~74)과 겹치지 않게 분리해
  // (동률 renderOrder 시 회전각에 따라 wire 가 가려졌다 보였다 하던 비결정 오버랩을 제거).
  line.renderOrder = 76
  return line
}

function makeApexMarker(pos, groupId, color) {
  const group = new THREE.Group()
  group.name = `StabilityApexG${groupId}`

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(APEX_R, 20, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    }),
  )
  sphere.position.copy(pos)
  sphere.renderOrder = 77
  group.add(sphere)

  const label = makeLabel(`G${groupId} TOP`, color)
  label.position.set(pos.x, pos.y, pos.z + APEX_R * 2.7)
  group.add(label)

  return group
}

function makeLabel(text, color) {
  const css = `#${color.toString(16).padStart(6, '0')}`
  const canvas = document.createElement('canvas')
  canvas.width = 220
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 26px sans-serif'
  const textWidth = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(92, textWidth + 24))
  const x = (canvas.width - boxW) / 2
  const y = 13
  const h = 40

  ctx.fillStyle = 'rgba(8, 8, 20, 0.86)'
  ctx.strokeStyle = css
  ctx.lineWidth = 3
  roundRect(ctx, x, y, boxW, h, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
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
  sprite.scale.set(0.9, 0.29, 1)
  sprite.renderOrder = 78
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
