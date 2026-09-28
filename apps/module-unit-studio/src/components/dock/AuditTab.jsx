import { useStageStore } from '../../store/useStageStore.js'
import InputAuditPanel from '../InputAuditPanel.jsx'
import { palette, type } from '../../utils/theme.js'
import { FONT, INK } from '../../utils/tokens.js'

/**
 * 하단 도크 "입력 감사" 탭 — CSV → 모델 변환이 제대로 됐는지 보는 표.
 *
 * 예전에는 `BottomReviewDock` 이 자체 접기 헤더를 달고 따로 떠 있었다. 하단 도크로 합치면서
 * 헤더·접기는 도크가 맡고 여기에는 내용만 남긴다. 요약 칩은 도크 탭 버튼 옆에 붙이려고
 * `AuditSummaryChips` 로 따로 내보낸다(접혀 있어도 문제 건수가 보이게).
 */
export default function AuditTab() {
  const inputAudit = useStageStore(s => s.inputAudit)
  const p = palette()
  if (!inputAudit) {
    return (
      <div style={{ padding: '14px 12px', fontSize: type.body, color: p.textMuted, lineHeight: 1.6 }}>
        변환 감사 자료가 없습니다 — CSV → 모델 변환 로그(`00_InputAudit.json`)가 있는 결과 폴더를 열면 여기에 나타납니다.
      </div>
    )
  }
  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
      <InputAuditPanel embedded forceOpen />
    </div>
  )
}

const CHIP_COLOR = {
  converted: '#44cc88',
  ignored: '#FFAA55',
  parseFailed: '#FF5566',
  duplicate: '#cc88ff',
}

/** 도크 탭 버튼 옆 요약 칩 — 전체/변환/제외/파싱실패/중복. 자료가 없으면 아무것도 그리지 않는다. */
export function AuditSummaryChips() {
  const inputAudit = useStageStore(s => s.inputAudit)
  const summary = inputAudit?.summary
  if (!summary) return null
  const ambiguous = summary.ambiguousDuplicateSourceNameRows ?? 0
  const issues = (summary.ignoredRows ?? 0) + (summary.parseFailedRows ?? 0) + (summary.blankRows ?? 0) + ambiguous
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Chip label="변환" value={summary.convertedRows} color={CHIP_COLOR.converted} />
      {(summary.ignoredRows ?? 0) > 0 && <Chip label="제외" value={summary.ignoredRows} color={CHIP_COLOR.ignored} />}
      {(summary.parseFailedRows ?? 0) > 0 && <Chip label="실패" value={summary.parseFailedRows} color={CHIP_COLOR.parseFailed} />}
      {ambiguous > 0 && <Chip label="중복" value={ambiguous} color={CHIP_COLOR.duplicate} />}
      {issues === 0 && <Chip label="문제 없음" color={CHIP_COLOR.converted} />}
    </span>
  )
}

function Chip({ label, value, color }) {
  return (
    <span style={{
      fontSize: FONT.xs, fontWeight: 800, color, background: `${color}1f`,
      border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap',
    }}>
      {label}{value != null ? ` ${Number(value).toLocaleString('ko-KR')}` : ''}
    </span>
  )
}

/** 참고 — 칩이 아무것도 못 그릴 때 도크가 쓰는 흐린 색. */
export const AUDIT_CHIP_MUTED = INK.dim
