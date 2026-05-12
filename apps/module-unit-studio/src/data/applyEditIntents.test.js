import { describe, it, expect } from 'vitest'
import { computeDeleteMask, isEmptyDeleteMask } from './applyEditIntents.js'
import { createIntent } from './EditIntent.js'
import { StageData } from './StageData.js'

const makeStage = (overrides = {}) => new StageData({
  meta: { phase: 'C', stageName: 'C_Final', timestamp: '20260429_120000', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: [] },
    { id: 3, x: 2000, y: 0, z: 0, tags: [] },
    { id: 4, x: 3000, y: 0, z: 0, tags: [] },
    { id: 5, x: 4000, y: 0, z: 0, tags: [] },
  ],
  elements: [
    { id: 100, type: 'BEAM', startNode: 1, endNode: 2, category: 'Pipe',      propertyId: 1, sourceName: 'g0a' },
    { id: 101, type: 'BEAM', startNode: 2, endNode: 3, category: 'Pipe',      propertyId: 1, sourceName: 'g0b' },
    { id: 200, type: 'BEAM', startNode: 4, endNode: 5, category: 'Structure', propertyId: 1, sourceName: 'g1a' },
  ],
  rigids: [],
  properties: [], materials: [], pointMasses: [],
  // 두 그룹: 0 = {1,2,3} elements 100,101 ; 1 = {4,5} element 200
  connectivity: {
    groupCount: 2, largestGroupNodeCount: 3, isolatedNodeCount: 0,
    groups: [
      { id: 0, nodeIds: [1, 2, 3], elementIds: [100, 101] },
      { id: 1, nodeIds: [4, 5],    elementIds: [200] },
    ],
  },
  healthMetrics: {
    totals: { nodeCount: 5, elementCount: 0, rigidCount: 0, pointMassCount: 0,
      bbox: { minX: 0, maxX: 4000, minY: 0, maxY: 0, minZ: 0, maxZ: 0 } },
    issues: {},
  },
  ...overrides,
})

describe('computeDeleteMask', () => {
  it('빈 intents → 모든 set 비어 있음, derived 카운트 = 원본', () => {
    const stage = makeStage()
    const mask = computeDeleteMask(stage, [])
    expect(mask.deletedNodeIds.size).toBe(0)
    expect(mask.deletedElementIds.size).toBe(0)
    expect(mask.brokenRbeIds.size).toBe(0)
    expect(mask.deletedGroupIds.size).toBe(0)
    expect(mask.derivedGroupCount).toBe(2)
    expect(mask.derivedNodeCount).toBe(5)
    expect(mask.derivedRigidCount).toBe(0)
  })

  it('derived totals — 그룹 0 삭제 후 노드/요소/RBE/Mass 카운트', () => {
    const stage = makeStage({
      rigids: [
        { id: 50, independentNode: 1, dependentNodes: [4], remark: null, sourceName: 'x' },  // broken
        { id: 51, independentNode: 4, dependentNodes: [5], remark: null, sourceName: 'x' },  // untouched
      ],
      pointMasses: [
        { id: 11, nodeId: 1, mass: 1.0, sourceName: 'x' },
        { id: 12, nodeId: 5, mass: 2.0, sourceName: 'x' },
      ],
    })
    const mask = computeDeleteMask(stage, [createIntent('deleteGroup', { groupId: 0 })])
    // 그룹 0(노드 1,2,3) 삭제: 노드 5→2, BEAM 3→1(100,101 삭제), RBE 2(둘 다 살아있음 — 50은 broken이지만 fully-removed 아님), Mass 2→1
    expect(mask.derivedNodeCount).toBe(2)
    expect(mask.derivedElementCount).toBe(1)
    expect(mask.derivedRigidCount).toBe(2)
    expect(mask.derivedPointMassCount).toBe(1)
    expect(mask.brokenRbeCount).toBe(1)
    expect(mask.deletedMassIds.has(11)).toBe(true)
    expect(mask.fullyRemovedRbeIds.size).toBe(0)
  })

  it('fullyRemovedRbeIds — 독립과 모든 종속이 함께 삭제', () => {
    const stage = makeStage({
      rigids: [{ id: 99, independentNode: 1, dependentNodes: [2, 3], remark: null, sourceName: 'x' }],
    })
    const mask = computeDeleteMask(stage, [createIntent('deleteGroup', { groupId: 0 })])
    expect(mask.fullyRemovedRbeIds.has(99)).toBe(true)
    expect(mask.brokenRbeIds.has(99)).toBe(false)
    expect(mask.derivedRigidCount).toBe(0)
  })

  it('deleteGroup intent 가 그룹의 노드/엘리먼트를 모두 마스킹한다', () => {
    const stage = makeStage()
    const intents = [createIntent('deleteGroup', { groupId: 0 })]
    const mask = computeDeleteMask(stage, intents)
    expect([...mask.deletedNodeIds]).toEqual(expect.arrayContaining([1, 2, 3]))
    expect([...mask.deletedElementIds].sort()).toEqual([100, 101])
    expect(mask.deletedGroupIds.has(0)).toBe(true)
    expect(mask.derivedGroupCount).toBe(1)
  })

  it('다중 deleteGroup → 합집합', () => {
    const stage = makeStage()
    const intents = [
      createIntent('deleteGroup', { groupId: 0 }),
      createIntent('deleteGroup', { groupId: 1 }),
    ]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.deletedNodeIds.size).toBe(5)
    expect(mask.deletedElementIds.size).toBe(3)
    expect(mask.derivedGroupCount).toBe(0)
  })

  it('존재하지 않는 group id intent → 무시', () => {
    const stage = makeStage()
    const intents = [createIntent('deleteGroup', { groupId: 99 })]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.deletedNodeIds.size).toBe(0)
    expect(mask.deletedGroupIds.size).toBe(0)
  })

  it('addRigid intent 는 마스크 노드/요소에 영향 없음', () => {
    const stage = makeStage()
    const intents = [createIntent('addRigid', { independentNode: 1, dependentNodes: [2] })]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.deletedNodeIds.size).toBe(0)
  })

  it('addRigid intent 가 addedRigids[] 와 derivedRigidCount 를 늘린다', () => {
    const stage = makeStage()
    const intents = [
      createIntent('addRigid', { independentNode: 1, dependentNodes: [2, 3], remark: 'UBOLT', cm: '123456' }),
    ]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.addedRigids).toHaveLength(1)
    expect(mask.addedRigids[0].independentNode).toBe(1)
    expect(mask.addedRigids[0].dependentNodes).toEqual([2, 3])
    expect(mask.addedRigids[0].remark).toBe('UBOLT')
    expect(mask.derivedRigidCount).toBe(1)   // 원본 0 + 추가 1
  })

  it('존재하지 않는 노드 참조하는 addRigid 는 미리보기에서 제외', () => {
    const stage = makeStage()
    const intents = [createIntent('addRigid', { independentNode: 99, dependentNodes: [2] })]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.addedRigids).toHaveLength(0)
  })

  it('addRigid 와 deleteGroup 동시 — 둘 다 derived 카운트에 반영', () => {
    const stage = makeStage()
    const intents = [
      createIntent('deleteGroup', { groupId: 1 }),
      createIntent('addRigid', { independentNode: 1, dependentNodes: [2] }),
    ]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.deletedNodeIds.size).toBe(2)         // 그룹 1 = 노드 4,5
    expect(mask.addedRigids).toHaveLength(1)
    expect(mask.derivedRigidCount).toBe(1)           // 원본 0 - 0 + 1
  })

  it('RBE 끊김: 독립만 삭제된 경우', () => {
    const stage = makeStage({
      rigids: [{ id: 50, independentNode: 1, dependentNodes: [4], remark: null, sourceName: 'x' }],
    })
    // 그룹 0(노드 1,2,3) 삭제 → ind=1 사라지고 dep=[4] 살아남음 → broken
    const intents = [createIntent('deleteGroup', { groupId: 0 })]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.brokenRbeIds.has(50)).toBe(true)
  })

  it('RBE 끊김: 종속 일부만 삭제', () => {
    const stage = makeStage({
      rigids: [{ id: 60, independentNode: 5, dependentNodes: [1, 4], remark: null, sourceName: 'x' }],
    })
    // 그룹 0 삭제 → dep 1 삭제, dep 4 유지 → broken
    const intents = [createIntent('deleteGroup', { groupId: 0 })]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.brokenRbeIds.has(60)).toBe(true)
  })

  it('RBE 끊김 아님: 독립과 모든 종속이 함께 삭제', () => {
    const stage = makeStage({
      rigids: [{ id: 70, independentNode: 1, dependentNodes: [2, 3], remark: null, sourceName: 'x' }],
    })
    // 그룹 0(1,2,3) 삭제 → ind 1 + dep 2,3 모두 삭제 → broken 아님 (RBE 통째로 사라지는 정상 경우)
    const intents = [createIntent('deleteGroup', { groupId: 0 })]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.brokenRbeIds.has(70)).toBe(false)
  })

  it('null stageData → EMPTY 반환', () => {
    const mask = computeDeleteMask(null, [])
    expect(mask.derivedGroupCount).toBe(0)
    expect(mask.deletedNodeIds.size).toBe(0)
  })
})

describe('computeDeleteMask — deleteElement', () => {
  it('deleteElement intent 가 해당 요소만 deletedElementIds 에 추가한다', () => {
    const stage = makeStage()
    const mask = computeDeleteMask(stage, [createIntent('deleteElement', { elementId: 100 })])
    expect(mask.deletedElementIds.has(100)).toBe(true)
    expect(mask.deletedElementIds.has(101)).toBe(false)
    expect(mask.deletedElementIds.has(200)).toBe(false)
    // 노드는 자동 삭제하지 않는다 — 다른 element 가 끝점을 공유할 수 있음
    expect(mask.deletedNodeIds.size).toBe(0)
  })

  it('존재하지 않는 elementId 는 무시한다', () => {
    const stage = makeStage()
    const mask = computeDeleteMask(stage, [createIntent('deleteElement', { elementId: 99999 })])
    expect(mask.deletedElementIds.size).toBe(0)
  })

  it('element 양 끝 노드가 다른 element 에서 안 쓰이면 orphanCandidate 가 된다', () => {
    // element 200 (nodes 4-5) 를 삭제하면 4, 5 노드는 어떤 element 에서도 안 쓰임 → orphan
    const stage = makeStage()
    const mask = computeDeleteMask(stage, [createIntent('deleteElement', { elementId: 200 })])
    expect(mask.orphanCandidateNodeIds.has(4)).toBe(true)
    expect(mask.orphanCandidateNodeIds.has(5)).toBe(true)
    // 다른 노드는 100/101 에서 사용 중
    expect(mask.orphanCandidateNodeIds.has(1)).toBe(false)
    expect(mask.orphanCandidateNodeIds.has(2)).toBe(false)
  })

  it('element 끝 노드가 다른 element 와 공유되면 orphan 이 아니다', () => {
    // element 100(1-2) 만 삭제 — 노드 2 는 element 101 의 시작점이므로 살아있음
    const stage = makeStage()
    const mask = computeDeleteMask(stage, [createIntent('deleteElement', { elementId: 100 })])
    expect(mask.orphanCandidateNodeIds.has(1)).toBe(true)   // 노드 1 은 어떤 element 도 안 씀
    expect(mask.orphanCandidateNodeIds.has(2)).toBe(false)  // 노드 2 는 101 이 씀
  })

  it('RBE 가 참조하는 노드는 element 삭제로도 orphan 이 되지 않는다', () => {
    const stage = makeStage({
      rigids: [{ id: 70, independentNode: 4, dependentNodes: [5], remark: null, sourceName: 'x' }],
    })
    const mask = computeDeleteMask(stage, [createIntent('deleteElement', { elementId: 200 })])
    expect(mask.orphanCandidateNodeIds.has(4)).toBe(false)
    expect(mask.orphanCandidateNodeIds.has(5)).toBe(false)
  })

  it('PointMass 가 붙은 노드는 element 삭제로도 orphan 이 되지 않는다', () => {
    const stage = makeStage({
      pointMasses: [{ id: 11, nodeId: 5, mass: 1.0, sourceName: 'x' }],
    })
    const mask = computeDeleteMask(stage, [createIntent('deleteElement', { elementId: 200 })])
    expect(mask.orphanCandidateNodeIds.has(5)).toBe(false)
    expect(mask.orphanCandidateNodeIds.has(4)).toBe(true)  // 4 는 여전히 orphan
  })

  it('deleteOrphanNodes intent 가 함께 있으면 그 노드는 orphan 후보에서 제외', () => {
    const stage = makeStage()
    const intents = [
      createIntent('deleteElement', { elementId: 200 }),
      createIntent('deleteOrphanNodes', { nodeIds: [4, 5] }),
    ]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.deletedNodeIds.has(4)).toBe(true)
    expect(mask.deletedNodeIds.has(5)).toBe(true)
    expect(mask.orphanCandidateNodeIds.has(4)).toBe(false)
    expect(mask.orphanCandidateNodeIds.has(5)).toBe(false)
  })

  it('addRigid 로 새로 묶인 노드는 orphan 이 아니다', () => {
    const stage = makeStage()
    const intents = [
      createIntent('deleteElement', { elementId: 200 }),
      createIntent('addRigid',     { independentNode: 4, dependentNodes: [5] }),
    ]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.orphanCandidateNodeIds.has(4)).toBe(false)
    expect(mask.orphanCandidateNodeIds.has(5)).toBe(false)
  })

  it('deleteElement + deleteGroup 조합 — 합집합', () => {
    const stage = makeStage()
    const intents = [
      createIntent('deleteGroup',   { groupId: 1 }),         // 노드 4,5 + element 200
      createIntent('deleteElement', { elementId: 101 }),     // element 만, 노드는 그룹 0 살아있음
    ]
    const mask = computeDeleteMask(stage, intents)
    expect(mask.deletedElementIds.has(101)).toBe(true)
    expect(mask.deletedElementIds.has(200)).toBe(true)
    expect(mask.derivedElementCount).toBe(1)  // 100 만 살아남음
    expect(mask.derivedNodeCount).toBe(3)     // 노드 1,2,3 살아있음 (4,5 는 그룹 1 삭제)
  })
})

describe('isEmptyDeleteMask', () => {
  it('null 또는 빈 마스크는 true', () => {
    expect(isEmptyDeleteMask(null)).toBe(true)
    expect(isEmptyDeleteMask({ deletedNodeIds: new Set(), deletedElementIds: new Set() })).toBe(true)
  })
  it('내용이 있으면 false', () => {
    expect(isEmptyDeleteMask({ deletedNodeIds: new Set([1]), deletedElementIds: new Set() })).toBe(false)
  })
})
