# 권상 위치 자동 선정 재구축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoist 리본의 "권상 위치 자동 선정"이 물리 기반 C# 옵티마이저(`ModuleAnalysis.Cli --optimize`)가 자세안정성 평가로 엄선한 권상 위치만 제안·적용하도록 재구축한다.

**Architecture:** 프론트는 자체 선정을 하지 않는다. 방식별 그룹수 k를 스윕하며 매번 `--optimize`를 호출(강한 노드 선정기 경유)하고, 모든 호출 결과를 순수 함수로 병합·랭킹한다. 검증된 후보만 모달에 보이고, 사용자가 명시 선택할 때만 `hoistGroups`에 커밋한다. C# 엔진은 무수정.

**Tech Stack:** React 19, Zustand 5, Vitest 4, Vite 8. 대상 앱: `apps/module-unit-studio`.

**작업 디렉터리:** 모든 경로는 `C:\Coding\WorkBenchSubModule\ModuleUnitStudio\apps\module-unit-studio` 기준. 모든 명령은 이 폴더에서 실행.

**참조 명세:** `docs/superpowers/specs/2026-06-30-hoist-position-auto-selection-rebuild-design.md`

---

## 확정된 계약 (구현 시 그대로 사용)

- **옵티마이저 채널:** `host.optimizeHoistPositions(posturePath)` → `{ ok, report?, optimizationPath? }` 또는 `{ ok:false, error }`.
- **report 형태(직렬화 camelCase):** `{ best?, candidates: [] }`. 각 평가:
  `{ label, score, overallStatus, groupCount, groups:[{ nodeIds:[] }], metrics: { stage6Status, evaluationMode, stage6MarginMm, stage6DeviationMm, minSlingAngleDeg, wireConflictCount, failedStages:[] } }`.
- **모델 로딩(Stage0):** `stageRef.editedFile` 우선, 없으면 **같은 폴더의 `<base>.json`(=`<posture stem 에서 _posture 제거>.json`) 폴백.** → posture 파일명은 반드시 `buildPosturePayloadFileName(stage)`(=`<base>_posture.json`)을 **고정**해서 폴백이 모델을 찾게 한다. k별 파일명 분리 금지.
- **Stage0 그룹 제약:** Crane(ceiling)은 그룹 **정확히 1개** 필수(아니면 throw). → 사용자가 그룹을 안 찍었으면 시드 그룹 1개(노드 3개)를 넣는다.
- **다회 호출은 순차.** 같은 폴더에서 엔진이 임시 `_auto_candidate_NNN.json`을 만들고 지우므로 동시 호출 시 충돌. 순차면 안전.
- **커밋 함수:** `useEditStore.applyAutoHoistGroups(nodeGroups)` — `hoistGroupCount`/`hoistGroups`/`activeHoistGroupId` 설정. 미리보기·최종 커밋 모두 이걸 재사용.
- **저장 헬퍼:** `saveJsonArtifact(fileName, json)` → `{ ok, fileName, location:'backend'|'folder'|..., remotePath? }`.
- **모드별 상수:** `getHoistMaxGroups(mode)` → hydro 4 / goliat 3 / ceiling 1. `getHoistMinNodesPerGroup` → ceiling 3 / 그 외 2.

---

## File Structure

- **Create** `src/data/hoistCandidateRank.js` — 순수 함수: 후보 정규화·중복제거·랭킹·nodeGroups 변환.
- **Create** `src/data/hoistCandidateRank.test.js` — 위 순수 함수 단위테스트.
- **Modify** `src/store/useEditStore.js` — `autoSelectHoistPositions` + 로컬 헬퍼(`hoistSweepGroupCounts`, `pickSeedNodeIds`) 추가, 구 `optimizeHoistGroups` 제거(Task 6).
- **Modify** `src/store/useEditStore.test.js` — `autoSelectHoistPositions` 통합테스트(host mock).
- **Create** `src/components/HoistAutoResultModal.jsx` — 진행/랭킹/미리보기/적용 모달.
- **Modify** `src/components/HoistPositionPanel.jsx` — 버튼이 새 모달 열기, 방식 필수화, 구 모달/요약 제거.
- **Delete** `src/data/hoistAutoLayout.js`, `src/data/hoistAutoLayout.test.js`, `src/store/useHoistLayoutStore.js`, `src/store/useHoistLayoutStore.test.js`, `src/components/HoistAutoLayoutEditor.jsx` (Task 6).

---

## Task 1: 후보 랭킹 순수 함수 (`hoistCandidateRank.js`)

**Files:**
- Create: `src/data/hoistCandidateRank.js`
- Test: `src/data/hoistCandidateRank.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/data/hoistCandidateRank.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  normalizeCandidate,
  candidateSignature,
  compareCandidates,
  rankHoistCandidates,
  toNodeGroups,
} from './hoistCandidateRank.js'

const mk = (over = {}) => ({
  label: 'L', score: 1000, overallStatus: 'warn', groupCount: 2,
  groups: [{ nodeIds: [3, 1] }, { nodeIds: [2] }],
  metrics: { stage6Status: 'warn', stage6MarginMm: 10, minSlingAngleDeg: 65, wireConflictCount: 0, failedStages: [] },
  ...over,
})

describe('hoistCandidateRank', () => {
  it('candidateSignature 는 노드 순서/그룹 순서에 불변', () => {
    const a = candidateSignature(normalizeCandidate(mk()))
    const b = candidateSignature(normalizeCandidate(mk({ groups: [{ nodeIds: [2] }, { nodeIds: [1, 3] }] })))
    expect(a).toBe(b)
  })

  it('normalizeCandidate 는 누락 metric 을 null/0 으로 채운다', () => {
    const c = normalizeCandidate({ groups: [{ nodeIds: [1] }] })
    expect(c.metrics.stage6MarginMm).toBeNull()
    expect(c.metrics.wireConflictCount).toBe(0)
    expect(c.overallStatus).toBe('unknown')
  })

  it('compareCandidates: PASS 가 WARN 보다 앞', () => {
    const pass = normalizeCandidate(mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 1 } }))
    const warn = normalizeCandidate(mk({ overallStatus: 'warn', metrics: { stage6MarginMm: 999 } }))
    expect(compareCandidates(pass, warn)).toBeLessThan(0)
  })

  it('compareCandidates: 같은 상태면 Stage6 여유 큰 쪽이 앞', () => {
    const big = normalizeCandidate(mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 500 } }))
    const small = normalizeCandidate(mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 100 } }))
    expect(compareCandidates(big, small)).toBeLessThan(0)
  })

  it('compareCandidates: 여유 같으면 그룹 수 적은 쪽이 앞', () => {
    const few = normalizeCandidate(mk({ overallStatus: 'pass', groupCount: 2, metrics: { stage6MarginMm: 100 } }))
    const many = normalizeCandidate(mk({ overallStatus: 'pass', groupCount: 4, metrics: { stage6MarginMm: 100 } }))
    expect(compareCandidates(few, many)).toBeLessThan(0)
  })

  it('rankHoistCandidates: 여러 report 병합 + 중복제거 + id 부여', () => {
    const rep1 = { best: mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 300 } }), candidates: [mk()] }
    const rep2 = { best: mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 300 } }), candidates: [] } // rep1.best 와 동일 시그니처
    const ranked = rankHoistCandidates([rep1, rep2, null])
    expect(ranked.length).toBe(2)               // pass(중복1) + warn(mk 기본) = 2
    expect(ranked[0].overallStatus).toBe('pass')
    expect(ranked[0].id).toBeTruthy()
  })

  it('toNodeGroups: 그룹별 nodeIds 배열, 빈 그룹 제외', () => {
    const ng = toNodeGroups(normalizeCandidate(mk({ groups: [{ nodeIds: [1, 2] }, { nodeIds: [] }] })))
    expect(ng).toEqual([[1, 2]])
  })

  it('빈 입력은 빈 배열', () => {
    expect(rankHoistCandidates([])).toEqual([])
    expect(rankHoistCandidates(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- hoistCandidateRank`
Expected: FAIL — `hoistCandidateRank.js` 모듈 없음.

- [ ] **Step 3: 구현 작성**

Create `src/data/hoistCandidateRank.js`:

```js
/**
 * ModuleAnalysis.Cli --optimize 가 돌려준 자세안정성 평가 후보들을
 * 병합·중복제거·랭킹하는 순수 함수 모음. (네트워크/스토어 의존 없음 → 단위테스트 용이)
 *
 * 랭킹 우선순위: PASS > WARN > FAIL → Stage6 여유(margin) 큰 순 → 그룹 수 적은 순 → score 큰 순.
 */

function numOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** report 의 한 평가 객체를 안전한 표준 형태로 정규화한다. */
export function normalizeCandidate(c) {
  const m = c?.metrics ?? {}
  const groups = (c?.groups ?? []).map(g => ({ nodeIds: [...(g?.nodeIds ?? [])] }))
  return {
    label: c?.label ?? '',
    score: numOrNull(c?.score) ?? 0,
    overallStatus: c?.overallStatus ?? 'unknown',
    groupCount: Number.isFinite(Number(c?.groupCount)) ? Number(c.groupCount) : groups.length,
    groups,
    metrics: {
      stage6Status: m.stage6Status ?? null,
      evaluationMode: m.evaluationMode ?? null,
      stage6MarginMm: numOrNull(m.stage6MarginMm),
      stage6DeviationMm: numOrNull(m.stage6DeviationMm),
      minSlingAngleDeg: numOrNull(m.minSlingAngleDeg),
      wireConflictCount: Number.isFinite(Number(m.wireConflictCount)) ? Number(m.wireConflictCount) : 0,
      failedStages: Array.isArray(m.failedStages) ? m.failedStages : [],
    },
  }
}

/** 노드/그룹 순서에 불변인 시그니처 (중복제거 키). */
export function candidateSignature(c) {
  return (c?.groups ?? [])
    .map(g => [...(g?.nodeIds ?? [])].map(Number).sort((a, b) => a - b).join('-'))
    .sort()
    .join('|')
}

function statusRank(s) { return s === 'pass' ? 0 : s === 'warn' ? 1 : 2 }

/** 정렬 비교자 — 음수면 a 가 앞. */
export function compareCandidates(a, b) {
  const sr = statusRank(a.overallStatus) - statusRank(b.overallStatus)
  if (sr !== 0) return sr
  const ma = a.metrics.stage6MarginMm ?? -Infinity
  const mb = b.metrics.stage6MarginMm ?? -Infinity
  if (mb !== ma) return mb - ma
  if (a.groupCount !== b.groupCount) return a.groupCount - b.groupCount
  return (b.score ?? 0) - (a.score ?? 0)
}

/** 여러 report 의 best+candidates 를 병합·중복제거·정렬하고 안정적인 id 를 부여한다. */
export function rankHoistCandidates(reports) {
  const all = []
  for (const rep of reports ?? []) {
    if (!rep) continue
    if (rep.best) all.push(normalizeCandidate(rep.best))
    for (const c of rep.candidates ?? []) all.push(normalizeCandidate(c))
  }
  const bySig = new Map()
  for (const c of all) {
    if (c.groups.length === 0) continue
    const sig = candidateSignature(c)
    const prev = bySig.get(sig)
    if (!prev || compareCandidates(c, prev) < 0) bySig.set(sig, c)
  }
  return [...bySig.values()]
    .sort(compareCandidates)
    .map((c, i) => ({ ...c, id: `${i}-${candidateSignature(c)}` }))
}

/** 후보 → applyAutoHoistGroups 가 받는 nodeGroups (빈 그룹 제외). */
export function toNodeGroups(candidate) {
  return (candidate?.groups ?? [])
    .map(g => [...(g.nodeIds ?? [])])
    .filter(ids => ids.length > 0)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- hoistCandidateRank`
Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/data/hoistCandidateRank.js src/data/hoistCandidateRank.test.js
git commit -m "feat(hoist-auto): 권상 후보 병합·랭킹 순수 함수 추가"
```

---

## Task 2: 스윕 오케스트레이터 (`useEditStore.autoSelectHoistPositions`)

**Files:**
- Modify: `src/store/useEditStore.js` (import 추가, store 액션 추가, 모듈 헬퍼 추가)
- Test: `src/store/useEditStore.test.js` (describe 블록 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/store/useEditStore.test.js` 끝부분(마지막 `})` 위)에 아래 describe 를 추가:

```js
describe('autoSelectHoistPositions (Approach B 스윕)', () => {
  const richStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C_Final', timestamp: '20260429_120000', unit: 'mm', schemaVersion: '1.1' },
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, x: i * 100, y: (i % 3) * 100, z: 1000, tags: [] })),
    elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
    connectivity: { groupCount: 1, largestGroupNodeCount: 12, isolatedNodeCount: 0,
      groups: [{ id: 0, nodeIds: Array.from({ length: 12 }, (_, i) => i + 1), elementIds: [] }] },
    healthMetrics: { totals: { nodeCount: 12, elementCount: 0, rigidCount: 0, pointMassCount: 0,
      bbox: { minX: 0, maxX: 1100, minY: 0, maxY: 200, minZ: 1000, maxZ: 1000 } }, issues: {} },
  })

  const passReport = {
    best: {
      label: 'Hook-3g', score: 1000500, overallStatus: 'pass', groupCount: 3,
      groups: [{ nodeIds: [1, 2, 3] }, { nodeIds: [4, 5, 6] }, { nodeIds: [7, 8, 9] }],
      metrics: { stage6Status: 'pass', stage6MarginMm: 500, minSlingAngleDeg: 70, wireConflictCount: 0, failedStages: [] },
    },
    candidates: [],
  }

  const makeOptHost = (report = passReport) => ({
    name: 'electron',
    uploadEvaluationArtifact: vi.fn(async (name) => ({ ok: true, remotePath: `C:/srv/${name}` })),
    optimizeHoistPositions: vi.fn(async () => ({ ok: true, report })),
  })

  beforeEach(() => {
    useStageStore.setState({ stages: [richStage()], stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 500, y: 100, z: 1000 } } } })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
  })

  it('방식 미선택이면 실패', async () => {
    setHost(makeOptHost())
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/권상 방식/)
  })

  it('옵티마이저 채널 없으면 실패(아무것도 적용 안 함)', async () => {
    setHost({ name: 'web', uploadEvaluationArtifact: vi.fn(async () => ({ ok: true, remotePath: 'C:/srv/x' })) })
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/최적화 채널/)
  })

  it('hydro: 그룹수 4..1 스윕 → 4회 호출, PASS 후보 반환', async () => {
    const host = makeOptHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(true)
    expect(host.optimizeHoistPositions).toHaveBeenCalledTimes(4)
    expect(r.hasPass).toBe(true)
    expect(r.candidates[0].overallStatus).toBe('pass')
  })

  it('ceiling: 그룹 1개 시드로 1회만 호출', async () => {
    const host = makeOptHost()
    setHost(host)
    useEditStore.getState().setHoistMode('ceiling')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(true)
    expect(host.optimizeHoistPositions).toHaveBeenCalledTimes(1)
  })

  it('반환 후보를 applyAutoHoistGroups 로 커밋하면 hoistGroups 에 반영', async () => {
    setHost(makeOptHost())
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    const { toNodeGroups } = await import('../data/hoistCandidateRank.js')
    const applied = useEditStore.getState().applyAutoHoistGroups(toNodeGroups(r.candidates[0]))
    expect(applied.ok).toBe(true)
    expect(useEditStore.getState().hoistGroups[1]).toEqual([1, 2, 3])
  })

  it('모든 호출 실패면 ok:false + 마지막 에러', async () => {
    const host = { name: 'electron',
      uploadEvaluationArtifact: vi.fn(async (name) => ({ ok: true, remotePath: `C:/srv/${name}` })),
      optimizeHoistPositions: vi.fn(async () => ({ ok: false, error: '엔진 실패' })) }
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/엔진 실패/)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- useEditStore`
Expected: FAIL — `autoSelectHoistPositions is not a function`.

- [ ] **Step 3: import 추가**

`src/store/useEditStore.js` 상단 import 구역(다른 `../data/...` import 옆)에 추가:

```js
import { rankHoistCandidates } from '../data/hoistCandidateRank.js'
```

- [ ] **Step 4: 모듈 헬퍼 추가**

`src/store/useEditStore.js` 의 `function currentStage() { ... }` 정의 **바로 아래**에 추가:

```js
/** 권상 방식별 그룹수 스윕 목록 (큰 수부터). 슬롯 한계상 4 로 캡. */
export function hoistSweepGroupCounts(mode) {
  if (mode === 'ceiling') return [1]
  const max = Math.min(getHoistMaxGroups(mode) ?? 4, 4)
  const arr = []
  for (let k = max; k >= 1; k--) arr.push(k)
  return arr
}

/** Stage0 파싱용 시드 노드 — 유효 좌표를 가진 앞쪽 n 개 노드 ID. */
function pickSeedNodeIds(stage, n) {
  const ids = []
  if (!stage?.nodeMap) return ids
  for (const [id, node] of stage.nodeMap) {
    if (node && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)) {
      ids.push(id)
      if (ids.length >= n) break
    }
  }
  return ids
}
```

- [ ] **Step 5: store 액션 추가**

`src/store/useEditStore.js` 에서 기존 `optimizeHoistGroups: async (...) => { ... },` 블록 **바로 위**에 아래 액션을 추가(같은 store object 안):

```js
  /**
   * 권상 위치 자동 선정 (Approach B). 방식별 그룹수를 스윕하며 ModuleAnalysis.Cli --optimize 를
   * 자세안정성 평가 절차로 호출하고, 모든 결과를 병합·랭킹해 돌려준다. 검증된 후보만 반환하며
   * 적용(커밋)은 호출 측이 applyAutoHoistGroups(toNodeGroups(후보)) 로 수행한다.
   *
   * @param {{ onProgress?: (p:{done:number,total:number,groupCount:number})=>void }} [opts]
   * @returns {Promise<{ok:boolean, candidates?:Array, hasPass?:boolean, error?:string}>}
   */
  autoSelectHoistPositions: async (opts = {}) => {
    const state = get()
    const mode = state.hoistMode
    if (!mode) return { ok: false, error: '권상 방식(STEP 1)을 먼저 선택해 주세요.' }

    const host = getHost()
    if (typeof host.optimizeHoistPositions !== 'function') {
      return { ok: false, error: 'WorkBench 앱이 권상 위치 최적화 채널을 지원하지 않습니다. WorkBench를 최신 버전으로 실행해 주세요.' }
    }

    const stage = currentStage()
    if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) {
      return { ok: false, error: '모델이 로드되지 않았습니다.' }
    }

    // Stage0 파싱 보장용 시드 hoisting (특히 Crane=그룹1 고정). 옵티마이저는 시드를 무시하고 자체 후보 생성.
    const base = getHoistExport(state)
    if (!base) return { ok: false, error: '권상 방식을 먼저 선택해 주세요.' }
    const seedGroups = base.groups.length > 0
      ? base.groups
      : [{ id: 1, nodeIds: pickSeedNodeIds(stage, 3) }]
    if (!seedGroups[0] || seedGroups[0].nodeIds.length === 0) {
      return { ok: false, error: '권상 시드로 쓸 유효한 노드를 찾지 못했습니다.' }
    }
    const hoisting = { ...base, groupCount: seedGroups.length, groups: seedGroups }

    // 편집 intents 가 있으면 편집 모델 _edited.json 저장(평가 경로와 동일). 없으면 폴백(소스 JSON) 사용.
    const intents = state.intents ?? []
    let editedFileName = null
    if (intents.length > 0) {
      const editedJson = buildEditedStageJson(stage, intents)
      editedFileName = buildEditedStageFileName(stage, formatTimestamp)
      const er = await saveJsonArtifact(editedFileName, JSON.stringify(editedJson, null, 2))
      if (!er.ok) return { ok: false, error: `편집 모델 저장 실패: ${er.error ?? '알 수 없는 오류'}` }
    }

    const allowedNodeIds = [...stage.nodeMap.keys()]
    const pointsPerGroup = mode === 'goliat' ? 4 : mode === 'ceiling' ? 3 : 4
    const groupCounts = hoistSweepGroupCounts(mode)
    const postureFileName = buildPosturePayloadFileName(stage)  // <base>_posture.json 고정(폴백 모델 해석)

    const reports = []
    let lastError = null
    let done = 0
    for (const k of groupCounts) {
      opts.onProgress?.({ done, total: groupCounts.length, groupCount: k })
      const payload = buildPostureStabilityPayload(
        { ...state, hoistOptimization: { desiredGroupCount: k, pointsPerGroup, allowedNodeIds } },
        hoisting, stage, editedFileName,
      )
      const sr = await saveJsonArtifact(postureFileName, JSON.stringify(payload, null, 2))
      if (!sr.ok) { lastError = sr.error ?? '입력 저장 실패'; done += 1; continue }

      let posturePath = null
      if (sr.location === 'backend' && sr.remotePath) posturePath = sr.remotePath
      else if (sr.location === 'folder') {
        const folderRef = useStageStore.getState().sourceFolderRef
        if (typeof folderRef === 'string' && folderRef.length > 0) posturePath = joinPath(folderRef, postureFileName)
      }
      if (!posturePath) { lastError = '_posture.json 절대경로를 확인할 수 없습니다.'; done += 1; continue }

      const r = await host.optimizeHoistPositions(posturePath)
      if (r.ok && r.report) reports.push(r.report)
      else lastError = r.error ?? '권상 위치 최적화 실패'
      done += 1
      opts.onProgress?.({ done, total: groupCounts.length, groupCount: k })
    }

    const candidates = rankHoistCandidates(reports)
    if (candidates.length === 0) {
      return { ok: false, error: lastError ?? '평가 가능한 권상 후보를 찾지 못했습니다.' }
    }
    return { ok: true, candidates, hasPass: candidates.some(c => c.overallStatus === 'pass') }
  },
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm run test -- useEditStore`
Expected: PASS (신규 6 + 기존 테스트 모두 GREEN).

- [ ] **Step 7: 커밋**

```bash
git add src/store/useEditStore.js src/store/useEditStore.test.js
git commit -m "feat(hoist-auto): 그룹수 스윕 오케스트레이터 autoSelectHoistPositions 추가"
```

---

## Task 3: 결과 모달 (`HoistAutoResultModal.jsx`)

**Files:**
- Create: `src/components/HoistAutoResultModal.jsx`

- [ ] **Step 1: 컴포넌트 작성**

Create `src/components/HoistAutoResultModal.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { Loader2, X, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { toNodeGroups } from '../data/hoistCandidateRank.js'

const STATUS_STYLE = {
  pass: { color: '#37E08A', bg: 'rgba(55,224,138,0.12)', border: 'rgba(55,224,138,0.5)', Icon: CheckCircle2, label: 'PASS' },
  warn: { color: '#FFC447', bg: 'rgba(255,196,71,0.12)', border: 'rgba(255,196,71,0.5)', Icon: AlertTriangle, label: 'WARN' },
  fail: { color: '#FF6677', bg: 'rgba(255,102,119,0.12)', border: 'rgba(255,102,119,0.5)', Icon: XCircle, label: 'FAIL' },
}
const styleFor = (s) => STATUS_STYLE[s] ?? STATUS_STYLE.fail
const fmt = (v, unit = '') => (v == null ? '–' : `${Math.round(v)}${unit}`)

export default function HoistAutoResultModal({ onClose }) {
  const autoSelect = useEditStore(s => s.autoSelectHoistPositions)
  const applyGroups = useEditStore(s => s.applyAutoHoistGroups)

  const [running, setRunning] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 1, groupCount: 0 })
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [committed, setCommitted] = useState(false)

  // 진입 시점 상태 스냅샷 — 미리보기는 실제 hoistGroups 를 변경하므로 취소 시 복원한다.
  const snapshotRef = useRef(null)
  useEffect(() => {
    const s = useEditStore.getState()
    snapshotRef.current = {
      hoistMode: s.hoistMode, hoistGroupCount: s.hoistGroupCount,
      hoistGroups: s.hoistGroups, activeHoistGroupId: s.activeHoistGroupId,
    }
  }, [])

  // 마운트 시 스윕 실행.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await autoSelect({ onProgress: (p) => { if (alive) setProgress(p) } })
      if (!alive) return
      setRunning(false)
      if (!r.ok) { setError(r.error); return }
      setCandidates(r.candidates)
      const first = r.candidates[0]
      if (first) { setSelectedId(first.id); applyGroups(toNodeGroups(first)) }  // 최고안 미리보기
    })()
    return () => { alive = false }
  }, [autoSelect, applyGroups])

  const restore = () => { if (snapshotRef.current) useEditStore.setState(snapshotRef.current) }
  const handleCancel = () => { if (!committed) restore(); onClose() }
  const handlePreview = (c) => { setSelectedId(c.id); applyGroups(toNodeGroups(c)) }
  const handleApply = () => {
    const c = candidates.find(x => x.id === selectedId)
    if (!c) return
    applyGroups(toNodeGroups(c))
    setCommitted(true)
    onClose()
  }

  const hasPass = candidates.some(c => c.overallStatus === 'pass')
  const selected = candidates.find(c => c.id === selectedId) ?? null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(4,4,16,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(720px, 94vw)', maxHeight: '88vh', background: '#0b0b1e', border: '1px solid #25254a', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e1e38' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#90E8FF' }}>권상 위치 자동 선정 — 자세안정성 평가 결과</span>
          <button onClick={handleCancel} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#8aa0b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cad8e8', fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
              자세안정성 평가 중… (그룹수 {progress.groupCount} · {progress.done}/{progress.total})
            </div>
          )}

          {!running && error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,102,119,0.10)', border: '1px solid rgba(255,102,119,0.5)', color: '#FF99A6', fontSize: 12.5, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {!running && !error && !hasPass && candidates.length > 0 && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(255,196,71,0.10)', border: '1px solid rgba(255,196,71,0.5)', color: '#FFC447', fontSize: 12, lineHeight: 1.5 }}>
              자세안정성 PASS 후보를 찾지 못했습니다. 아래는 차선 후보입니다 — 권상 방식 또는 그룹 수 조정을 권장합니다.
            </div>
          )}

          {!running && !error && candidates.map((c, i) => {
            const st = styleFor(c.overallStatus)
            const active = c.id === selectedId
            return (
              <button key={c.id} onClick={() => handlePreview(c)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: active ? st.bg : '#0f0f22', border: `1px solid ${active ? st.border : '#2a2a4a'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <st.Icon size={15} color={st.color} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: st.color }}>#{i + 1} · {st.label}</span>
                  <span style={{ fontSize: 11, color: '#8aa0b8' }}>{c.groupCount}그룹 · 포인트 {c.groups.reduce((n, g) => n + g.nodeIds.length, 0)}개</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: '#9fb4cc' }}>
                  <span>Stage6 여유 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.stage6MarginMm, 'mm')}</b></span>
                  <span>최소 슬링각 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.minSlingAngleDeg, '°')}</b></span>
                  <span>간섭 <b style={{ color: '#cfe6ff' }}>{c.metrics.wireConflictCount}</b></span>
                  <span>score <b style={{ color: '#cfe6ff' }}>{fmt(c.score)}</b></span>
                </div>
              </button>
            )
          })}
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid #1e1e38' }}>
          <button onClick={handleCancel} style={{ padding: '8px 14px', borderRadius: 7, background: '#101024', border: '1px solid #2a2a4a', color: '#cad8e8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
          <button onClick={handleApply} disabled={!selected} style={{ padding: '8px 16px', borderRadius: 7, background: selected ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18', border: `1px solid ${selected ? '#2BD380' : '#2a2a4a'}`, color: selected ? '#F0FFF4' : '#3a3a52', fontSize: 12, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed' }}>이 안 적용</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: SUCCESS (exit 0). (이 모달은 Task 4 에서 패널에 연결되기 전까지 import 되지 않으므로 빌드만 통과 확인.)

- [ ] **Step 3: 커밋**

```bash
git add src/components/HoistAutoResultModal.jsx
git commit -m "feat(hoist-auto): 자세안정성 결과 랭킹·미리보기·적용 모달 추가"
```

---

## Task 4: 패널 재배선 (`HoistPositionPanel.jsx`)

**Files:**
- Modify: `src/components/HoistPositionPanel.jsx`

- [ ] **Step 1: import 교체**

`src/components/HoistPositionPanel.jsx` 14~15 행:

```jsx
import { useHoistLayoutStore } from '../store/useHoistLayoutStore.js'
import HoistAutoLayoutEditor from './HoistAutoLayoutEditor.jsx'
```

를 아래로 교체:

```jsx
import HoistAutoResultModal from './HoistAutoResultModal.jsx'
```

- [ ] **Step 2: 구 자동레이아웃 셀렉터 제거 + 모달 open 상태 추가**

96~98 행의 다음 블록:

```jsx
  // 권상 위치 자동 선정 (독립 도구) — XY 모달 store
  const openAutoLayout = useHoistLayoutStore(s => s.openEditor)
  const autoRegionCount = useHoistLayoutStore(s => Object.keys(s.suggestions).length)
  const autoPointCount = useHoistLayoutStore(s => Object.values(s.suggestions).reduce((n, ids) => n + (ids?.length ?? 0), 0))
  const hasModel = (stages?.length ?? 0) > 0
```

를 아래로 교체:

```jsx
  const hasModel = (stages?.length ?? 0) > 0
  const [autoModalOpen, setAutoModalOpen] = useState(false)
  const canAutoSelect = hasModel && !!mode
```

(`useState` 는 파일 1행에서 이미 import 됨.)

- [ ] **Step 3: 버튼/요약/모달 마크업 교체**

165~186 행의 버튼+요약+`<HoistAutoLayoutEditor />` 블록 전체:

```jsx
      {/* ── 권상 위치 자동 선정 (독립 도구) ── */}
      <button
        onClick={() => { if (hasModel) openAutoLayout() }}
        disabled={!hasModel}
        title={hasModel ? 'XY 구역 분할 + 권상 최적안 자동 제안' : '모델을 먼저 로드하세요'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 10px', borderRadius: 7, width: '100%',
          background: hasModel ? 'linear-gradient(90deg, rgba(0,209,255,0.18), rgba(181,124,255,0.18))' : '#101024',
          color: hasModel ? '#E8FBFF' : '#4a5a72',
          border: `1px solid ${hasModel ? '#00D1FF' : '#2a2a4a'}`,
          cursor: hasModel ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 800,
        }}>
        <Sparkles size={14} /> 권상 위치 자동 선정
      </button>
      {autoRegionCount > 0 && (
        <div style={{ fontSize: 10.5, color: '#8aa0b8', textAlign: 'center', marginTop: -2 }}>
          자동 선정: {autoRegionCount}구역 · 권상 포인트 {autoPointCount}개
        </div>
      )}

      {/* XY 모달 — open 상태일 때만 렌더 */}
      <HoistAutoLayoutEditor />
```

를 아래로 교체:

```jsx
      {/* ── 권상 위치 자동 선정 — 자세안정성 평가 기반 ── */}
      <button
        onClick={() => { if (canAutoSelect) setAutoModalOpen(true) }}
        disabled={!canAutoSelect}
        title={!hasModel ? '모델을 먼저 로드하세요' : !mode ? 'STEP 1 에서 권상 방식을 먼저 선택하세요' : '자세안정성 평가로 최적 권상 위치를 엄선해 제안합니다'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 10px', borderRadius: 7, width: '100%',
          background: canAutoSelect ? 'linear-gradient(90deg, rgba(0,209,255,0.18), rgba(181,124,255,0.18))' : '#101024',
          color: canAutoSelect ? '#E8FBFF' : '#4a5a72',
          border: `1px solid ${canAutoSelect ? '#00D1FF' : '#2a2a4a'}`,
          cursor: canAutoSelect ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 800,
        }}>
        <Sparkles size={14} /> 권상 위치 자동 선정
      </button>
      {!mode && hasModel && (
        <div style={{ fontSize: 10.5, color: '#8aa0b8', textAlign: 'center', marginTop: -2 }}>
          STEP 1 권상 방식 선택 후 사용 가능
        </div>
      )}

      {autoModalOpen && <HoistAutoResultModal onClose={() => setAutoModalOpen(false)} />}
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: SUCCESS (exit 0). `useHoistLayoutStore`/`HoistAutoLayoutEditor` 참조가 패널에서 사라졌는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/components/HoistPositionPanel.jsx
git commit -m "feat(hoist-auto): 패널 자동선정 버튼을 자세안정성 결과 모달로 재배선"
```

---

## Task 5: 구 JS 선정 모듈 제거 + 구 액션 정리

**Files:**
- Delete: `src/data/hoistAutoLayout.js`, `src/data/hoistAutoLayout.test.js`
- Delete: `src/store/useHoistLayoutStore.js`, `src/store/useHoistLayoutStore.test.js`
- Delete: `src/components/HoistAutoLayoutEditor.jsx`
- Modify: `src/store/useEditStore.js` (구 `optimizeHoistGroups` 제거)

- [ ] **Step 1: 잔존 참조 확인 (없어야 함)**

Run: `git grep -n "hoistAutoLayout\|useHoistLayoutStore\|HoistAutoLayoutEditor"`
Expected: 위 삭제 대상 파일 내부 참조만 출력(외부 참조 0). 외부 참조가 있으면 먼저 제거.

- [ ] **Step 2: 구 액션 제거**

`src/store/useEditStore.js` 에서 `optimizeHoistGroups: async (seedNodeGroups, optimization = null) => { ... },` 블록 전체를 삭제한다(여는 줄 ~ 닫는 `},` 까지). `autoSelectHoistPositions` 는 유지.

- [ ] **Step 3: 파일 삭제**

```bash
git rm src/data/hoistAutoLayout.js src/data/hoistAutoLayout.test.js \
       src/store/useHoistLayoutStore.js src/store/useHoistLayoutStore.test.js \
       src/components/HoistAutoLayoutEditor.jsx
```

- [ ] **Step 4: 전체 테스트 + 빌드 GREEN 확인**

Run: `npm run test`
Expected: PASS (삭제된 테스트 제외, 나머지 전부 GREEN. `optimizeHoistGroups`/`useHoistLayoutStore` 참조 잔존으로 인한 실패 없음).

Run: `npm run build`
Expected: SUCCESS (exit 0).

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor(hoist-auto): 구 JS 구역선정(hoistAutoLayout/useHoistLayoutStore/모달)·optimizeHoistGroups 제거"
```

---

## Task 6: 최종 검증

- [ ] **Step 1: 전체 테스트**

Run: `npm run test`
Expected: 전부 PASS.

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: exit 0, `dist/` 생성.

- [ ] **Step 3: 수동 확인 체크리스트(앱 실행)**

`npm run dev` 후, 모델 로드 → Hoist 탭:
- STEP1 방식 미선택 시 "권상 위치 자동 선정" 버튼 비활성 + 안내문.
- 방식 선택 후 버튼 클릭 → 모달이 진행률("그룹수 4 평가 중…") 표시 → 랭킹 리스트.
- PASS 후보가 3D 에 미리보기로 강조됨. 후보 클릭 시 미리보기 전환.
- "취소" → 원래 hoistGroups 복원(미리보기 자국 없음).
- "이 안 적용" → hoistGroups 에 커밋, STEP2 칩에 반영, STEP4 평가 실행 가능.

---

## 배포 메모 (작업 후 보고에 포함)

- 변경은 **전부 `ModuleUnitStudio` 프론트(git 추적)**. C# `ModuleUnitAnalysis`·`InHouseProgram` 무수정 → **서버(145) 수동 교체 불필요.**
- 스튜디오 zip 배포 시: `npm run package` → `release/module-unit-studio-<ver>.zip` → ① 백엔드-로컬 `HiTessWorkBenchBackEnd/StudioProgram/` ② UNC 아카이브 양쪽 복사, `package.json` 버전 1곳만 bump. (배포는 사용자 요청 시 별도 수행.)

## Self-Review 결과

- **Spec 커버리지:** §5 흐름→Task3·4, §6 제거→Task5, §6 추가(autoSelect/rank/modal)→Task1·2·3, §7 스윕범위→`hoistSweepGroupCounts`, §9 에러/PASS실패→모달 분기+Task2 반환, §10 테스트→Task1·2+Task6. 모두 매핑됨.
- **Placeholder 스캔:** 모든 코드 단계에 완전한 코드 포함, "TODO/적절히 처리" 없음.
- **타입 일관성:** `rankHoistCandidates`/`toNodeGroups`/`normalizeCandidate`/`compareCandidates`/`candidateSignature`(Task1) ↔ `autoSelectHoistPositions`(Task2) ↔ 모달(Task3) ↔ `applyAutoHoistGroups`(기존) 시그니처 일치 확인.
