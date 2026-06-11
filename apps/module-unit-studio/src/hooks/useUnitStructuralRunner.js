import { useEffect, useMemo, useState } from 'react'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { getHost } from '../host/host.js'

/**
 * useUnitStructuralRunner — Unit 구조 해석(Wire 포함 BDF + Nastran SOL 101) 실행 로직 공유 훅.
 *
 * AnalyzePanel(좌측 도크, 주 입력/실행 위치)과 UnitStructuralPanel(상세 결과 floating)이
 * 동일한 준비상태·실행 흐름을 공유한다. 상태는 모두 store(useUnitStructuralStore)에 있으므로
 * 어느 컴포넌트에서 실행해도 일관되게 반영된다.
 *
 * 진행(progress) IPC 구독을 이 훅 안에서 수행한다 — 여러 컴포넌트가 동시에 마운트해도
 * setProgress 는 멱등이라 중복 push 가 무해하다(둘 다 같은 store 값을 쓴다).
 */
export function useUnitStructuralRunner() {
  const status = useUnitStructuralStore(s => s.status)
  const progress = useUnitStructuralStore(s => s.progress)
  const message = useUnitStructuralStore(s => s.message)
  const result = useUnitStructuralStore(s => s.result)
  const summary = useUnitStructuralStore(s => s.summary)
  const warnings = useUnitStructuralStore(s => s.warnings)
  const error = useUnitStructuralStore(s => s.error)
  const ranAt = useUnitStructuralStore(s => s.ranAt)
  const safetyFactor = useUnitStructuralStore(s => s.safetyFactor)
  const allowableMpa = useUnitStructuralStore(s => s.allowableMpa)

  const setSafetyFactor = useUnitStructuralStore(s => s.setSafetyFactor)
  const setAllowableMpa = useUnitStructuralStore(s => s.setAllowableMpa)
  const setProgress = useUnitStructuralStore(s => s.setProgress)
  const setStarted = useUnitStructuralStore(s => s.setStarted)
  const setSuccess = useUnitStructuralStore(s => s.setSuccess)
  const setFailure = useUnitStructuralStore(s => s.setFailure)

  const overall = useStabilityStore(s => s.overallStatus)
  const stabilityPath = useStabilityStore(s => s.stabilityPath)

  const host = getHost()
  const ipcAvailable = typeof host.runUnitStructural === 'function'
  const onProgressAvailable = typeof host.onUnitStructuralProgress === 'function'

  // progress stream 구독 (status 가 변하는 동안 main → renderer push 로 갱신)
  useEffect(() => {
    if (!onProgressAvailable) return
    const off = host.onUnitStructuralProgress((data) => {
      if (!data) return
      setProgress({ status: data.status, progress: data.progress, message: data.message })
    })
    return () => { try { off?.() } catch {} }
  }, [onProgressAvailable, host, setProgress])

  // 입력 로컬 미러 (포커스 중 store 업데이트가 끊기지 않도록)
  const [sfInput, setSfInput] = useState(String(safetyFactor))
  const [allowInput, setAllowInput] = useState(String(allowableMpa))
  useEffect(() => { setSfInput(String(safetyFactor)) }, [safetyFactor])
  useEffect(() => { setAllowInput(String(allowableMpa)) }, [allowableMpa])

  const isRunning = status === 'Pending' || status === 'Running'
  // 한번 해석이 됐으면 다시 실행 불가 — 결과 일관성 유지를 위해 "초기화" 후 재시작하도록 유도.
  const isFinished = status === 'Success'
  // PASS 또는 WARN 일 때 진행 가능. FAIL 만 차단.
  const stabilityOk = overall === 'pass' || overall === 'warn'
  const isReady = stabilityOk && ipcAvailable && !!stabilityPath
  const canRun = isReady && !isRunning && !isFinished

  // 차단 사유 — fail/미실행/IPC 없음/path 없음
  const blocking = useMemo(() => {
    const b = []
    if (overall === 'fail') b.push('자세안정성 FAIL')
    else if (overall == null) b.push('자세안정성 미실행')
    if (!ipcAvailable) b.push('Workbench 환경 아님')
    if (!stabilityPath) b.push('stability JSON 없음')
    return b
  }, [overall, ipcAvailable, stabilityPath])

  const handleRun = async () => {
    if (!canRun) return
    setStarted()
    try {
      const r = await host.runUnitStructural({ stabilityPath, safetyFactor, allowableMpa })
      if (!r) { setFailure('응답 없음'); return }
      if (r.ok) {
        setSuccess({
          analysisId: r.analysisId ?? null,
          summary: r.summary ?? null,
          warnings: r.warnings ?? [],
          resultPath: r.resultPath ?? null,
          result: r.result ?? null,
        })
      } else {
        setFailure({ message: r.error ?? '알 수 없는 오류', stderr: r.stderr ?? null })
      }
    } catch (e) {
      setFailure({ message: e?.message ?? String(e) })
    }
  }

  return {
    // 상태
    status, progress, message, result, summary, warnings, error, ranAt,
    safetyFactor, allowableMpa,
    // 입력 미러 + 커밋
    sfInput, setSfInput, commitSf: () => setSafetyFactor(sfInput),
    allowInput, setAllowInput, commitAllow: () => setAllowableMpa(allowInput),
    // 준비/실행 상태
    overall, stabilityPath, ipcAvailable,
    isRunning, isFinished, stabilityOk, isReady, canRun, blocking,
    handleRun,
  }
}
