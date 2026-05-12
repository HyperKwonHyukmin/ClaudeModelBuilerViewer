/**
 * 그룹 색 팔레트 — LayerPanel 버튼과 3D 모델 인스턴스가 같은 색을 쓰도록 단일 공급원으로 통일.
 *
 * 한 곳에서 채도·명도와 total 산정 규칙을 관리해 두 표시 영역이 어긋나지 않게 한다.
 */

// Dark-background friendly, high-contrast palette.
// The first color is intentionally yellow so group 1 is prominent without using red.
const GROUP_COLORS = [
  '#FFD23F', // yellow
  '#00C2FF', // cyan-blue
  '#FF4DB8', // magenta
  '#53E36D', // green
  '#FF8A3D', // orange
  '#8B5CF6', // violet
  '#00D1B2', // teal
  '#F25F5C', // coral red
  '#B8F35A', // lime
  '#4D96FF', // blue
  '#C9CED6', // light neutral, used for "others" when present
]

/**
 * 모델 확인 패널이 보여주는 그룹 카드 구성:
 *   - 그룹 11개 이상일 때만 상위 10개 + "기타"로 묶고, 그 외엔 모두 개별 카드
 *   - displayCount는 색 hue 정규화의 분모로 쓰인다 (LayerPanel·BeamMesh가 동일 분모를 써야 색이 일치).
 *     실제 색은 고대비 고정 팔레트에서 가져온다. maxIndividual + 기타가 최대 11개라
 *     반복 없이 충분히 구분되는 색을 제공할 수 있다.
 *
 * @param {Array<{elementIds:number[]}>} groups
 * @returns {{ maxIndividual: number, hasOthers: boolean, displayCount: number }}
 */
export function getGroupDisplayCount(groups) {
  const len = groups?.length ?? 0
  const maxIndividual = Math.min(len, 10)
  const hasOthers     = len > maxIndividual
  const displayCount  = maxIndividual + (hasOthers ? 1 : 0)
  return { maxIndividual, hasOthers, displayCount }
}

/** index → CSS hsl() 문자열 (LayerPanel 버튼용) */
export function groupColorCss(index, displayCount) {
  return GROUP_COLORS[paletteIndex(index, displayCount)]
}

/** index → THREE.Color (target에 채워서 반환 — InstancedMesh.setColorAt 용) */
export function groupColorThree(target, index, displayCount) {
  return target.set(GROUP_COLORS[paletteIndex(index, displayCount)])
}

function paletteIndex(index, displayCount) {
  const count = Math.max(displayCount, 1)
  const safe = ((index % count) + count) % count
  return safe % GROUP_COLORS.length
}
