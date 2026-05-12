import { create } from 'zustand'

/**
 * useUnitStructuralStore — Wire 포함 BDF + Nastran SOL 101 결과 (nastranResult.json) 보관.
 *
 * IPC 흐름:
 *   1. UnitStructuralPanel — host.runUnitStructural({ stabilityPath, safetyFactor, allowableMpa })
 *   2. host.onUnitStructuralProgress(cb) 로 polling 진행 stream 수신 → setProgress
 *   3. resolve 시 setSuccess / setFailure
 *
 * Phase 5 (색맵핑 viewer) 가 store.result 의 members[] / wires[] 를 직접 사용한다.
 *
 * 동시 실행은 1개로 제한 (status === 'Running' 인 동안 새 실행 거절).
 */
export const useUnitStructuralStore = create((set) => ({
  // 실행 상태 — null | 'Pending' | 'Running' | 'Success' | 'Failed'
  status: null,
  progress: 0,        // 0~100
  message: '',

  // 결과 (성공 시) — nastranResult.json 의 컨텐츠
  result: null,
  resultPath: null,
  analysisId: null,
  summary: null,
  warnings: [],

  // 에러 (실패 시) — { message, stderr? }
  error: null,

  // 입력 옵션 (사용자 변경 가능)
  safetyFactor: 1.2,
  allowableMpa: 220,

  // 패널 가시성
  panelOpen: true,

  // 마지막 실행 ISO timestamp
  ranAt: null,

  setSafetyFactor: (v) => {
    const n = Number(v)
    set({ safetyFactor: Number.isFinite(n) && n > 0 ? n : 1.2 })
  },
  setAllowableMpa: (v) => {
    const n = Number(v)
    set({ allowableMpa: Number.isFinite(n) && n > 0 ? n : 220 })
  },

  // polling stream 갱신 — main process 가 viewer:unit-structural-progress 로 push
  setProgress: ({ status, progress, message }) => set({
    status: status ?? null,
    progress: typeof progress === 'number' ? progress : 0,
    message: message ?? '',
  }),

  setSuccess: ({ analysisId, summary, warnings, resultPath, result }) => set({
    status: 'Success',
    progress: 100,
    message: 'Unit 구조 해석 완료',
    analysisId: analysisId ?? null,
    summary: summary ?? null,
    warnings: Array.isArray(warnings) ? warnings : [],
    resultPath: resultPath ?? null,
    result: result ?? null,
    error: null,
    ranAt: new Date().toISOString(),
  }),

  setFailure: (error) => set({
    status: 'Failed',
    progress: 100,
    message: typeof error === 'string' ? error : (error?.error ?? error?.message ?? '실패'),
    error: typeof error === 'string' ? { message: error } : error,
    ranAt: new Date().toISOString(),
  }),

  setStarted: () => set({
    status: 'Pending',
    progress: 0,
    message: '큐 대기...',
    error: null,
    result: null,
    resultPath: null,
    analysisId: null,
    summary: null,
    warnings: [],
  }),

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  reset: () => set({
    status: null, progress: 0, message: '',
    result: null, resultPath: null, analysisId: null, summary: null, warnings: [],
    error: null, ranAt: null,
  }),
}))

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__unitStructuralStore = useUnitStructuralStore
}
