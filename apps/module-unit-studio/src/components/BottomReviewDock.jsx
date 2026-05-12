import { useStageStore } from '../store/useStageStore.js'
import InputAuditPanel from './InputAuditPanel.jsx'

const STATUS_COLOR = {
  converted: '#44cc88',
  ignored: '#FFAA55',
  parseFailed: '#FF5566',
  duplicate: '#cc88ff',
}

export default function BottomReviewDock() {
  const { inputAudit } = useStageStore()
  if (!inputAudit) return null

  const summary = inputAudit.summary
  const ambiguousCount = summary?.ambiguousDuplicateSourceNameRows ?? 0
  const issueCount = summary
    ? (summary.ignoredRows ?? 0) + (summary.parseFailedRows ?? 0) + (summary.blankRows ?? 0) + ambiguousCount
    : 0

  return (
    <div style={{
      background: '#12122a',
      borderTop: '1px solid #2a2a4a',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '36%',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        flexWrap: 'wrap',
        borderBottom: '1px solid #1e1e36',
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#e8f2ff',
          padding: '4px 12px',
          background: '#243a66',
          border: '1px solid #4682B4',
          borderRadius: 4,
        }}>
          변환 감사
        </span>
        {summary && (
          <>
            <SummaryChip label="전체" value={summary.totalDataRows} color="#7aa6c8" />
            <SummaryChip label="변환" value={summary.convertedRows} color={STATUS_COLOR.converted} />
            <SummaryChip label="제외" value={summary.ignoredRows} color={STATUS_COLOR.ignored} />
            <SummaryChip label="파싱실패" value={summary.parseFailedRows} color={STATUS_COLOR.parseFailed} />
            <SummaryChip label="중복" value={ambiguousCount} color={STATUS_COLOR.duplicate} />
            {issueCount > 0 && (
              <span style={{ fontSize: 12, color: '#7aa6c8' }}>· 문제 {issueCount.toLocaleString('ko-KR')}건</span>
            )}
          </>
        )}
      </div>

      <div style={{ overflow: 'auto' }}>
        <InputAuditPanel embedded forceOpen />
      </div>
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
      fontSize: 12,
      padding: '3px 9px',
      background: `${color}1a`,
      border: `1px solid ${color}55`,
      borderRadius: 12,
      color: '#cad8e8',
    }}>
      <span style={{ color, fontWeight: 700 }}>{(value ?? 0).toLocaleString('ko-KR')}</span>
      <span style={{ color: '#888' }}>{label}</span>
    </span>
  )
}
