import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import InputAuditPanel from './InputAuditPanel.jsx'
import { BG, LINE, INK, FONT, RADIUS } from '../utils/tokens.js'

/**
 * CSV → 모델 변환 감사 도크(화면 하단).
 *
 * 이전에는 inputAudit 이 있으면 무조건, 모든 모드에서, 접을 수 없이 렌더돼
 * 1600×900 기준 309px / 1366×768 기준 261px(34%)를 상시 점유했다. 그 결과
 * 3D 캔버스가 창 높이의 57% 밖에 되지 않았다 — 9,893 노드 모델을 434px 높이에서
 * 판독해야 했다는 뜻이다.
 *
 * 두 가지로 나눠 해결한다.
 *  1. **모드 범위 제한** — 변환 감사는 "CSV 가 모델로 제대로 옮겨졌는가"를 보는
 *     작업이다. Model / Model Check 에서만 의미가 있고, 권상점을 찍거나(Hoist)
 *     해석 결과를 보는(Analysis) 중에는 볼 일이 없다. 그때는 렌더하지 않는다.
 *  2. **접기 토글** — 펼침 여부를 사용자가 정하고 localStorage 에 유지한다.
 *     접어도 문제 건수 칩은 헤더에 남아서 "문제가 있다"는 사실은 계속 보인다.
 */

const COLLAPSE_KEY = 'input_audit_dock_collapsed_v1'

// 이 도크가 의미를 갖는 모드. 나머지 모드에서는 뷰포트에 자리를 내준다.
const VISIBLE_MODES = new Set(['model', 'modelCheck'])

const STATUS_COLOR = {
  converted: '#44cc88',
  ignored: '#FFAA55',
  parseFailed: '#FF5566',
  duplicate: '#cc88ff',
}

export default function BottomReviewDock() {
  const inputAudit = useStageStore(s => s.inputAudit)
  const activeMode = useViewerStore(s => s.activeMode)

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* 저장 실패 무시 */ }
  }, [collapsed])

  if (!inputAudit) return null
  if (!VISIBLE_MODES.has(activeMode)) return null

  const summary = inputAudit.summary
  const ambiguousCount = summary?.ambiguousDuplicateSourceNameRows ?? 0
  const issueCount = summary
    ? (summary.ignoredRows ?? 0) + (summary.parseFailedRows ?? 0) + (summary.blankRows ?? 0) + ambiguousCount
    : 0

  return (
    <div style={{
      background: BG.dock,
      borderTop: `1px solid ${LINE.base}`,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: collapsed ? undefined : '36%',
    }}>
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed}
        title={collapsed ? '변환 감사 펼치기' : '변환 감사 접기 — 3D 뷰가 넓어집니다'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '5px 12px',
          flexWrap: 'wrap',
          background: 'transparent',
          border: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${LINE.subtle}`,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: FONT.md,
          fontWeight: 700,
          color: '#e8f2ff',
          padding: '4px 12px',
          background: '#243a66',
          border: '1px solid #4682B4',
          borderRadius: RADIUS.sm,
        }}>
          <ClipboardList size={13} /> 변환 감사
        </span>
        {summary && (
          <>
            <SummaryChip label="전체" value={summary.totalDataRows} color="#7aa6c8" />
            <SummaryChip label="변환" value={summary.convertedRows} color={STATUS_COLOR.converted} />
            <SummaryChip label="제외" value={summary.ignoredRows} color={STATUS_COLOR.ignored} />
            <SummaryChip label="파싱실패" value={summary.parseFailedRows} color={STATUS_COLOR.parseFailed} />
            <SummaryChip label="중복" value={ambiguousCount} color={STATUS_COLOR.duplicate} />
            {issueCount > 0 && (
              <span style={{ fontSize: FONT.base, color: INK.muted }}>· 문제 {issueCount.toLocaleString('ko-KR')}건</span>
            )}
          </>
        )}
        <span style={{
          marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: FONT.sm, fontWeight: 700, color: INK.dim, flexShrink: 0,
        }}>
          {collapsed ? '펼치기' : '접기'}
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {!collapsed && (
        <div style={{ overflow: 'auto' }}>
          <InputAuditPanel embedded forceOpen />
        </div>
      )}
    </div>
  )
}

function SummaryChip({ label, value, color }) {
  if (value == null) return null
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: FONT.base,
      padding: '3px 9px',
      background: `${color}1a`,
      border: `1px solid ${color}55`,
      borderRadius: RADIUS.lg,
      color: INK.body,
    }}>
      <span style={{ color, fontWeight: 700 }}>{(value ?? 0).toLocaleString('ko-KR')}</span>
      <span style={{ color: INK.dim }}>{label}</span>
    </span>
  )
}
