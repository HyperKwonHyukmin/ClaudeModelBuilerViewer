import { create } from 'zustand'
import { emptyLoadSummary, loadFiles } from '../data/fileLoader.js'
import { useViewerStore } from './useViewerStore.js'
// useEditStore 는 순환 의존(useEditStore → useStageStore)을 피하기 위해 사용 시점에 동적 import 한다.

export const useStageStore = create((set) => ({
  stages: [],
  inputAudit: null,
  // 00_StageSummary.json 파싱 결과 — 우하단 전체 질량 표시 + 무게중심 마커가 사용.
  stageSummary: null,
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

  reset: () => set({ stages: [], inputAudit: null, stageSummary: null, loading: false, error: null, loadSummary: emptyLoadSummary(), sourceFolderRef: null }),

  loadStages: async (fileList) => {
    set({ loading: true, error: null })
    try {
      const { stages, inputAudit, stageSummary, summary } = await loadFiles(fileList)
      if (stages.length === 0) {
        set({ loading: false, loadSummary: summary, error: 'JSON 파일을 찾을 수 없습니다. .json 파일을 선택해 주세요.' })
        return
      }
      set({ stages, inputAudit, stageSummary, loading: false, loadSummary: summary })
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
}))
