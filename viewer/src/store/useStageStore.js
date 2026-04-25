import { create } from 'zustand'
import { loadFiles } from '../data/fileLoader.js'
import { useViewerStore } from './useViewerStore.js'

export const useStageStore = create((set) => ({
  stages: [],
  loading: false,
  error: null,

  loadStages: async (fileList) => {
    set({ loading: true, error: null })
    try {
      const stages = await loadFiles(fileList)
      if (stages.length === 0) {
        set({ loading: false, error: 'JSON 파일을 찾을 수 없습니다. .json 파일을 선택해 주세요.' })
        return
      }
      set({ stages, loading: false })
      // Reset all viewport stage indices so no viewport points past the new array
      useViewerStore.getState().resetViewportStages()
    } catch (err) {
      set({ loading: false, error: `로드 실패: ${err.message}` })
    }
  },
}))
