import { describe, it, expect } from 'vitest'
import { buildFieldGuide, hullXY, measurePlacement, directionXY, hasPendingGuideMassEdits } from './hoistFieldGuide.js'
import { buildHoistFieldOverlay } from '../three/HoistFieldOverlay.js'
import { disposeScene } from '../three/SceneBuilder.js'
import { compareCandidates, normalizeCandidate } from './hoistCandidateRank.js'
import { adaptStabilityReportToCandidate } from './hoistStabilityAdapter.js'

const p = (x, y, z = 0) => ({ x, y, z })
function input(points, cog = p(0, 0)) {
  return { stageData: { nodeMap: new Map(points.map((v, i) => [i + 1, v])), elements: points.map((_, i) => ({ id: i + 1, startNode: i + 1, endNode: i + 1 })) }, groups: Object.fromEntries(points.map((_, i) => [i + 1, [i + 1]])), cog, wireLengthM: 8, mode: 'hydro' }
}
const square = [p(-1000, -1000), p(1000, -1000), p(1000, 1000), p(-1000, 1000)]

describe('field screening guidance', () => {
  it('does not hide guidance for already-applied fluid/rotation intents', () => {
    expect(hasPendingGuideMassEdits([{ kind: 'emptyPipeFluid' }, { kind: 'rotateModel' }, { kind: 'addRigid' }])).toBe(false)
    expect(hasPendingGuideMassEdits([{ kind: 'deleteGroup' }])).toBe(true)
  })
  it('only uses engine apexes matching the current mode, height, membership and geometry', () => {
    const a = input(square)
    a.report = { input: { liftingMode: { id: 'hydro' }, wireLengthMm: 8000 }, visualization: {
      apexes: square.map((v, i) => ({ groupId: i + 1, assignedNodeIds: [i + 1], pointMm: { ...v, z: 8000 } })),
      wires: square.map((v, i) => ({ lugNodeId: i + 1, endMm: v })),
    } }
    expect(buildFieldGuide(a).source).toContain('엔진 정점')
    expect(buildFieldGuide({ ...a, wireLengthM: 9 }).source).toContain('미리보기')
    expect(buildFieldGuide({ ...a, mode: 'goliat' }).source).toContain('분할 미반영')
    a.report.visualization.wires[0].endMm = p(999, 999)
    expect(buildFieldGuide(a).source).toContain('미리보기')
    delete a.report.input.wireLengthMm
    expect(buildFieldGuide(a).source).toContain('미리보기')
  })
  it('uses the lifting footprint, not the model bbox; polygon inside never claims zero physical tilt', () => {
    const g = buildFieldGuide(input(square))
    expect(g.nominal.inside).toBe(true)
    expect(g.nominal.signedMarginMm).toBe(1000)
    expect(g.tiltDeg).toBeNull()
    expect(g.caution).toBe(false)
  })
  it('uses closest finite segment, including beyond the end', () => {
    const m = measurePlacement(hullXY([p(0, 0), p(1000, 0)]), p(1500, 200))
    expect(m.deviationMm).toBeCloseTo(Math.hypot(500, 200))
    expect(m.nearest.x).toBe(1000)
  })
  it('shows eccentricity and actionable model-axis direction', () => {
    const g = buildFieldGuide(input(square, p(1300, 0)))
    expect(g.direction).toBe('+X')
    expect(g.nominal.deviationMm).toBe(300)
    expect(g.actions.some(a => a.groupId && a.text.includes('+X'))).toBe(true)
  })
  it('nominal inside but tolerance outside is reported separately', () => {
    const g = buildFieldGuide({ ...input(square, p(950, 0)), tolerance: { enabled: true, x: 100, y: 20, z: 50 } })
    expect(g.nominal.inside).toBe(true)
    expect(g.worst.inside).toBe(false)
    expect(g.worst.deviationMm).toBe(50)
    expect(g.heightMm).toBe(7950)
  })
  it('interior envelope chooses the smallest margin, not the first corner', () => {
    const g = buildFieldGuide({ ...input(square, p(700, 0)), tolerance: { enabled: true, x: 100, y: 20, z: 0 } })
    expect(g.worst.signedMarginMm).toBe(200)
  })
  it('does not convert missing tolerance/COG to zero', () => {
    expect(buildFieldGuide({ ...input(square), cog: null }).available).toBe(false)
    const g = buildFieldGuide({ ...input(square), tolerance: { enabled: true, x: null, y: 0, z: 0 } })
    expect(g.toleranceApplied).toBe(false)
    expect(g.actions.some(a => a.text.includes('미고려'))).toBe(true)
  })
  it('reports duplicate, deleted and unconnected nodes', () => {
    const a = input(square)
    a.groups[2] = [1, 2]
    a.stageData.elements = []
    a.deleteMask = { deletedNodeIds: new Set([3]) }
    const g = buildFieldGuide(a)
    expect(g.actions.some(a => a.text.includes('중복'))).toBe(true)
    expect(g.actions.some(a => a.nodeId === 3)).toBe(true)
    expect(g.actions.some(a => a.text.includes('하중 전달'))).toBe(true)
  })
  it('handles collinear/duplicate apexes and unknown height without NaN', () => {
    expect(hullXY([p(0, 0), p(0, 0), p(1, 0), p(2, 0)])).toHaveLength(2)
    const g = buildFieldGuide({ ...input([p(0, 0)], p(250, 0)), wireLengthM: null })
    expect(g.tiltDeg).toBeNull()
    expect(g.heightMm).toBeNull()
    expect(directionXY(-2, 3)).toBe('−X / +Y')
  })
  it('overlay is visible through beams, non-pickable and disposable', () => {
    const g = buildFieldGuide(input(square, p(1300, 0)))
    const overlay = buildHoistFieldOverlay(g, p(500, 500))
    expect(overlay.getObjectByName('FieldCog').material.sizeAttenuation).toBe(false)
    overlay.traverse(o => {
      if (o.material) expect(o.material.depthTest).toBe(false)
      const hits = []; o.raycast({}, hits); expect(hits).toHaveLength(0)
    })
    disposeScene(overlay)
  })
  it('keeps WARN tier; new advisory only orders within the same status', () => {
    const c = (status, priority, score) => normalizeCandidate({ overallStatus: status, score, metrics: { fieldReviewPriority: priority } })
    expect(compareCandidates(c('pass', 1, 1), c('warn', 0, 999))).toBeLessThan(0)
    expect(compareCandidates(c('warn', 0, 1), c('warn', 1, 999))).toBeLessThan(0)
  })
  it('accepts actual engine stage keys and propagates advisory metrics', () => {
    const c = adaptStabilityReportToCandidate({ stages: [{ stage: 6, status: 'warn', summary: { tiltAngleDeg: 14, cogEnvelopeApplied: true } }] }, { groups: [[1, 2]] })
    expect(c.overallStatus).toBe('warn')
    expect(c.metrics.fieldReviewPriority).toBe(1)
    expect(c.metrics.cogEnvelopeApplied).toBe(true)
  })
})
