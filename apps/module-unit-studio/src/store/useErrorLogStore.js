import { create } from 'zustand'

/**
 * useErrorLogStore — 세션 동안 발생한 오류·안내를 메모리에 모아 두는 경량 로그 (Side Passage 이식).
 *
 * 왜 필요한가: 이 Studio 의 오류 표면은 4.5초 뒤 사라지는 토스트/상태 문구뿐이라 사용자가
 * "해석이 안 돼요"라고 알려 와도 개발자가 재현할 단서가 남지 않는다(console 은 앱을 닫으면
 * 사라진다). 여기에 쌓아 두면 하단 도크 "메시지" 탭에서 되짚고, 텍스트로 복사해 전달할 수 있다.
 *
 * 의도적으로 저장소(localStorage)에 쓰지 않는다 — 회사 DRM/용량 이슈를 만들지 않고,
 * 세션 진단이면 충분하기 때문.
 */

// 상한 — 오래된 항목부터 버려 장시간 세션에서도 메모리가 무한히 늘지 않게 한다.
export const ERROR_LOG_LIMIT = 100

let nextId = 1

export const useErrorLogStore = create((set, get) => ({
  // 최신이 앞(index 0). UI 가 그대로 위에서부터 보여줄 수 있도록.
  entries: [],

  /**
   * @param {object} e
   * @param {string} e.scope    발생 위치 태그 — 'render' | 'host' | 'window' | 'promise' | 'analysis' | 'save' 등
   * @param {string} [e.message]
   * @param {Error}  [e.error]  Error 객체를 주면 message/stack 을 자동 추출
   * @param {string} [e.detail] 추가 상세(스택·stderr 등)
   * @param {'error'|'info'} [e.level='error']
   */
  push: ({ scope = 'unknown', message, error, detail, level = 'error' } = {}) => {
    const msg = message ?? error?.message ?? '(메시지 없음)'
    const det = detail ?? error?.stack ?? null
    const entry = { id: nextId++, at: Date.now(), scope, level: level === 'info' ? 'info' : 'error', message: String(msg), detail: det }
    set(s => ({ entries: [entry, ...s.entries].slice(0, ERROR_LOG_LIMIT) }))
    return entry.id
  },

  /** 안내(info) 항목 — 상단 오류 카운트에는 포함하지 않는다. */
  pushInfo: ({ scope = 'info', message, detail } = {}) =>
    get().push({ scope, message, detail, level: 'info' }),

  /** 오류(level='error') 건수. */
  errorCount: () => get().entries.filter(e => e.level !== 'info').length,

  clear: () => set({ entries: [] }),

  /** 사용자가 개발자에게 붙여넣어 전달할 수 있는 평문 텍스트. */
  formatForClipboard: () => {
    const { entries } = get()
    if (entries.length === 0) return 'Module Unit Studio — 기록된 메시지가 없습니다.'
    const lines = ['Module Unit Studio 메시지 로그', `총 ${entries.length}건`, '']
    for (const e of entries) {
      lines.push(`[${new Date(e.at).toISOString()}] ${e.level === 'info' ? 'INFO' : 'ERROR'} (${e.scope}) ${e.message}`)
      if (e.detail) lines.push(indent(e.detail))
      lines.push('')
    }
    return lines.join('\n')
  },
}))

function indent(text) {
  return String(text).split('\n').map(l => `    ${l}`).join('\n')
}

/**
 * 전역 오류 훅 설치 — 렌더 트리 밖(이벤트 핸들러·async)에서 터진 오류까지 잡는다.
 * ErrorBoundary 는 렌더 중 예외만 잡으므로 둘 다 필요하다.
 * @returns {() => void} 해제 함수
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return () => {}
  const push = useErrorLogStore.getState().push

  const onError = (event) => {
    push({
      scope: 'window',
      message: event?.message ?? '알 수 없는 오류',
      detail: event?.error?.stack ?? `${event?.filename ?? ''}:${event?.lineno ?? ''}`,
    })
  }
  const onRejection = (event) => {
    const reason = event?.reason
    push({
      scope: 'promise',
      message: reason?.message ?? String(reason ?? '처리되지 않은 Promise 거부'),
      detail: reason?.stack ?? null,
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
