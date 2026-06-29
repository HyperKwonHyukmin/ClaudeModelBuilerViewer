import { create } from 'zustand'
import { useStageStore } from './useStageStore.js'
import { computeMassFallback } from './useEditStore.js'
import {
  projectNodesXY, computeInitialDividers, clampDivider, splitRegions,
  assignNodesToRegions, regionCenter, suggestPointsForRegion,
} from '../data/hoistAutoLayout.js'

const DIV_MIN = 1, DIV_MAX = 6, MIN_POINTS = 2
const clampDiv = (v) => Math.min(DIV_MAX, Math.max(DIV_MIN, Math.round(v || 1)))
const clampCount = (v) => Math.max(MIN_POINTS, Math.round(v || MIN_POINTS))

// 무게중심: stageSummary 우선(회전/유체비움 시 stale → 무시), 폴백 computeMassFallback, 최종 bbox 중심.
function resolveCog(stage) {
  const st = useStageStore.getState()
  const summary = (st.pipeFluidEmptied || st.modelRotated) ? null : st.stageSummary
  const c = summary?.massProperties?.centerOfGravityMm
  if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: c.x, y: c.y, source: 'stageSummary' }
  const fb = computeMassFallback(stage)
  if (fb.centerOfGravityMm) return { x: fb.centerOfGravityMm.x, y: fb.centerOfGravityMm.y, source: fb.source }
  if (stage?.center) return { x: stage.center.x, y: stage.center.y, source: 'bboxCenter' }
  return { x: 0, y: 0, source: 'unavailable' }
}

function buildMassByNode(stage) {
  const m = new Map()
  for (const pm of stage?.pointMasses ?? []) {
    if (pm.mass > 0) m.set(pm.nodeId, (m.get(pm.nodeId) ?? 0) + pm.mass)
  }
  return m
}

export const useHoistLayoutStore = create((set, get) => ({
  open: false,
  divX: 1, divY: 2,
  dividersX: [], dividersY: [],
  bbox: null, cog: null, cogSource: null,
  projectedNodes: [], massByNode: null,
  pointsPerRegion: {}, suggestions: {}, overrides: {}, warnings: {},

  openEditor: () => {
    const stages = useStageStore.getState().stages
    const stage = Array.isArray(stages) && stages.length ? stages[stages.length - 1] : null
    if (!stage) { set({ open: true, bbox: null, cog: null, projectedNodes: [], suggestions: {}, warnings: {} }); return }
    const bbox = stage.bbox
    const cog = resolveCog(stage)
    const projectedNodes = projectNodesXY(stage)
    const massByNode = buildMassByNode(stage)
    const { divX, divY } = get()
    const { dividersX, dividersY } = computeInitialDividers(bbox, cog, divX, divY)
    set({ open: true, bbox, cog, cogSource: cog.source, projectedNodes, massByNode, dividersX, dividersY })
    get()._reseedCounts()
    get().recomputeAll()
  },

  closeEditor: () => set({ open: false }),

  setDivX: (n) => { set({ divX: clampDiv(n) }); get()._reanchor() },
  setDivY: (n) => { set({ divY: clampDiv(n) }); get()._reanchor() },

  setDividerX: (i, xMm) => {
    const { dividersX, bbox } = get()
    if (!bbox || i < 0 || i >= dividersX.length) return
    const lo = i === 0 ? bbox.minX : dividersX[i - 1]
    const hi = i === dividersX.length - 1 ? bbox.maxX : dividersX[i + 1]
    const next = dividersX.slice(); next[i] = clampDivider(xMm, lo, hi)
    set({ dividersX: next }); get().recomputeAll()
  },
  setDividerY: (i, yMm) => {
    const { dividersY, bbox } = get()
    if (!bbox || i < 0 || i >= dividersY.length) return
    const lo = i === 0 ? bbox.minY : dividersY[i - 1]
    const hi = i === dividersY.length - 1 ? bbox.maxY : dividersY[i + 1]
    const next = dividersY.slice(); next[i] = clampDivider(yMm, lo, hi)
    set({ dividersY: next }); get().recomputeAll()
  },

  setRegionPointCount: (regionId, n) => {
    const pointsPerRegion = { ...get().pointsPerRegion, [regionId]: clampCount(n) }
    const overrides = { ...get().overrides }; delete overrides[regionId]  // 개수 변경 → override 초기화
    set({ pointsPerRegion, overrides })
    get().recomputeAll()
  },

  setRegionPoints: (regionId, nodeIds) => {
    set({
      overrides: { ...get().overrides, [regionId]: [...nodeIds] },
      suggestions: { ...get().suggestions, [regionId]: [...nodeIds] },  // 즉시 반영(마커 드래그 피드백)
    })
  },

  // 내부: 분할선 재배치(무게중심 기준) + 맵 리셋 + 재제안
  _reanchor: () => {
    const { bbox, cog, divX, divY } = get()
    if (!bbox) return
    const { dividersX, dividersY } = computeInitialDividers(bbox, cog, divX, divY)
    set({ dividersX, dividersY })
    get()._reseedCounts()
    get().recomputeAll()
  },

  // 내부: 현재 분할선 기준 구역들의 포인트 개수를 2(또는 기존값)로 시드, override/제안 비움
  _reseedCounts: () => {
    const { bbox, dividersX, dividersY, pointsPerRegion: prev } = get()
    const regions = bbox ? splitRegions(bbox, dividersX, dividersY) : []
    const pointsPerRegion = {}
    for (const r of regions) pointsPerRegion[r.id] = clampCount(prev[r.id] ?? MIN_POINTS)
    set({ pointsPerRegion, suggestions: {}, overrides: {}, warnings: {} })
  },

  recomputeAll: () => {
    const { bbox, dividersX, dividersY, projectedNodes, massByNode, pointsPerRegion, overrides } = get()
    if (!bbox) { set({ suggestions: {}, warnings: {} }); return }
    const regions = splitRegions(bbox, dividersX, dividersY)
    const assign = assignNodesToRegions(projectedNodes, regions, dividersX, dividersY)
    const byId = new Map(projectedNodes.map(p => [p.id, p]))
    const suggestions = {}, warnings = {}
    for (const r of regions) {
      if (overrides[r.id]) { suggestions[r.id] = overrides[r.id]; continue }
      const nodes = (assign[r.id] ?? []).map(id => byId.get(id)).filter(Boolean)
      const center = regionCenter(nodes, massByNode) ?? { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 }
      const n = clampCount(pointsPerRegion[r.id] ?? MIN_POINTS)
      const res = suggestPointsForRegion(nodes, center, n, r)
      suggestions[r.id] = res.nodeIds
      if (res.warning) warnings[r.id] = res.warning
    }
    set({ suggestions, warnings })
  },
}))
