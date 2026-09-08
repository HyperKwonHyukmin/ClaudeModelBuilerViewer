import { useState } from 'react'

const mm = n => `${Math.round(n).toLocaleString()} mm`
const button = { background: '#182638', border: '1px solid #425870', borderRadius: 4, color: '#d9e6f4', padding: '3px 7px', cursor: 'pointer', fontSize: 11 }

export default function HoistFieldGuidePanel({ guide, visible, onToggle, onTop, onFocus, strict }) {
  const [expanded, setExpanded] = useState(true)
  return <section aria-label="현장 배치 안내" style={{ position: 'absolute', top: 86, left: 10, zIndex: 15, width: 310, maxWidth: 'calc(100% - 20px)', maxHeight: 'calc(100% - 210px)', overflow: 'auto', background: 'rgba(12,20,33,.94)', border: '1px solid #3e586e', borderRadius: 6, color: '#d9e6f4', fontSize: 12, lineHeight: 1.5 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 9 }}>
      <button style={{ ...button, flex: 1, textAlign: 'left' }} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '▾' : '▸'} 현장 배치 안내</button>
      <button style={button} aria-pressed={visible} onClick={onToggle}>{visible ? '가이드 숨김' : '가이드 표시'}</button>
    </div>
    {expanded && <div style={{ padding: '0 10px 10px' }}>
      <div style={{ color: '#99aec5', fontSize: 11 }}>초기 배치 참고 · 엔진 판정 변경 없음{!strict && ' · Strict OFF 경고 유지'}</div>
      {!guide?.available ? <p>{guide?.message ?? '권상점을 선택하세요.'}</p> : <>
        <div style={{ color: guide.caution ? '#ffce76' : '#75ded5', marginTop: 7 }}>{guide.caution ? '배치 확인 사항 있음' : '현재 기하 배치의 명백한 편심 없음'}</div>
        <div style={{ fontSize: 11, color: '#a8bed2' }}>{guide.source}</div>
        <div style={{ marginTop: 6 }}>기준 COG: {guide.nominal.inside ? `영역 내부 · 경계 여유 ${mm(guide.nominal.signedMarginMm)}` : `중심/영역 이격 ${mm(guide.nominal.deviationMm)}`}</div>
        <div>{guide.toleranceApplied ? `오차 고려: ${guide.worst.inside ? '내부 여유' : '최대 이격'} ${mm(Math.abs(guide.worst.signedMarginMm))}` : '무게중심 오차 미고려'}</div>
        <div>{guide.tiltDeg === null ? '다점 실제 경사각은 이 가이드에서 계산하지 않음' : `간이 경사 지표 ${guide.tiltDeg.toFixed(1)}° · 정밀 평형해 아님`}</div>
        <div style={{ fontSize: 11, color: '#a8bed2', marginTop: 5 }}>노랑: COG / 오차 범위 · 청록: 권상 XY 투영<br />주황: 경계·중심 → COG 편심 방향 (모델 축 기준)</div>
        {guide.nearBoundary && <div style={{ fontSize: 11, color: '#ffce76' }}>경계 근접 안내: 권상 폭의 5% 미만 (합격 기준 아님)</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}><button style={button} onClick={onTop}>평면으로 확인</button></div>
      </>}
      {(guide?.actions ?? guide?.notices ?? []).map((action, i) => <div key={i} style={{ borderTop: '1px solid #2b3c50', marginTop: 7, paddingTop: 7 }}>
        <span>{action.text}</span>
        {action.groupId && <button style={{ ...button, marginLeft: 5 }} onClick={() => onFocus(action.groupId, action.nodeId)}>G{action.groupId} 위치 보기</button>}
      </div>)}
      <div style={{ color: '#99aec5', fontSize: 11, marginTop: 8 }}>체결점 이동 후 슬링각·간섭을 함께 재검토하세요. 리깅 용량·현장 작업 승인을 대신하지 않습니다.</div>
    </div>}
  </section>
}
