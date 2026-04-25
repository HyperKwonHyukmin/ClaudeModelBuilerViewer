import { create } from 'zustand'
import { loadFiles } from '../data/fileLoader.js'

export const useStageStore = create((set) => ({
  stages: [],
  loading: false,
  error: null,

  loadStages: async (fileList) => {
    set({ loading: true, error: null })
    try {
      const stages = await loadFiles(fileList)
      if (stages.length === 0) {
        set({ loading: false, error: 'JSON 파일을 찾을 수 없습니다.' })
        return
      }
      set({ stages, loading: false })
    } catch (err) {
      set({ loading: false, error: `로드 실패: ${err.message}` })
    }
  },
}))
