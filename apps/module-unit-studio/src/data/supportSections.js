/**
 * 가서포트(보강) 단면 카탈로그.
 *
 * 사내 CAD 구조 CSV(`size` 열)에 실제로 등장하는 앵글 3종만 노출한다 — 이 셋이
 * 현장에서 가서포트로 쓰이는 규격이다. 임의 치수 입력을 열지 않는 이유는, CSV 로
 * 다시 내보낸 값이 ModelBuilder 의 `ANG_<w>x<h>x<t>` 파서를 그대로 통과해야 하기 때문이다.
 *
 * ── 치수 규약 (⚠ 바꾸지 말 것) ────────────────────────────────────────────
 * CSV 의 `ANG_100x100x10` → ModelBuilder 가 dims [100,100,10] 으로 읽고
 * `FeModelBuilder.NormalizeDims` 가 L 은 3개일 때 [d0,d1,d2,d2] 로 늘린다.
 * 즉 PBEAML L 의 DIM = [수평다리, 수직다리, tw, tf] 이며 두 두께가 같다.
 * 이 파일의 `dims` 는 그 4개짜리 최종형이고, `computeCrossSectionAreaMm2('L')`
 * (= W·tf + (H−tf)·tw) 와 `makeSection('L')` 이 같은 순서를 기대한다.
 *
 * 실측 확인: 사내 모델 BDF 의 PBEAML L 카드가 100/100/10/10 · 100/100/13/13 ·
 * 130/130/12/12 로 존재한다(3370_M04.bdf).
 */

/** @type {{ id:string, label:string, csvSize:string, kind:'L', dims:number[] }[]} */
export const SUPPORT_SECTIONS = [
  { id: 'ANG_100x100x10', label: 'L100×100×10t', csvSize: 'ANG_100x100x10', kind: 'L', dims: [100, 100, 10, 10] },
  { id: 'ANG_100x100x13', label: 'L100×100×13t', csvSize: 'ANG_100x100x13', kind: 'L', dims: [100, 100, 13, 13] },
  { id: 'ANG_130x130x12', label: 'L130×130×12t', csvSize: 'ANG_130x130x12', kind: 'L', dims: [130, 130, 12, 12] },
]

/** 기본 단면 — 0.0.150 까지 유일하게 쓰이던 규격이라 기존 모델과 호환된다. */
export const DEFAULT_SUPPORT_SECTION_ID = 'ANG_100x100x10'

const BY_ID = new Map(SUPPORT_SECTIONS.map(s => [s.id, s]))

/** id 로 단면을 찾는다. 모르는 id 면 기본 단면(L100×100×10t). */
export function getSupportSection(sectionId) {
  return BY_ID.get(sectionId) ?? BY_ID.get(DEFAULT_SUPPORT_SECTION_ID)
}

/**
 * intent.params 에서 단면을 복원한다.
 *
 * 0.0.150 이전에 만들어진 intent 에는 `sectionId` 가 없고 `dims` 만 있다(모두 100×100×10t).
 * 그래서 id → dims 순으로 찾고, 그래도 못 찾으면 기본 단면으로 떨어진다.
 * 불러온 편집 의도 JSON(importFromFile)에도 같은 규칙이 적용된다.
 */
export function resolveSupportSection(params) {
  const byId = params?.sectionId != null ? BY_ID.get(params.sectionId) : null
  if (byId) return byId
  const dims = params?.dims
  if (Array.isArray(dims)) {
    const hit = SUPPORT_SECTIONS.find(s => s.dims.every((d, i) => d === dims[i]))
    if (hit) return hit
  }
  return BY_ID.get(DEFAULT_SUPPORT_SECTION_ID)
}

/** intent.params → 화면·설명 문구용 라벨 (예: 'L130×130×12t'). */
export function supportSectionLabel(params) {
  return resolveSupportSection(params).label
}

/** intent.params 를 만든다 — pickSupportNode / addSupportBeam 공용. */
export function buildSupportBeamParams(startNode, endNode, sectionId) {
  const sec = getSupportSection(sectionId)
  return {
    startNode,
    endNode,
    sectionId: sec.id,
    sectionKind: sec.kind,
    dims: [...sec.dims],
  }
}
