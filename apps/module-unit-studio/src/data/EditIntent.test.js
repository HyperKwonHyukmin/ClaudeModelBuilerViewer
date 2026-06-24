import { describe, it, expect } from 'vitest'
import {
  EDIT_INTENT_SCHEMA_VERSION,
  createIntent,
  validateIntent,
  serializeIntents,
  parseIntents,
  summarizeIntent,
} from './EditIntent.js'
import { StageData } from './StageData.js'

const makeStage = (overrides = {}) => new StageData({
  meta: { phase: 'C', stageName: 'C_Final', timestamp: '20260429_120000', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: [] },
    { id: 3, x: 2000, y: 0, z: 0, tags: [] },
    { id: 4, x: 3000, y: 0, z: 0, tags: [] },
  ],
  elements: [
    // 두 BEAM 요소를 두어 deleteElement / 그룹 소속 검증을 함께 다룬다.
    { id: 101, type: 'BEAM', startNode: 1, endNode: 2, category: 'Structure', propertyId: 1 },
    { id: 102, type: 'BEAM', startNode: 2, endNode: 3, category: 'Structure', propertyId: 1 },
  ],
  rigids: [{ id: 100, independentNode: 1, dependentNodes: [2], remark: 'UBOLT', sourceName: 'x' }],
  properties: [], materials: [], pointMasses: [],
  connectivity: {
    groupCount: 1, largestGroupNodeCount: 4, isolatedNodeCount: 0,
    groups: [{ id: 0, nodeIds: [1, 2, 3, 4], elementIds: [101, 102] }],
  },
  healthMetrics: {
    totals: { nodeCount: 4, elementCount: 2, rigidCount: 1, pointMassCount: 0,
      bbox: { minX: 0, maxX: 3000, minY: 0, maxY: 0, minZ: 0, maxZ: 0 } },
    issues: {},
  },
  ...overrides,
})

// ── createIntent ──────────────────────────────────────────────
describe('createIntent', () => {
  it('addRigid intent 가 기본 필드를 갖춘다', () => {
    const intent = createIntent('addRigid', { independentNode: 1, dependentNodes: [2] })
    expect(intent.kind).toBe('addRigid')
    expect(intent.id).toBeTruthy()
    expect(intent.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(intent.params.independentNode).toBe(1)
    expect(intent.validation.status).toBe('ok')
  })

  it('알 수 없는 kind 는 throw', () => {
    expect(() => createIntent('foo', {})).toThrow()
  })
})

// ── validateIntent: addRigid ──────────────────────────────────
describe('validateIntent — addRigid', () => {
  it('정상 케이스 → ok', () => {
    const stage = makeStage()
    const intent = createIntent('addRigid', { independentNode: 3, dependentNodes: [4] })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('ok')
    expect(v.errors).toEqual([])
  })

  it('독립=종속 동일 → error', () => {
    const stage = makeStage()
    const intent = createIntent('addRigid', { independentNode: 2, dependentNodes: [2] })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
    expect(v.errors.some(e => e.includes('동일'))).toBe(true)
  })

  it('종속 비어 있음 → error', () => {
    const stage = makeStage()
    const intent = createIntent('addRigid', { independentNode: 1, dependentNodes: [] })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
  })

  it('존재하지 않는 노드 참조 → error', () => {
    const stage = makeStage()
    const intent = createIntent('addRigid', { independentNode: 99, dependentNodes: [4] })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
    expect(v.errors.some(e => e.includes('존재하지 않'))).toBe(true)
  })

  it('잘못된 cm 형식 → error', () => {
    const stage = makeStage()
    const intent = createIntent('addRigid', { independentNode: 3, dependentNodes: [4], cm: '789' })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
  })

  it('유효한 cm 형식(123456) → ok', () => {
    const stage = makeStage()
    const intent = createIntent('addRigid', { independentNode: 3, dependentNodes: [4], cm: '123456' })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('ok')
  })

  it('원본에 동일 (독립,종속) RBE 존재 → warning', () => {
    const stage = makeStage()  // rigids: [{ind:1, dep:[2]}]
    const intent = createIntent('addRigid', { independentNode: 1, dependentNodes: [2] })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('warning')
    expect(v.warnings.length).toBe(1)
  })

  it('기존 intent 에 같은 조합이 있으면 → warning', () => {
    const stage = makeStage()
    const existing = [createIntent('addRigid', { independentNode: 3, dependentNodes: [4] })]
    const intent = createIntent('addRigid', { independentNode: 3, dependentNodes: [4] })
    const v = validateIntent(intent, stage, existing)
    expect(v.status).toBe('warning')
  })
})

// ── validateIntent: deleteGroup ───────────────────────────────
describe('validateIntent — deleteGroup', () => {
  it('정상 그룹 ID → ok', () => {
    const stage = makeStage()
    const intent = createIntent('deleteGroup', { groupId: 0 })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('ok')
  })

  it('존재하지 않는 그룹 ID → error', () => {
    const stage = makeStage()
    const intent = createIntent('deleteGroup', { groupId: 99 })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
  })

  it('동일 그룹 중복 삭제 intent → error', () => {
    const stage = makeStage()
    const existing = [createIntent('deleteGroup', { groupId: 0 })]
    const intent = createIntent('deleteGroup', { groupId: 0 })
    const v = validateIntent(intent, stage, existing)
    expect(v.status).toBe('error')
  })

  it('삭제 시 RBE 가 끊기는 경우 → warning', () => {
    // RBE: ind=1, dep=[2]. 그룹 A=[1], 그룹 B=[2,3,4] 처럼 분할되도록
    const stage = makeStage({
      connectivity: {
        groupCount: 2, largestGroupNodeCount: 3, isolatedNodeCount: 0,
        groups: [
          { id: 0, nodeIds: [2, 3, 4], elementIds: [101] },
          { id: 1, nodeIds: [1],       elementIds: [102] },
        ],
      },
    })
    // 그룹 1(노드 1)을 삭제하면 RBE(ind=1, dep=2) 가 끊긴다 → warning
    const intent = createIntent('deleteGroup', { groupId: 1 })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('warning')
    expect(v.warnings.some(w => w.includes('RBE'))).toBe(true)
  })
})

// ── validateIntent: deleteElement ─────────────────────────────
describe('validateIntent — deleteElement', () => {
  it('정상 element ID → ok', () => {
    const stage = makeStage()
    const intent = createIntent('deleteElement', { elementId: 101 })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('ok')
  })

  it('elementId 가 정수가 아니면 → error', () => {
    const stage = makeStage()
    const intent = createIntent('deleteElement', { elementId: '101' })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
  })

  it('존재하지 않는 element ID → error', () => {
    const stage = makeStage()
    const intent = createIntent('deleteElement', { elementId: 999 })
    const v = validateIntent(intent, stage, [])
    expect(v.status).toBe('error')
    expect(v.errors.some(e => e.includes('존재하지 않'))).toBe(true)
  })

  it('동일 element 중복 삭제 intent → error', () => {
    const stage = makeStage()
    const existing = [createIntent('deleteElement', { elementId: 101 })]
    const intent = createIntent('deleteElement', { elementId: 101 })
    const v = validateIntent(intent, stage, existing)
    expect(v.status).toBe('error')
  })

  it('이미 삭제 예정인 그룹의 element → warning', () => {
    const stage = makeStage()
    // group 0 은 element 101,102 를 포함 → 그룹 삭제가 예약되면 element 개별 삭제는 무의미
    const existing = [createIntent('deleteGroup', { groupId: 0 })]
    const intent = createIntent('deleteElement', { elementId: 102 })
    const v = validateIntent(intent, stage, existing)
    expect(v.status).toBe('warning')
    expect(v.warnings.some(w => w.includes('그룹'))).toBe(true)
  })
})

// ── 직렬화 round-trip ──────────────────────────────────────────
describe('serializeIntents / parseIntents', () => {
  it('round-trip 으로 동일한 intents 를 복원한다', () => {
    const stage = makeStage()
    const intents = [
      createIntent('addRigid', { independentNode: 3, dependentNodes: [4], remark: 'UBOLT', cm: '123' }),
      createIntent('deleteGroup', { groupId: 0, memberNodeCount: 4 }),
    ]
    const json = serializeIntents(intents, stage)
    expect(json.schemaVersion).toBe(EDIT_INTENT_SCHEMA_VERSION)
    expect(json.stageRef.phase).toBe('C')
    expect(json.intents).toHaveLength(2)

    // JSON 문자열을 거쳐도 복원돼야 함
    const restored = parseIntents(JSON.parse(JSON.stringify(json)))
    expect(restored.intents).toHaveLength(2)
    expect(restored.intents[0].params).toEqual(intents[0].params)
    expect(restored.intents[1].params).toEqual(intents[1].params)
    expect(restored.stageRef.phase).toBe('C')
  })

  it('지원하지 않는 schemaVersion → throw', () => {
    expect(() => parseIntents({ schemaVersion: '999.0', intents: [] })).toThrow()
  })

  it('빈 입력 처리', () => {
    expect(() => parseIntents(null)).toThrow()
  })
})

// ── summarizeIntent ───────────────────────────────────────────
describe('summarizeIntent', () => {
  it('addRigid 라벨에 독립/종속/remark 가 들어간다', () => {
    const intent = createIntent('addRigid', { independentNode: 1485, dependentNodes: [1489, 1490], remark: 'UBOLT' })
    const label = summarizeIntent(intent)
    expect(label).toContain('1485')
    expect(label).toContain('1489')
    expect(label).toContain('UBOLT')
  })

  it('deleteGroup 라벨에 그룹 ID 와 노드 수가 들어간다', () => {
    const intent = createIntent('deleteGroup', { groupId: 7, memberNodeCount: 23 })
    const label = summarizeIntent(intent)
    expect(label).toContain('7')
    expect(label).toContain('23')
  })

  it('deleteElement 라벨에 element ID 와 카테고리, 양 끝 노드가 들어간다', () => {
    const intent = createIntent('deleteElement', {
      elementId: 1234, category: 'Pipe', startNode: 11, endNode: 22,
    })
    const label = summarizeIntent(intent)
    expect(label).toContain('1234')
    expect(label).toContain('Pipe')
    expect(label).toContain('11')
    expect(label).toContain('22')
  })

  it('종속이 4개 이상이면 …외 N 표기', () => {
    const intent = createIntent('addRigid', {
      independentNode: 1, dependentNodes: [10, 20, 30, 40, 50],
    })
    const label = summarizeIntent(intent)
    expect(label).toContain('…외')
  })
})

// ── emptyPipeFluid intent ─────────────────────────────────────
describe('emptyPipeFluid intent', () => {
  const stage = {
    materialMap: new Map([[2, { id: 2, rho: 1.3e-8 }], [3, { id: 3, rho: 1.6e-8 }]]),
  }
  it('정상 params 면 createIntent 성공 + validate ok', () => {
    const intent = createIntent('emptyPipeFluid', { materialIds: [2, 3], targetRho: 7.85e-9 })
    expect(intent.kind).toBe('emptyPipeFluid')
    expect(validateIntent(intent, stage, []).status).toBe('ok')
  })
  it('materialIds 가 비면 error', () => {
    const intent = createIntent('emptyPipeFluid', { materialIds: [], targetRho: 7.85e-9 })
    expect(validateIntent(intent, stage, []).status).toBe('error')
  })
  it('이미 emptyPipeFluid intent 가 있으면 중복 error (단방향)', () => {
    const existing = [createIntent('emptyPipeFluid', { materialIds: [2], targetRho: 7.85e-9 })]
    const intent = createIntent('emptyPipeFluid', { materialIds: [3], targetRho: 7.85e-9 })
    expect(validateIntent(intent, stage, existing).status).toBe('error')
  })
  it('summarizeIntent 가 material 개수를 표시', () => {
    const intent = createIntent('emptyPipeFluid', { materialIds: [2, 3], targetRho: 7.85e-9 })
    expect(summarizeIntent(intent)).toContain('2개')
  })
})
