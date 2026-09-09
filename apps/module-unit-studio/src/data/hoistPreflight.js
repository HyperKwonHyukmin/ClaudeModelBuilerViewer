const MIN_AREA_RATIO = 0.10
const MIN_SPAN_RATIO = 0.35

export function evaluateHoistFootprint(groups, stage) {
  if (!stage?.nodeMap?.size) return { ok: false, blocking: ['모델 Node를 확인할 수 없습니다.'] }
  const ids = [...new Set(Object.values(groups ?? {}).flat())]
  const points = ids.map(id => stage.nodeMap.get(id)).filter(Boolean).map(n => ({ x: Number(n.x), y: Number(n.y) }))
  if (points.length < 2) return { ok: false, blocking: ['권상점을 2개 이상 지정하세요.'], pointCount: points.length }

  const width = Math.max(0, Number(stage.bbox?.maxX) - Number(stage.bbox?.minX))
  const depth = Math.max(0, Number(stage.bbox?.maxY) - Number(stage.bbox?.minY))
  const modelArea = width * depth
  const modelDiagonal = Math.hypot(width, depth)
  const span = maximumSpan(points)
  const spanRatio = modelDiagonal > 0 ? span / modelDiagonal : 0
  const area = points.length >= 3 ? polygonArea(convexHull(points)) : 0
  const areaRatio = modelArea > 0 ? area / modelArea : 0
  const blocking = []

  if (points.length >= 3 && modelArea > 0 && areaRatio < MIN_AREA_RATIO) {
    blocking.push(`권상점 지지 면적이 모델 평면 면적의 ${(areaRatio * 100).toFixed(1)}%로 너무 좁습니다. (최소 ${MIN_AREA_RATIO * 100}%)`)
  } else if (points.length === 2 && modelDiagonal > 0 && spanRatio < MIN_SPAN_RATIO) {
    blocking.push(`두 권상점 간격이 모델 평면 대각의 ${(spanRatio * 100).toFixed(1)}%로 너무 좁습니다. (최소 ${MIN_SPAN_RATIO * 100}%)`)
  }

  return { ok: blocking.length === 0, blocking, pointCount: points.length, area, areaRatio, span, spanRatio }
}

function maximumSpan(points) {
  let max = 0
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    max = Math.max(max, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
  }
  return max
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length <= 2) return sorted
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p) }
  const upper = []
  for (const p of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p) }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

function polygonArea(points) {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export const HOIST_FOOTPRINT_LIMITS = { minAreaRatio: MIN_AREA_RATIO, minSpanRatio: MIN_SPAN_RATIO }
