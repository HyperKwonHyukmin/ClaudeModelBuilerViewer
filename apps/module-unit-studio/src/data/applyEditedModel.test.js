import { describe, it, expect } from 'vitest'
import { StageData } from './StageData.js'
import { buildEditedStageJson, buildEditedStageFileName } from './applyEditedModel.js'

const baseJson = () => ({
  meta: { phase: 'C', stageName: 'C_Final', timestamp: '2026-04-29', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: [] },
    { id: 3, x: 2000, y: 0, z: 0, tags: [] },
    { id: 4, x: 3000, y: 0, z: 0, tags: [] },
    { id: 5, x: 0,    y: 1000, z: 0, tags: [] },   // 별도 그룹
    { id: 6, x: 1000, y: 1000, z: 0, tags: [] },
  ],
  elements: [
    // 그룹 0: BEAM 100, 101 (nodes 1-2-3)
    { id: 100, type: 'BEAM', startNode: 1, endNode: 2, category: 'Structure', propertyId: 1 },
    { id: 101, type: 'BEAM', startNode: 2, endNode: 3, category: 'Structure', propertyId: 1 },
    // 그룹 0 / 1 분리용: 별도 그룹 BEAM 200 (nodes 5-6)
    { id: 200, type: 'BEAM', startNode: 5, endNode: 6, category: 'Pipe',      propertyId: 2 },
  ],
  rigids: [
    { id: 50, independentNode: 3, dependentNodes: [4], cm: '123456' },
  ],
  pointMasses: [
    // PointMass 는 BEAM 그룹의 nodeIds 에 들어가는 노드에 부착돼야 deleteGroup 으로 함께 사라진다.
    // node 2 는 BEAM 100/101 의 엔드포인트라 그룹 0 에 포함됨.
    { id: 70, nodeId: 2, mass: 0.05, sourceName: 'pm-A' },
  ],
  properties: [
    { id: 1, kind: 'Bar',  dims: [50, 50] },
    { id: 2, kind: 'Tube', dims: [80, 70] },
  ],
  materials: [{ id: 1, name: 'STEEL', E: 210000, nu: 0.3, rho: 7.85e-9 }],
  connectivity: null, healthMetrics: null, diagnostics: [], trace: [],
})

describe('buildEditedStageFileName', () => {
  it('sourceFileName 이 있으면 _edited 접미사 붙인다', () => {
    const stage = new StageData(baseJson())
    stage.sourceFileName = '06_Validation.json'
    expect(buildEditedStageFileName(stage)).toBe('06_Validation_edited.json')
  })

  it('sourceFileName 이 없으면 phase + ts 기반', () => {
    const stage = new StageData(baseJson())
    const name = buildEditedStageFileName(stage, () => '20260506')
    expect(name).toBe('edited_C_20260506.json')
  })
})

describe('buildEditedStageJson', () => {
  it('intents 가 비어 있으면 원본과 동일한 노드/요소/RBE/매스 카운트', () => {
    const stage = new StageData(baseJson())
    const out = buildEditedStageJson(stage, [])
    expect(out.nodes).toHaveLength(6)
    expect(out.elements).toHaveLength(3)
    expect(out.rigids).toHaveLength(1)
    expect(out.pointMasses).toHaveLength(1)
    expect(out.meta.edited).toBe(true)
    expect(out.meta.editedAt).toBeTruthy()
  })

  it('addRigid intent 가 새 RBE 로 들어가고 id 가 max+1 부여된다', () => {
    const stage = new StageData(baseJson())
    const intents = [
      { id: 1, kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2], cm: '123456' }, validation: { status: 'ok' } },
    ]
    const out = buildEditedStageJson(stage, intents)
    expect(out.rigids).toHaveLength(2)
    const added = out.rigids.find(r => r.independentNode === 1 && r.dependentNodes.includes(2))
    expect(added).toBeTruthy()
    expect(added.id).toBe(51)   // 기존 max 50 + 1
  })

  it('deleteGroup intent 로 노드/요소/관련 RBE/매스 모두 정리되고 connectivity 재계산', () => {
    // 그룹 1 (nodes 5,6 + element 200) 삭제 — 작은 쪽
    const stage = new StageData(baseJson())
    // baseJson 의 group 0(largest) 가 BEAM 100/101 을 포함하므로 삭제할 그룹 id 는 작은 쪽인 1
    const intents = [{ id: 1, kind: 'deleteGroup', params: { groupId: 1 }, validation: { status: 'ok' } }]
    const out = buildEditedStageJson(stage, intents)

    expect(out.nodes.find(n => n.id === 5)).toBeUndefined()
    expect(out.nodes.find(n => n.id === 6)).toBeUndefined()
    expect(out.elements.find(e => e.id === 200)).toBeUndefined()
    expect(out.connectivity.groupCount).toBe(1)
    expect(out.connectivity.groups[0].elementIds).toEqual(expect.arrayContaining([100, 101]))
    expect(out.healthMetrics.totals.nodeCount).toBe(4)        // 6 - 2
    expect(out.healthMetrics.totals.elementCount).toBe(2)     // 3 - 1
  })

  it('deleteGroup 으로 RBE 의 dependent 만 사라지면 surviving deps 만 남기고 유지', () => {
    // baseJson 의 RBE 50 = ind:3, deps:[4]. 그룹 1 (5,6) 삭제는 RBE 에 영향 없음 → 그대로.
    const stage = new StageData(baseJson())
    const intents = [{ id: 1, kind: 'deleteGroup', params: { groupId: 1 }, validation: { status: 'ok' } }]
    const out = buildEditedStageJson(stage, intents)
    expect(out.rigids).toHaveLength(1)
    expect(out.rigids[0].dependentNodes).toEqual([4])
  })

  it('deleteGroup 이 RBE 의 independent 노드를 포함하면 RBE 통째로 사라진다', () => {
    // node 3, 4 가 그룹 0 안. 그룹 0 삭제 → ind=3, dep=4 모두 사라짐 → fully removed
    const stage = new StageData(baseJson())
    const intents = [{ id: 1, kind: 'deleteGroup', params: { groupId: 0 }, validation: { status: 'ok' } }]
    const out = buildEditedStageJson(stage, intents)
    expect(out.rigids).toHaveLength(0)
  })

  it('PointMass: 매스가 붙은 노드가 삭제되면 함께 사라진다', () => {
    // PointMass id=70 이 node 4 에 붙어있음. 그룹 0 삭제 → node 4 사라짐 → mass 함께 제거
    const stage = new StageData(baseJson())
    const intents = [{ id: 1, kind: 'deleteGroup', params: { groupId: 0 }, validation: { status: 'ok' } }]
    const out = buildEditedStageJson(stage, intents)
    expect(out.pointMasses).toHaveLength(0)
  })

  it('properties / materials 는 보존', () => {
    const stage = new StageData(baseJson())
    const out = buildEditedStageJson(stage, [
      { id: 1, kind: 'deleteGroup', params: { groupId: 1 }, validation: { status: 'ok' } },
    ])
    expect(out.properties).toHaveLength(2)
    expect(out.materials).toHaveLength(1)
  })

  it('출력은 다시 StageData 로 무리 없이 로드 가능 (round-trip)', () => {
    const stage = new StageData(baseJson())
    const out = buildEditedStageJson(stage, [
      { id: 1, kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] }, validation: { status: 'ok' } },
    ])
    const reloaded = new StageData(out)
    expect(reloaded.nodeMap.size).toBe(6)
    expect(reloaded.rigids).toHaveLength(2)
    expect(reloaded.groups.length).toBeGreaterThan(0)
  })

  it('trace 끝에 EditApplied 마커가 추가된다', () => {
    const stage = new StageData(baseJson())
    stage.trace = [{ stage: 'Validation', action: 'Done' }]
    const out = buildEditedStageJson(stage, [
      { id: 1, kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] }, validation: { status: 'ok' } },
    ])
    expect(out.trace[out.trace.length - 1].action).toBe('EditApplied')
    expect(out.trace[out.trace.length - 1].addedRigidCount).toBe(1)
  })
})
