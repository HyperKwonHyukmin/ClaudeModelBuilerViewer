import { useState } from 'react'
import { AlertOctagon, Copy, Info, Trash2 } from 'lucide-react'
import { useErrorLogStore } from '../../store/useErrorLogStore.js'
import { palette, type } from '../../utils/theme.js'

/**
 * 하단 도크 "메시지" 탭 — 세션 오류 로그 + 안내 이력 (Side Passage 이식).
 * 상태 문구·토스트는 곧 사라지지만 여기에는 남아 "아까 뭔가 실패했는데 뭐였지"를 되짚을 수 있다.
 * 복사 버튼은 개발자에게 붙여넣어 전달할 평문을 만든다.
 */
export default function MessagesTab() {
  const entries = useErrorLogStore(s => s.entries)
  const clear = useErrorLogStore(s => s.clear)
  const p = palette()
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState('all')   // 'all' | 'error' | 'info'

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(useErrorLogStore.getState().formatForClipboard())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* 권한 없음 — 목록에서 직접 선택 복사 */ }
  }

  const shown = filter === 'all' ? entries : entries.filter(e => (filter === 'info' ? e.level === 'info' : e.level !== 'info'))
  const errorCount = entries.filter(e => e.level !== 'info').length
  const infoCount = entries.length - errorCount

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${p.border}`, flexShrink: 0 }}>
        {[['all', `전체 ${entries.length}`], ['error', `오류 ${errorCount}`], ['info', `안내 ${infoCount}`]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} style={{
            padding: '3px 9px', borderRadius: 5, cursor: 'pointer', fontSize: type.meta, fontWeight: 700,
            background: filter === k ? p.accentBg : 'transparent', color: filter === k ? p.accentLight : p.textMuted,
            border: `1px solid ${filter === k ? p.accentBorder : p.btnBorder}`,
          }}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <Btn onClick={onCopy} title="전체 텍스트로 복사" p={p}><Copy size={12} /> {copied ? '복사됨' : '복사'}</Btn>
        <Btn onClick={clear} title="목록 비우기" p={p} disabled={entries.length === 0}><Trash2 size={12} /> 비우기</Btn>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {shown.length === 0 && (
          <div style={{ fontSize: 12, color: p.textMuted, textAlign: 'center', padding: '24px 12px' }}>
            {entries.length === 0 ? '이 세션에 기록된 메시지가 없습니다.' : '이 필터에 해당하는 메시지가 없습니다.'}
          </div>
        )}
        {shown.map(e => {
          const isInfo = e.level === 'info'
          const color = isInfo ? p.labelColor : p.severityDanger
          const Icon = isInfo ? Info : AlertOctagon
          return (
            <div key={e.id} style={{ padding: '7px 10px', borderBottom: `1px solid ${p.border}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <Icon size={12} color={color} aria-hidden="true" style={{ flexShrink: 0, alignSelf: 'center' }} />
                <span style={{
                  fontSize: 11, fontWeight: 800, color, flexShrink: 0,
                  background: `${color}1f`, border: `1px solid ${color}55`, borderRadius: 3, padding: '1px 5px',
                }}>{e.scope}</span>
                <span style={{ fontSize: type.body, color: p.textSecondary, flex: 1, wordBreak: 'break-word', lineHeight: 1.45 }}>{e.message}</span>
                <span style={{ fontSize: 11, color: p.textFaint, flexShrink: 0 }}>{new Date(e.at).toLocaleTimeString('ko-KR')}</span>
              </div>
              {e.detail && (
                <pre style={{
                  margin: '0 0 0 18px', fontSize: 11, lineHeight: 1.45, color: p.textFaint,
                  maxHeight: 96, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{e.detail}</pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Btn({ onClick, title, children, p, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      background: p.btnBg, border: `1px solid ${p.btnBorder}`, color: p.textSecondary, fontSize: type.meta, fontWeight: 700,
    }}>{children}</button>
  )
}
