import { create } from 'zustand'

/**
 * useStabilityStore — ModuleAnalysis.Cli.exe 가 산출한 _stability.json 결과를 보관한다.
 *
 * 결과 스키마(요약):
 *   {
 *     meta: { schema: 'module-analysis-stability/0.1', ... },
 *     stages: [
 *       { id, displayPolicy: 'user'|'internal', displayLabel, status: 'pass'|'warn'|'fail'|'skip',
 *         summary, process[], results[], conflicts?[], geometry? },
 *       ...
 *     ],
 *   }
 *
 * 동시 실행은 1개로 제한 (running=true 인 동안 추가 실행 거절).
 */
export const useStabilityStore = create((set, get) => ({
  // 마지막 실행 결과(_stability.json 파싱 결과)
  report: null,

  // 결과 보기 패널이 열려 있는지
  panelOpen: false,

  // 현재 실행 중 여부
  running: false,

  // 마지막 에러 ({ message, exitCode?, stderr? }) — 성공 시 null
  error: null,

  // 결과의 전반적 상태(첫 fail/warn/pass) — 토스트/배지 색에 사용
  // 'fail' | 'warn' | 'pass' | null
  overallStatus: null,

  // 마지막에 사용한 _stability.json 절대경로 (Electron 환경에서만 의미 있음)
  stabilityPath: null,

  // 마지막 실행 타임스탬프 (ISO)
  ranAt: null,

  setReport: (report, opts = {}) => {
    set({
      report,
      stabilityPath: opts.stabilityPath ?? null,
      overallStatus: deriveOverallStatus(report),
      ranAt: new Date().toISOString(),
      error: null,
    })
  },

  setError: (error) => {
    set({
      error: typeof error === 'string' ? { message: error } : error,
      ranAt: new Date().toISOString(),
    })
  },

  setRunning: (running) => set({ running: !!running }),

  openPanel:  () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set(s => ({ panelOpen: !s.panelOpen })),

  reset: () => set({
    report: null,
    panelOpen: false,
    running: false,
    error: null,
    overallStatus: null,
    stabilityPath: null,
    ranAt: null,
  }),

  /**
   * 권상 그룹 삭제를 시각화에 반영한다. 삭제된 groupId 의 wire/apex 를 제거하고,
   * 그보다 큰 groupId 는 1씩 당겨 재정렬한다(useEditStore.removeHoistGroup 의 ID 재정렬과 동일 규칙 →
   * 삭제 후에도 wire 색상이 패널 그룹 색상과 일치). report/visualization 이 없으면 no-op.
   */
  dropGroupWires: (deletedGroupId) => set(s => {
    const rep = s.report
    const gid = Number(deletedGroupId)
    if (!rep || !rep.visualization || !Number.isInteger(gid)) return s
    const reindex = (arr) => (Array.isArray(arr)
      ? arr
          .filter(w => Number(w.groupId) !== gid)
          .map(w => (Number(w.groupId) > gid ? { ...w, groupId: Number(w.groupId) - 1 } : w))
      : arr)
    return {
      report: {
        ...rep,
        visualization: {
          ...rep.visualization,
          wires: reindex(rep.visualization.wires),
          apexes: reindex(rep.visualization.apexes),
        },
      },
    }
  }),
}))

/**
 * stages[] 의 user-displayed 항목들을 보고 전체 status 를 결정한다.
 *   - 하나라도 'fail' 이면 'fail'
 *   - 'warn' 이 있으면 'warn'
 *   - 'pass' 가 하나라도 있으면 'pass'
 *   - user stage 가 전부 'skip'(검증 미수행)이면 null (미실행 취급)
 * 전부 skip 인데 'pass' 로 오판하면 검증 안 된 모델로 구조해석 Run 이 열리므로 null 을 반환한다.
 */
function deriveOverallStatus(report) {
  if (!report || !Array.isArray(report.stages)) return null
  const userStages = report.stages.filter(s => s.displayPolicy !== 'internal')
  if (userStages.length === 0) return null
  if (userStages.some(s => s.status === 'fail')) return 'fail'
  if (userStages.some(s => s.status === 'warn')) return 'warn'
  if (userStages.some(s => s.status === 'pass')) return 'pass'
  return null
}

// dev 노출 — 자동화 검증/디버깅용
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__stabilityStore = useStabilityStore
}
