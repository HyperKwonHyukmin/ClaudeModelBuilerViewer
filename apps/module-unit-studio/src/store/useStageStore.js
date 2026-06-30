import { create } from 'zustand'
import { emptyLoadSummary, loadFiles } from '../data/fileLoader.js'
import { useViewerStore } from './useViewerStore.js'
import { useStabilityStore } from './useStabilityStore.js'
import { useUnitStructuralStore } from './useUnitStructuralStore.js'
import { collectPipeMaterialIds, applyPipeFluidEmpty, PIPE_STEEL_RHO } from '../data/pipeFluid.js'
// useEditStore 는 순환 의존(useEditStore → useStageStore)을 피하기 위해 사용 시점에 동적 import 한다.

export const useStageStore = create((set) => ({
  stages: [],
  inputAudit: null,
  // 00_StageSummary.json 파싱 결과 — 우하단 전체 질량 표시 + 무게중심 마커가 사용.
  stageSummary: null,
  // 배관 내부 유체 비우기 적용 여부 (false→true). 새 폴더 로드/reset 시 false.
  pipeFluidEmptied: false,
  // 배관 유체 비우기 전 원본 rho 값 백업 맵
  pipeFluidOriginalRhoMap: null,
  // 모델 회전 적용 여부 (누적). 새 폴더 로드/reset 시 false. stale stageSummary 게이트에 사용.
  modelRotated: false,
  loading: false,
  error: null,
  loadSummary: emptyLoadSummary(),
  // 사용자가 "폴더 열기" 로 받은 폴더에 대한 host 별 불투명 참조.
  // - WebHost  : FileSystemDirectoryHandle
  // - ElectronHost : 폴더의 절대 경로 문자열
  // 편집 모드 export 시 host.writeFile(folderRef, ...) 으로 다시 host 에 넘긴다.
  // "파일 열기" 로 단일/다중 파일을 선택한 경우 null 이며 export 는 picker/download 폴백을 쓴다.
  sourceFolderRef: null,

  setSourceFolderRef: (ref) => set({ sourceFolderRef: ref ?? null }),

  reset: () => set({ stages: [], inputAudit: null, stageSummary: null, loading: false, error: null, loadSummary: emptyLoadSummary(), sourceFolderRef: null, pipeFluidEmptied: false, pipeFluidOriginalRhoMap: null, modelRotated: false }),

  loadStages: async (fileList) => {
    set({ loading: true, error: null })
    try {
      const { stages, inputAudit, stageSummary, summary } = await loadFiles(fileList)
      if (stages.length === 0) {
        set({ loading: false, loadSummary: summary, error: 'JSON 파일을 찾을 수 없습니다. .json 파일을 선택해 주세요.' })
        return
      }
      set({ stages, inputAudit, stageSummary, loading: false, loadSummary: summary, pipeFluidEmptied: false, pipeFluidOriginalRhoMap: null, modelRotated: false })
      // 모든 viewport를 마지막 단계(보통 Validation)로 시작 — 최종 모델을 먼저 보여준다
      useViewerStore.getState().resetViewportStages(stages.length - 1)
      // 새 폴더로 노드 ID 체계가 바뀔 수 있으므로 권상 그룹 노드 선택을 모두 초기화한다
      // (그룹별 도형 미리보기는 hoistGroups 에서 파생되므로 이걸로 함께 사라진다).
      const { useEditStore } = await import('./useEditStore.js')
      const editState = useEditStore.getState()
      for (const id of [1, 2, 3, 4]) editState.clearHoistGroup(id)
    } catch (err) {
      set({ loading: false, error: `로드 실패: ${err.message}` })
    }
  },

  /**
   * 모든 Pipe 요소가 참조하는 material 의 rho 를 7.85e-9 로 비운다.
   * - in-memory stage 를 mutate 하고 stages 를 새 참조로 교체해 질량/무게중심 재계산을 유발.
   * - 호출자(Sidebar)가 반환된 materialIds 로 emptyPipeFluid edit intent 를 추가한다.
   * @returns {{ materialIds: number[], changedCount: number }}
   */
  emptyPipeFluid: () => {
    const stages = useStageStore.getState().stages
    if (!Array.isArray(stages) || stages.length === 0) {
      return { materialIds: [], changedCount: 0, invalidatedStability: false }
    }
    const last = stages[stages.length - 1]
    const ids = collectPipeMaterialIds(last)

    // 원본 rho 값 백업
    const originalRhoMap = {}
    for (const mid of ids) {
      const mat = last.materialMap?.get?.(mid)
      if (mat) {
        originalRhoMap[mid] = mat.rho
      }
    }

    const changedCount = applyPipeFluidEmpty(stages, ids, PIPE_STEEL_RHO)
    set({ stages: [...stages], pipeFluidEmptied: true, pipeFluidOriginalRhoMap: originalRhoMap })

    // 유체를 비우면 무게중심이 바뀌므로 기존 자세안정성/구조해석 결과는 stale → 무효화한다.
    // 자세안정성 평가를 다시 실행해야(구조해석 가드가 stabilityPath 부재로 자동 차단) 새 CoG 가
    // posture → stability.json → lift-run anchor SPC 까지 일관되게 반영된다.
    let invalidatedStability = false
    if (changedCount > 0) {
      const stab = useStabilityStore.getState()
      if (stab.report || stab.stabilityPath || stab.overallStatus) {
        stab.reset()
        invalidatedStability = true
      }
      const us = useUnitStructuralStore.getState()
      if (us.status || us.result) us.reset()
    }
    return { materialIds: [...ids], changedCount, invalidatedStability }
  },

  /**
   * 백업된 원본 rho 값을 이용하여 배관 내부 유체 중량을 원래대로 복원한다.
   * @returns {{ changedCount: number, invalidatedStability: boolean }}
   */
  restorePipeFluid: () => {
    const { stages, pipeFluidOriginalRhoMap } = useStageStore.getState()
    if (!Array.isArray(stages) || stages.length === 0 || !pipeFluidOriginalRhoMap) {
      return { changedCount: 0, invalidatedStability: false }
    }

    let changedCount = 0
    for (const stage of stages) {
      for (const [midStr, originalRho] of Object.entries(pipeFluidOriginalRhoMap)) {
        const mid = Number(midStr)
        const mat = stage?.materialMap?.get?.(mid)
        if (mat && mat.rho !== originalRho) {
          mat.rho = originalRho
          changedCount++
        }
      }
    }

    set({ stages: [...stages], pipeFluidEmptied: false, pipeFluidOriginalRhoMap: null })

    let invalidatedStability = false
    if (changedCount > 0) {
      const stab = useStabilityStore.getState()
      if (stab.report || stab.stabilityPath || stab.overallStatus) {
        stab.reset()
        invalidatedStability = true
      }
      const us = useUnitStructuralStore.getState()
      if (us.status || us.result) us.reset()
    }

    return { changedCount, invalidatedStability }
  },

  /**
   * 모델 전체를 axis(X/Y/Z) 중심으로 angleDeg 회전한다 (누적, in-place).
   * - pivot 미지정 시 최종 stage 의 bbox center 로 폴백 (호출자 Sidebar 가 CoG 를 전달).
   * - 모든 stage 를 같은 pivot 으로 회전해 phase 간 정합 유지.
   * - 회전으로 형상이 바뀌므로 기존 자세안정성/구조해석 결과는 무효화(재평가 강제).
   * @param {{axis:'X'|'Y'|'Z', angleDeg:number, pivot?:{x:number,y:number,z:number}}} arg
   * @returns {{ axis:string, angleDeg:number, changedNodeCount:number, invalidatedStability:boolean }}
   */
  rotateModel: ({ axis, angleDeg, pivot = null }) => {
    const stages = useStageStore.getState().stages
    if (!Array.isArray(stages) || stages.length === 0) {
      return { axis, angleDeg, changedNodeCount: 0, invalidatedStability: false }
    }
    // 360° 의 배수(0, 360, -360 …)는 사실상 회전 없음 → no-op.
    // (실수로 0° 적용 시 modelRotated/무효화로 기존 평가가 날아가는 것을 방지)
    if (Number.isFinite(angleDeg) && ((angleDeg % 360) + 360) % 360 === 0) {
      return { axis, angleDeg, changedNodeCount: 0, invalidatedStability: false }
    }
    const last = stages[stages.length - 1]
    const p = pivot ?? last.center ?? { x: 0, y: 0, z: 0 }
    let changedNodeCount = 0
    // 좌표를 in-place 로 회전한 뒤, 회전된 stage 는 "새 참조"로 교체한다.
    // ThreeViewport 의 씬 rebuild/오버레이/CoG effect 가 stageData 참조 변경에 반응하므로,
    // 같은 객체를 그대로 두면(=배열만 새로 만들면) 회전이 화면에 반영되지 않는다.
    const rotated = stages.map((st) => {
      if (typeof st.applyRotation !== 'function') return st
      changedNodeCount += st.applyRotation(axis, angleDeg, p)
      return typeof st.shallowClone === 'function' ? st.shallowClone() : st
    })
    set({ stages: rotated, modelRotated: true })

    let invalidatedStability = false
    // 실제로 회전이 적용된 경우에만 stale 결과 무효화 (emptyPipeFluid 의 changedCount>0 가드와 동일)
    if (changedNodeCount > 0) {
      const stab = useStabilityStore.getState()
      if (stab.report || stab.stabilityPath || stab.overallStatus) {
        stab.reset()
        invalidatedStability = true
      }
      const us = useUnitStructuralStore.getState()
      if (us.status || us.result) us.reset()
    }

    return { axis, angleDeg, changedNodeCount, invalidatedStability }
  },
}))
