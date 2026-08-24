import { useEffect, useMemo, useState } from 'react'
import { useStabilityStore, isShapeGateRelaxed, failingStageLabels } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { getHost } from '../host/host.js'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { buildEditedStageJson, buildEditedStageFileName } from '../data/applyEditedModel.js'

// 구조해석 실행 직전, 현재 편집(가서포트 포함) 모델을 _edited.json 으로 백엔드에 재업로드한다.
// 반환: null(업로드 불필요) | { ok:true } | { ok:false, error }
async function syncEditedModel(host) {
  const editState = useEditStore.getState()
  const intents = editState.intents ?? []
  // 편집이 한 번도 없었으면(원본 그대로) 업로드 생략 — 백엔드는 원본 BDF 를 쓴다.
  if (intents.length === 0 && !editState.editedModelUploaded) return null
  if (typeof host.uploadEvaluationArtifact !== 'function') return null
  const stages = useStageStore.getState().stages
  const stage = stages?.[stages.length - 1]
  if (!stage) return null
  try {
    const json = JSON.stringify(buildEditedStageJson(stage, intents))
    const name = buildEditedStageFileName(stage, () => String(Date.now()))
    const r = await host.uploadEvaluationArtifact(name, json)
    if (r?.ok) { editState.markEditedModelUploaded?.(); return { ok: true } }
    return { ok: false, error: r?.error ?? '편집 모델 업로드 실패' }
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

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
  const stabilityReport = useStabilityStore(s => s.report)
  // 이 결과가 'Strict 평가 OFF' 완화 덕분에 통과했는지 — 결과 표기·경고 문구에 쓴다.
  // (전도·Wire 길이는 완화 대상이 아니므로, 이 값이 true 여도 그 두 항목은 정상 판정된 상태다.)
  const shapeRelaxed = useMemo(() => isShapeGateRelaxed(stabilityReport), [stabilityReport])

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
    if (overall === 'fail') {
      // 어떤 항목이 막는지 이름을 그대로 보여준다. Strict 평가 OFF 로 형상(Stage 1·2)이 warn 이어도
      // Wire 길이(Stage 3)·전도(Stage 6)·리깅 하중(Stage 7)은 완화 대상이 아니라 여전히 fail 이라,
      // 사유를 안 적으면 "형상은 경고인데 왜 실행이 안 되지?" 로 보인다.
      const labels = failingStageLabels(stabilityReport)
      b.push(labels.length ? `자세안정성 FAIL — ${labels.join(', ')}` : '자세안정성 FAIL')
    }
    else if (overall == null) b.push('자세안정성 미실행')
    if (!ipcAvailable) b.push('Workbench 환경 아님')
    if (!stabilityPath) b.push('stability JSON 없음')
    return b
  }, [overall, ipcAvailable, stabilityPath, stabilityReport])

  const handleRun = async () => {
    if (!canRun) return
    // canRun 은 렌더 시점 클로저라 빠른 2회 클릭 시 둘 다 통과할 수 있다 → 실행 직전 fresh 상태로 이중 제출 차단.
    const liveStatus = useUnitStructuralStore.getState().status
    if (liveStatus === 'Pending' || liveStatus === 'Running') return
    setStarted()
    // 재해석을 시작했으므로 편집으로 인한 stale 배너는 내린다.
    useEditStore.getState().clearEditStaleNotice?.()
    try {
      const sync = await syncEditedModel(host)
      if (sync && !sync.ok) { setFailure({ message: `보강 모델 반영 실패: ${sync.error}` }); return }
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
    overall, stabilityPath, ipcAvailable, shapeRelaxed,
    isRunning, isFinished, stabilityOk, isReady, canRun, blocking,
    handleRun,
  }
}
