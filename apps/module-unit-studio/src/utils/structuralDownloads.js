/**
 * Analysis·Save 탭 해석 파일 다운로드의 활성 조건(순수 함수).
 *
 * - Wire 포함 BDF: 권상 위치를 잡고 **자세안정성 평가를 실행한 뒤**에만 받을 수 있다.
 *   구조 해석 실행과 같은 조건(PASS/WARN + stability JSON)이다 — 해석에 들어갈 BDF 를 주는 버튼이라
 *   해석을 못 하는 상태(FAIL·미실행)에서는 줄 BDF 도 없다.
 * - OP2: 구조 해석이 **성공한 뒤**에만. 그 해석이 푼 BDF 의 결과다.
 *
 * @returns {{ enabled: boolean, reason: string }} reason 은 비활성 사유(활성이면 '').
 */
export function liftingBdfAvailability({ overall, stabilityPath, hostReady, isElectron = false }) {
  if (!hostReady) return { enabled: false, reason: hostMissingReason(isElectron) }
  if (overall == null) return { enabled: false, reason: 'Hoist 탭에서 권상 위치를 잡고 자세안정성 평가를 먼저 실행하세요.' }
  if (overall === 'fail') return { enabled: false, reason: '자세안정성 FAIL — 구조 해석을 할 수 없는 권상 조건입니다.' }
  if (!stabilityPath) return { enabled: false, reason: '자세안정성 평가 결과 파일이 없습니다. 평가를 다시 실행하세요.' }
  return { enabled: true, reason: '' }
}

export function op2Availability({ status, analysisId, hostReady, isElectron = false }) {
  if (!hostReady) return { enabled: false, reason: hostMissingReason(isElectron) }
  if (status === 'Pending' || status === 'Running') return { enabled: false, reason: '구조 해석 실행 중입니다.' }
  if (status !== 'Success' || !analysisId) return { enabled: false, reason: '구조 해석이 성공하면 받을 수 있습니다.' }
  return { enabled: true, reason: '' }
}

// WorkBench 안인데 기능이 없으면 앱(Electron)이 이 기능 이전 버전이다 — '환경 아님' 과 구분해 알린다.
function hostMissingReason(isElectron) {
  return isElectron
    ? 'WorkBench 앱을 최신 버전으로 업데이트해야 받을 수 있습니다.'
    : 'WorkBench 앱 환경에서만 받을 수 있습니다.'
}
