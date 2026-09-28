import { describe, it, expect } from 'vitest'
import { StageData } from './StageData.js'
import { planGroupConnections, GROUP_AUTO_DEFAULTS, GROUP_SKIP_LABEL } from './groupAutoConnect.js'

// ── 합성 모델 ────────────────────────────────────────────────────────────
// 주 구조: x=0..3600 을 잇는 L 부재 체인(노드 1..7, 간격 600, y=0, z=0) — 7 노드 6 요소 (요소 수 최대).
// (간격 600 > stationGapMm 500 이어야 노드마다 다른 프레임이 된다 — 간격이 500 이면 `>` 조건에 걸리지 않아 한 프레임.)
//          + 배관 행(노드 201..207, y=+150) — 주 구조에 속하지만 category 'Pipe' 라 타깃에서 제외.
//          (배관을 주 구조와 이어 붙이기 위해 노드 1↔201 을 잇는 짧은 부재 하나를 둔다)
// 소그룹 A: 노드 101..104, x=0..1800 (y=-300, z=+100) 을 잇는 3 요소 체인 — 주 구조와 노드 공유 없음.
//           프레임 후보: x=0/600/1200/1800 의 주 구조 노드가 거리 √(300²+100²)≈316 mm 안에 있다.
// 소그룹 B: 노드 301..302 (x=2500..2600, y=+900) — 반경 450 안에 주 구조 없음(y 차 900).
// ⚠ RBE 는 StageData._computeGroups 가 그룹을 합치는 근거이므로, 소그룹을 주 구조에 잇는 RBE 를 fixture 에
//   넣으면 그 소그룹이 사라진다. in-rbe 검증은 소그룹 '내부' RBE 로 한다.
const L_PID = 2, PIPE_PID = 1003

function baseModel({ extraRigids = [], radiusTest = false, closedLoop = false } = {}) {
  const nodes = []
  const elements = []
  let eid = 1
  // 주 구조 체인
  for (let i = 0; i < 7; i++) nodes.push({ id: i + 1, x: i * 600, y: 0, z: 0, tags: [] })
  for (let i = 1; i < 7; i++) {
    elements.push({ id: eid++, type: 'BEAM', startNode: i, endNode: i + 1, propertyId: L_PID, category: 'Structure' })
  }
  // 배관 행(주 구조에 붙음)
  for (let i = 0; i < 7; i++) nodes.push({ id: 201 + i, x: i * 600, y: 150, z: 0, tags: [] })
  for (let i = 0; i < 6; i++) {
    elements.push({ id: eid++, type: 'BEAM', startNode: 201 + i, endNode: 202 + i, propertyId: PIPE_PID, category: 'Pipe' })
  }
  elements.push({ id: eid++, type: 'BEAM', startNode: 1, endNode: 201, propertyId: PIPE_PID, category: 'Pipe' })
  // 소그룹 A
  for (let i = 0; i < 4; i++) nodes.push({ id: 101 + i, x: i * 600, y: -300, z: 100, tags: [] })
  for (let i = 0; i < 3; i++) {
    elements.push({ id: eid++, type: 'BEAM', startNode: 101 + i, endNode: 102 + i, propertyId: L_PID, category: 'Structure' })
  }
  // 소그룹 B (멀리)
  nodes.push({ id: 301, x: 2500, y: radiusTest ? 300 : 900, z: 0, tags: [] })
  nodes.push({ id: 302, x: 2600, y: radiusTest ? 300 : 900, z: 0, tags: [] })
  elements.push({ id: eid++, type: 'BEAM', startNode: 301, endNode: 302, propertyId: L_PID, category: 'Structure' })
  // 소그룹 C(옵션): 삼각 고리 — 모든 노드 차수 2 라 자유단이 없다(폴백 검증용). 주 구조 노드 3(x=1200) 근처.
  if (closedLoop) {
    nodes.push({ id: 401, x: 1200, y: -250, z: 0, tags: [] })
    nodes.push({ id: 402, x: 1320, y: -250, z: 60, tags: [] })
    nodes.push({ id: 403, x: 1260, y: -330, z: 30, tags: [] })
    elements.push({ id: eid++, type: 'BEAM', startNode: 401, endNode: 402, propertyId: L_PID, category: 'Structure' })
    elements.push({ id: eid++, type: 'BEAM', startNode: 402, endNode: 403, propertyId: L_PID, category: 'Structure' })
    elements.push({ id: eid, type: 'BEAM', startNode: 403, endNode: 401, propertyId: L_PID, category: 'Structure' })
  }

  return {
    meta: { phase: 'BDF', stageName: 'Validation', timestamp: '2026-09-11T00:00:00Z', unit: 'mm', schemaVersion: '1.2' },
    nodes, elements,
    rigids: extraRigids,
    properties: [
      { id: L_PID, card: 'PBEAML', kind: 'L', dims: [90, 90, 10, 10], materialId: 1 },
      { id: PIPE_PID, card: 'PBEAML', kind: 'Tube', dims: [30.3, 26.4], materialId: 2 },
    ],
    materials: [], pointMasses: [], diagnostics: [], trace: [],
  }
}

const makeStage = (json) => new StageData(json)

describe('planGroupConnections', () => {
  it('주 구조는 요소 수 최대 그룹이고, 소그룹의 자유단만 주 구조 Structure 노드에 잇는다', () => {
    const stage = makeStage(baseModel())
    const r = planGroupConnections(stage)
    expect(r.warnings).toEqual([])
    // 주 구조 = 배관 포함 13 요소 그룹
    const mainGroup = (stage.finalGroups ?? stage.groups).find(g => g.id === r.mainGroupId)
    expect(mainGroup.elementIds.length).toBeGreaterThan(6)
    // 소그룹 A(101-102-103-104 체인)의 자유단은 101·104 뿐 — 중간 노드 102·103 은 소스가 아니다.
    const a = r.proposals.filter(p => p.groupId !== r.mainGroupId && p.srcNode >= 101 && p.srcNode <= 104)
    expect(a.map(p => [p.srcNode, p.tgtNode])).toEqual([[101, 1], [104, 4]])
    for (const p of a) {
      expect(p.distMm).toBeCloseTo(316.2, 0)
      expect(p.tgtKind).toBe('L')
      expect(p.replacedFrom).toBeNull()
    }
    expect(r.skipped.find(x => x.srcNode === 102)?.reason).toBe('not-free-node')
    expect(r.skipped.find(x => x.srcNode === 103)?.reason).toBe('not-free-node')
    // 배관 노드(201~207)는 타깃으로 절대 나오지 않는다
    expect(r.proposals.some(p => p.tgtNode >= 201 && p.tgtNode <= 207)).toBe(false)
  })

  it('자유단이 없는 닫힌 고리 소그룹은 모든 노드를 후보로 폴백하고 경고를 남긴다', () => {
    const r = planGroupConnections(makeStage(baseModel({ closedLoop: true })))
    expect(r.warnings.some(w => /자유단/.test(w))).toBe(true)
    const c = r.proposals.filter(p => p.srcNode >= 401 && p.srcNode <= 403)
    expect(c.length).toBeGreaterThanOrEqual(1)
  })

  it('반경 안에 주 구조가 없는 소그룹은 no-structure-in-radius 로 건너뛴다', () => {
    const r = planGroupConnections(makeStage(baseModel()))
    const b = r.skipped.filter(s => s.srcNode === 301 || s.srcNode === 302)
    expect(b).toHaveLength(2)
    expect(b.every(s => s.reason === 'no-structure-in-radius')).toBe(true)
    expect(GROUP_SKIP_LABEL[b[0].reason]).toBeTruthy()
    // 그룹 요약에 stationCount 0 으로 남는다
    const gB = r.groups.find(g => g.nodeCount === 2)
    expect(gB.stationCount).toBe(0)
  })

  it('반경을 키우면 멀던 소그룹도 잡힌다', () => {
    const r = planGroupConnections(makeStage(baseModel({ radiusTest: true })), { radiusMm: 400 })
    // 소그룹 B(y=300, x=2500/2600) → 주 구조 노드 5(x=2400): 301 에서 √(100²+300²)=316 < 400
    const b = r.proposals.filter(p => p.srcNode === 301 || p.srcNode === 302)
    expect(b.length).toBeGreaterThanOrEqual(1)
    expect(b[0].tgtNode).toBe(5)
  })

  it('기본(perNode)은 프레임이 겹쳐도 연결 가능한 소그룹 노드를 전부 제안한다', () => {
    // stationGapMm 을 700 으로 올리면 예전 규칙에서는 4 노드가 한 프레임으로 묶여 1쌍만 남았다.
    // 사용자 요청(2026-09-11 2차): 소그룹 안의 모든 끝점 후보를 찾아야 한다.
    const r = planGroupConnections(makeStage(baseModel()), { stationGapMm: 700, freeOnly: false })
    const a = r.proposals.filter(p => p.srcNode >= 101 && p.srcNode <= 104)
    expect(a.map(p => [p.srcNode, p.tgtNode])).toEqual([[101, 1], [102, 2], [103, 3], [104, 4]])
    expect(r.skipped.some(s => s.reason === 'station-covered')).toBe(false)
    // 그룹 요약의 stationCount = 그 그룹에서 만든 제안 수
    const gA = r.groups.find(g => g.nodeCount === 4)
    expect(gA.stationCount).toBe(4)
  })

  it('perNode:false 면 예전 규칙대로 축방향 프레임마다 1쌍만 제안한다', () => {
    // 주 구조 간격 600 > 기본 stationGapMm 500 → 4 프레임. 700 으로 올리면 한 프레임 → 1쌍.
    const r = planGroupConnections(makeStage(baseModel()), { perNode: false, stationGapMm: 700, freeOnly: false })
    const a = r.proposals.filter(p => p.srcNode >= 101 && p.srcNode <= 104)
    expect(a).toHaveLength(1)
    const covered = r.skipped.filter(s => s.srcNode >= 101 && s.srcNode <= 104 && s.reason === 'station-covered')
    expect(covered).toHaveLength(3)
  })

  it('가장 가까운 타깃이 막혀 있으면 그 노드의 다음 후보로 넘어간다', () => {
    // 노드 2 를 (독립 3 → 종속 2), (독립 4 → 종속 3) 체인으로 막으면 102 의 최근접 타깃 2 는 못 쓴다.
    // 반경을 키워 102 가 노드 1/3 도 볼 수 있게 하면(√(600²+300²+100²)≈678) 살아 있는 후보로 넘어간다.
    const r = planGroupConnections(makeStage(baseModel({
      extraRigids: [
        { id: 9005, independentNode: 3, dependentNodes: [2], cm: '123456' },
        { id: 9006, independentNode: 4, dependentNodes: [3], cm: '123456' },
      ],
    })), { radiusMm: 700, freeOnly: false })
    const p102 = r.proposals.find(p => p.srcNode === 102)
    expect(p102).toBeTruthy()
    expect([1, 4]).toContain(p102.tgtNode)   // 막힌 2·3 이 아닌 다른 주 구조 노드
    expect(r.proposals.some(p => p.tgtNode === 2 || p.tgtNode === 3)).toBe(false)
  })

  it('타깃 노드가 기존 RBE 의 종속이면 그 RBE 의 독립노드로 대체한다', () => {
    // 주 구조 노드 2 가 노드 3 을 독립으로 하는 RBE 의 종속 → 소그룹 노드 102 는 3 으로 대체
    const r = planGroupConnections(makeStage(baseModel({
      extraRigids: [{ id: 9001, independentNode: 3, dependentNodes: [2], cm: '123456' }],
    })), { freeOnly: false })
    const p = r.proposals.find(x => x.srcNode === 102)
    expect(p.tgtNode).toBe(3)
    expect(p.replacedFrom).toBe(2)
    // 노드 103 은 원래 3 이 타깃이고 3 은 독립노드라 그대로
    expect(r.proposals.find(x => x.srcNode === 103).tgtNode).toBe(3)
  })

  it('이미 RBE 에 속한 소그룹 노드는 in-rbe 로 건너뛴다', () => {
    // 소그룹 A 내부 RBE(102 → 101): 그룹은 그대로 분리돼 있고 101·102 만 RBE 점유
    const r = planGroupConnections(makeStage(baseModel({
      extraRigids: [{ id: 9002, independentNode: 102, dependentNodes: [101], cm: '123456' }],
    })), { freeOnly: false })
    expect(r.skipped.find(s => s.srcNode === 101)?.reason).toBe('in-rbe')
    expect(r.skipped.find(s => s.srcNode === 102)?.reason).toBe('in-rbe')
    expect(r.proposals.some(p => p.srcNode === 101 || p.srcNode === 102)).toBe(false)
    // 나머지 103·104 는 여전히 제안된다
    expect(r.proposals.map(p => p.srcNode)).toEqual([103, 104])
  })

  it('existingIntents 의 addRigid 도 점유로 본다 (재실행 중복 방지)', () => {
    // intent 는 StageData 그룹 계산에 반영되지 않으므로(적용 전) 소그룹은 그대로 남고, 101 만 점유된다
    const r = planGroupConnections(makeStage(baseModel()), {
      freeOnly: false,
      existingIntents: [{ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [101] } }],
    })
    expect(r.skipped.find(s => s.srcNode === 101)?.reason).toBe('in-rbe')
    expect(r.proposals.map(p => p.srcNode)).toEqual([102, 103, 104])
  })

  it('종속의 종속(체인)인 타깃은 쓰지 않는다', () => {
    // 2 ← 종속 of 3, 3 ← 종속 of 4 : 2 와 3 모두 chainBlocked
    const r = planGroupConnections(makeStage(baseModel({
      extraRigids: [
        { id: 9003, independentNode: 3, dependentNodes: [2], cm: '123456' },
        { id: 9004, independentNode: 4, dependentNodes: [3], cm: '123456' },
      ],
    })), { freeOnly: false })
    // 노드 102(타깃 2) 와 103(타깃 3) 은 체인 차단 → 다른 프레임 후보가 없어 no-usable-target
    const s102 = r.skipped.find(s => s.srcNode === 102)
    const s103 = r.skipped.find(s => s.srcNode === 103)
    expect(s102?.reason).toBe('no-usable-target')
    expect(s103?.reason).toBe('no-usable-target')
    expect(r.proposals.some(p => p.tgtNode === 2 || p.tgtNode === 3)).toBe(false)
  })

  it('그룹이 1개면 아무것도 제안하지 않는다', () => {
    const json = baseModel()
    // 소그룹 A·B 를 지운다
    json.nodes = json.nodes.filter(n => n.id < 100 || (n.id >= 201 && n.id <= 207))
    json.elements = json.elements.filter(e => e.startNode < 300 && e.endNode < 300 && !(e.startNode >= 101 && e.startNode <= 104))
    const r = planGroupConnections(makeStage(json))
    expect(r.proposals).toEqual([])
    expect(r.mainGroupId).toBeNull()
  })

  it('기본값과 스킵 라벨이 노출된다', () => {
    expect(GROUP_AUTO_DEFAULTS.radiusMm).toBe(450)
    expect(GROUP_AUTO_DEFAULTS.perNode).toBe(true)
    expect(GROUP_AUTO_DEFAULTS.freeOnly).toBe(true)
    expect(GROUP_AUTO_DEFAULTS.cm).toBe('123456')
    expect(GROUP_AUTO_DEFAULTS.remark).toBe('AUTOCONNECT')
    for (const k of ['in-rbe', 'no-structure-in-radius', 'station-covered', 'no-usable-target', 'not-free-node']) {
      expect(typeof GROUP_SKIP_LABEL[k]).toBe('string')
    }
  })

  it('빈 stage / 잘못된 입력은 빈 결과', () => {
    expect(planGroupConnections(null).proposals).toEqual([])
    expect(planGroupConnections({ nodeMap: new Map() }).proposals).toEqual([])
  })
})
