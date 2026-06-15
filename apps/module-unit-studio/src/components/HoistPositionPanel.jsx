import { useState } from 'react'
import { ClipboardList, Loader2, Play, Plus, Trash2, X } from 'lucide-react'
import {
  useEditStore,
  getHoistMaxGroups,
  getHoistDefaultWireLengthM,
  getHoistMinNodesPerGroup,
} from '../store/useEditStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import Tooltip from './Tooltip.jsx'

const HOIST_MODES = [
  { id: 'hydro',   label: 'Hydro 방식',  detail: 'Hook',    maxGroups: 4, minNodes: 2, defaultWire: 8  },
  { id: 'goliat',  label: 'Goliat 방식', detail: 'Trolley', maxGroups: 3, minNodes: 2, defaultWire: 24 },
  { id: 'ceiling', label: '천장 Crane',  detail: 'Crane',   maxGroups: 1, minNodes: 3, defaultWire: 5  },
]

const HOIST_GROUP_COLORS = {
  1: '#00D1FF',  // cyan
  2: '#B57CFF',  // 보라 — 무게중심 노란 원과 헷갈리지 않도록
  3: '#6AE07A',  // 녹색
  4: '#FF66AA',  // 핫핑크
}

const LOCATION_LABEL = {
  backend: 'Workbench 백엔드(userConnection)',
  folder:  '폴더',
  picker:  '선택 위치',
  download:'다운로드',
}

function formatPostureSuccess(results) {
  const arr = Array.isArray(results) ? results : []
  if (arr.length === 0) return '자세안정성 평가 입력을 저장했습니다.'
  // 산출물 종류별 요약. 위치가 모두 같으면 한 줄로, 다르면 종류별로 표기.
  const locations = new Set(arr.map(r => r.location))
  const parts = arr.map(r => {
    const kindLabel = r.kind === 'edited' ? '편집 모델' : '권상 설정'
    return `${kindLabel}(${r.fileName})`
  })
  if (locations.size === 1) {
    const where = LOCATION_LABEL[[...locations][0]] ?? [...locations][0]
    return `${where}에 ${arr.length === 2 ? '2개 파일' : '1개 파일'} 저장 완료: ${parts.join(' · ')}`
  }
  // 혼합 위치 — 종류별 위치 표기
  const detailed = arr.map(r => {
    const kindLabel = r.kind === 'edited' ? '편집 모델' : '권상 설정'
    const where = LOCATION_LABEL[r.location] ?? r.location
    return `${kindLabel}→${where}(${r.fileName})`
  })
  return `혼합 위치 저장 완료: ${detailed.join(' · ')}`
}

export default function HoistPositionPanel() {
  const mode = useEditStore(s => s.hoistMode)
  const setMode = useEditStore(s => s.setHoistMode)
  const groupCount = useEditStore(s => s.hoistGroupCount)
  const setGroupCount = useEditStore(s => s.setHoistGroupCount)
  const activeGroupId = useEditStore(s => s.activeHoistGroupId)
  const setActiveGroup = useEditStore(s => s.setActiveHoistGroup)
  const groups = useEditStore(s => s.hoistGroups)
  const removeNode = useEditStore(s => s.removeHoistNode)
  const clearGroup = useEditStore(s => s.clearHoistGroup)
  const removeGroup = useEditStore(s => s.removeHoistGroup)
  const pipeDiameter = useEditStore(s => s.pipeDiameterThreshold)
  const setPipeDiameter = useEditStore(s => s.setPipeDiameterThreshold)
  const wireLengthM = useEditStore(s => s.wireLengthM)
  const setWireLength = useEditStore(s => s.setWireLength)
  const exportPosture = useEditStore(s => s.exportPostureStabilityToFile)
  const flashGuide = useEditStore(s => s.flashHoistGuide)
  const stabilityReport  = useStabilityStore(s => s.report)
  const stabilityRunning = useStabilityStore(s => s.running)
  const stabilityError   = useStabilityStore(s => s.error)
  const stabilityOverall = useStabilityStore(s => s.overallStatus)
  const openStabilityPanel = useStabilityStore(s => s.openPanel)

  const maxGroupsForMode = getHoistMaxGroups(mode)
  const minNodesForMode  = getHoistMinNodesPerGroup(mode)   // ceiling=3, 그 외=2

  // 모든 활성 그룹이 모드별 최소~4 노드를 가지고 모드가 선택돼야 평가 실행 가능.
  const activeGroupIds = Array.from({ length: groupCount }, (_, i) => i + 1)
  const allGroupsValid = activeGroupIds.every(id => {
    const n = (groups[id] ?? []).length
    return n >= minNodesForMode && n <= 4
  })
  const canRunEvaluation = !!mode && allGroupsValid

  const [running, setRunning] = useState(false)
  const onRunEvaluation = async () => {
    if (!canRunEvaluation || running || stabilityRunning) return
    setRunning(true)
    try {
      const r = await exportPosture()
      if (!r.ok) {
        flashGuide(`저장 실패: ${r.error ?? '알 수 없는 오류'}`, 'noMode')
        return
      }
      // CLI 자동 실행이 시도된 경우는 결과/에러를 토스트로 함께 안내.
      const saveMsg = formatPostureSuccess(r.results)
      if (r.stability) {
        if (r.stability.ok) {
          flashGuide(`${saveMsg} · 자세안정성 해석 완료 — 결과 패널이 열렸습니다.`, 'success')
        } else {
          flashGuide(
            `${saveMsg} · 해석 실패: ${r.stability.error ?? '알 수 없는 오류'}${r.stability.exitCode != null ? ` (exit ${r.stability.exitCode})` : ''}`,
            'noMode',
          )
        }
      } else {
        flashGuide(saveMsg, 'success')
      }
    } finally {
      setRunning(false)
    }
  }

  const hasReportOrError = !!stabilityReport || !!stabilityError

  return (
    // 상단 Hoist 탭의 좌측 도크(274px). 이전엔 3D 뷰포트 위 position:absolute floating 이었으나
    // 메뉴바 도입으로 도크로 이주했다. 폭은 Edit/Analyze 도크(274)와 동일하게 고정해야
    // UnitStructuralResultDock 의 layoutBounds.sidebarWidth 계산과 어긋나지 않는다.
    // 내부 컨트롤(방식·그룹·노드 칩·Wire·외경·실행)·store·단축키 로직은 그대로 유지.
    <div style={{
      width: 274,
      flexShrink: 0,
      position: 'relative',
      background: '#0b0b1e',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '8px',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
    }}>
      <div style={{ fontSize: 14, color: '#90E8FF', letterSpacing: 0.8, fontWeight: 900 }}>
        권상 위치 설정
      </div>
      <div style={{ fontSize: 12, color: '#8fa9bf', lineHeight: 1.45 }}>
        방식을 선택한 뒤 그룹을 고르고 뷰어에서 Shift + Node 클릭으로 권상 위치를 지정하세요. Hydro 4그룹 / Goliat 3그룹 / 천장 Crane 1그룹(3~4점).
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {HOIST_MODES.map(m => {
          const active = mode === m.id
          const nodeRule = m.minNodes === 3
            ? '노드 3 또는 4개 (삼각형/사각형, 직선 2점 불가)'
            : '노드 2~4개 (직선/삼각형/사각형)'
          const tip = active
            ? `${m.label} 해제 — 모든 권상 그룹 입력이 비활성됩니다.`
            : (
              <>
                <strong style={{ color: '#90E8FF' }}>{m.label}</strong> ({m.detail}) 권상 방식으로 전환합니다.<br/>
                · 그룹 최대 <strong>{m.maxGroups}개</strong> {m.maxGroups === 1 ? '(고정)' : '까지 생성'}<br/>
                · 그룹당 {nodeRule}<br/>
                · Wire 기본 길이 <strong>{m.defaultWire}m</strong><br/>
                · 다른 방식으로 바꾸면 상한을 넘는 그룹은 자동 비워집니다.
              </>
            )
          const detailText = `${m.detail} · 최대 ${m.maxGroups}${m.maxGroups === 1 ? '그룹(고정)' : '그룹'}`
          return (
            <Tooltip key={m.id} content={tip} placement="right">
              <button
                onClick={() => setMode(active ? null : m.id)}
                aria-label={active ? `${m.label} 해제` : `${m.label} 선택`}
                style={{
                  display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  minWidth: 0,
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: active ? 'rgba(0,209,255,0.20)' : '#101024',
                  color: active ? '#E8FBFF' : '#8aa0b8',
                  border: `1px solid ${active ? '#00D1FF' : '#2a2a4a'}`,
                  boxShadow: active ? '0 0 12px rgba(0,209,255,0.30)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
                  transform: active ? 'translateY(-1px)' : 'translateY(0)',
                  width: '100%',
                }}>
                <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', transition: 'color 180ms ease' }}>
                  {m.label}
                </span>
                <span style={{ fontSize: 10, color: active ? '#90E8FF' : '#60708a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 180ms ease' }}>
                  {detailText}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </div>

      {Array.from({ length: groupCount }, (_, i) => i + 1).map(id => {
        const nodes = groups[id] ?? []
        const active = activeGroupId === id
        const color = HOIST_GROUP_COLORS[id]
        const valid = nodes.length >= minNodesForMode && nodes.length <= 4
        return (
          <div
            key={id}
            style={{
              border: `1px solid ${active ? color : '#2a2a4a'}`,
              borderRadius: 6,
              background: active ? `${color}14` : '#0f0f22',
              padding: '6px',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveGroup(id) }}
                title={`권상 그룹 ${id} 선택`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, flex: 1,
                  background: 'transparent', border: 'none', padding: 0,
                  color: active ? '#f0f8ff' : '#8a8aa8',
                  cursor: 'pointer', textAlign: 'left',
                  fontSize: 11, fontWeight: 800,
                }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: active ? `0 0 7px ${color}` : 'none' }} />
                그룹 {id}
                <span style={{ color: valid ? '#6ac58f' : '#8aa0b8', fontSize: 10, fontWeight: 600 }}>
                  선택 {nodes.length}개
                </span>
              </button>
              <Tooltip
                placement="top"
                content={
                  <>
                    <strong style={{ color: '#90E8FF' }}>그룹 {id} 노드 비우기</strong><br/>
                    선택한 노드만 모두 제거하고 그룹 자체는 유지합니다. 그룹 슬롯과 색상은 그대로 남고 다시 Shift+노드 클릭으로 채울 수 있습니다.
                  </>
                }>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (nodes.length > 0) clearGroup(id) }}
                  disabled={nodes.length === 0}
                  aria-label={`그룹 ${id} 노드 비우기`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, flexShrink: 0,
                    background: nodes.length === 0 ? 'transparent' : `${color}24`,
                    border: `1px solid ${nodes.length === 0 ? '#2a2a4a' : color + '66'}`,
                    borderRadius: 5,
                    color: nodes.length === 0 ? '#3a3a52' : color,
                    cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
                    padding: 0, lineHeight: 0,
                    transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                  }}>
                  <X size={13} strokeWidth={2.5} />
                </button>
              </Tooltip>
              {(() => {
                const canDelete = groupCount > 1
                const tipDel = canDelete
                  ? (
                    <>
                      <strong style={{ color: '#E07070' }}>그룹 {id} 삭제</strong><br/>
                      이 그룹을 통째로 제거합니다. 이후 그룹 ID 는 한 칸씩 당겨와 자동 재정렬됩니다 (예: 그룹 2 삭제 → 옛 그룹 3·4 가 새 2·3).
                    </>
                  )
                  : '최소 1개 그룹은 유지해야 합니다.'
                return (
                  <Tooltip placement="top" content={tipDel}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (canDelete) removeGroup(id) }}
                      disabled={!canDelete}
                      aria-label={`그룹 ${id} 삭제`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, flexShrink: 0,
                        background: 'transparent',
                        border: `1px solid ${canDelete ? '#c14a4a55' : '#2a2a4a'}`,
                        borderRadius: 5,
                        color: canDelete ? '#E07070' : '#3a3a52',
                        cursor: canDelete ? 'pointer' : 'not-allowed',
                        padding: 0, lineHeight: 0,
                        transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                      }}
                      onMouseEnter={e => { if (canDelete) e.currentTarget.style.background = 'rgba(224,112,112,0.18)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <Trash2 size={12} strokeWidth={2.2} />
                    </button>
                  </Tooltip>
                )
              })()}
            </div>
            <div style={{ minHeight: 26, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {nodes.length === 0 ? (
                <span style={{ fontSize: 10, color: '#4e5870' }}>Shift + Node 클릭으로 추가</span>
              ) : nodes.map(nodeId => (
                <button
                  key={nodeId}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeNode(id, nodeId) }}
                  title={`N${nodeId} 제거`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 7px',
                    borderRadius: 5,
                    background: `${color}28`,
                    border: `1px solid ${color}aa`,
                    color: '#e8f4ff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    lineHeight: 1,
                    transition: 'background 100ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${color}44` }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${color}28` }}>
                  N{nodeId}<X size={12} strokeWidth={2.5} />
                </button>
              ))}
            </div>
            {nodes.length > 0 && nodes.length < minNodesForMode && (
              <div style={{ marginTop: 4, fontSize: 10, color: '#FFAA55' }}>
                {minNodesForMode === 3 ? '최소 3개 필요 (천장 Crane 은 직선 2점 권상 불가)' : `최소 ${minNodesForMode}개 필요`}
              </div>
            )}
          </div>
        )
      })}

      {(() => {
        const canAdd = groupCount < maxGroupsForMode
        const modeLabel = mode === 'ceiling' ? '천장 Crane'
                       : mode === 'goliat'  ? 'Goliat'
                       : mode === 'hydro'   ? 'Hydro' : '현재'
        const tipAdd = canAdd
          ? (
            <>
              <strong style={{ color: '#90E8FF' }}>새 권상 그룹 추가</strong><br/>
              새 그룹이 추가되며 <strong>자동으로 활성화</strong> 됩니다. 이후 Shift+노드 클릭으로 그 그룹의 권상 위치를 지정하세요.
            </>
          )
          : mode === 'ceiling'
            ? '천장 Crane 방식은 그룹이 1개로 고정됩니다 — 한 그룹 안에 노드 3 또는 4개를 선택해 주세요.'
            : `${modeLabel} 방식은 최대 ${maxGroupsForMode}그룹까지만 만들 수 있습니다.`
        return (
          <Tooltip placement="bottom" content={tipAdd}>
            <button
              onClick={() => { if (canAdd) setGroupCount(groupCount + 1) }}
              disabled={!canAdd}
              aria-label="권상 그룹 추가"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                width: '100%',
                padding: '7px 8px',
                borderRadius: 6,
                background: canAdd ? '#101024' : '#0a0a18',
                color: canAdd ? '#90E8FF' : '#3a3a52',
                border: `1px dashed ${canAdd ? '#00D1FF66' : '#2a2a4a'}`,
                cursor: canAdd ? 'pointer' : 'not-allowed',
                fontSize: 11,
                fontWeight: 700,
              }}>
              <Plus size={13} />
              그룹 추가
            </button>
          </Tooltip>
        )
      })()}

      {/* Wire 길이 — 모드 전환 시 기본값(Hydro 8m / Goliat 24m / 천장 Crane 5m) 자동 설정, 사용자가 변경 가능 */}
      {(() => {
        const defaultWire = getHoistDefaultWireLengthM(mode)
        const isDefault = mode != null && wireLengthM != null && wireLengthM === defaultWire
        const wireDefaultLabel = mode === 'hydro' ? 'Hydro 방식 기본 8m'
                              : mode === 'goliat' ? 'Goliat 방식 기본 24m'
                              : mode === 'ceiling' ? '천장 Crane 방식 기본 5m'
                              : null
        const tip = !mode
          ? '권상 방식(Hydro / Goliat / 천장 Crane)을 먼저 선택하세요. (Hydro 8m, Goliat 24m, 천장 Crane 5m 기본)'
          : (
            <>
              <strong style={{ color: '#90E8FF' }}>Wire 길이 (m)</strong><br/>
              {wireDefaultLabel} — 사용자가 자유롭게 변경 가능합니다.<br/>
              자세안정성 평가 입력 JSON(<code>_posture.json</code>)의 <code>hoisting.wireLengthM</code> 으로 함께 저장됩니다.<br/>
              모드를 바꾸면 새 모드의 기본값으로 자동 리셋됩니다.
            </>
          )
        return (
          <div style={{
            marginTop: 2,
            borderTop: '1px solid #2a2a4a',
            paddingTop: 7,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <label style={{ fontSize: 11, color: '#90E8FF', fontWeight: 800, letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span>Wire 길이 (m)</span>
              {isDefault && (
                <span style={{ fontSize: 9, color: '#60708a', fontWeight: 600 }}>기본값</span>
              )}
            </label>
            <Tooltip placement="top" content={tip}>
              <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={wireLengthM ?? ''}
                  placeholder={mode === 'hydro' ? '예: 8' : mode === 'goliat' ? '예: 24' : mode === 'ceiling' ? '예: 5' : '권상 방식 선택 후 입력'}
                  disabled={!mode}
                  onChange={e => setWireLength(e.target.value)}
                  aria-label="권상 와이어 길이 (m)"
                  style={{
                    flex: 1,
                    padding: '5px 7px',
                    borderRadius: 4,
                    background: !mode ? '#0a0a18' : '#0c0c1c',
                    border: `1px solid ${!mode ? '#2a2a4a' : (wireLengthM ? '#00D1FF66' : '#2a2a4a')}`,
                    color: !mode ? '#3a3a52' : '#e8f4ff',
                    fontSize: 12,
                    outline: 'none',
                    minWidth: 0,
                    width: '100%',
                  }}
                />
                {mode && (
                  <Tooltip placement="top" content={`${mode === 'hydro' ? 'Hydro 8m' : mode === 'goliat' ? 'Goliat 24m' : '천장 Crane 5m'} 기본값으로 되돌립니다.`}>
                    <button
                      type="button"
                      onClick={() => setWireLength(defaultWire)}
                      disabled={isDefault}
                      aria-label="와이어 길이 기본값으로 리셋"
                      style={{
                        padding: '0 9px',
                        borderRadius: 4,
                        background: isDefault ? '#0a0a18' : '#101024',
                        border: '1px solid #2a2a4a',
                        color: isDefault ? '#3a3a52' : '#7070a0',
                        cursor: isDefault ? 'not-allowed' : 'pointer',
                        fontSize: 10,
                        fontWeight: 700,
                      }}>
                      기본
                    </button>
                  </Tooltip>
                )}
              </div>
            </Tooltip>
          </div>
        )
      })()}

      {/* 배관 외경 비교 — 권상 후보 배관 식별용 */}
      <div style={{
        marginTop: 2,
        borderTop: '1px solid #2a2a4a',
        paddingTop: 7,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <label style={{ fontSize: 11, color: '#90E8FF', fontWeight: 800, letterSpacing: 0.5 }}>
          배관 외경 임계 (mm)
        </label>
        <div style={{ fontSize: 10, color: '#60708a', lineHeight: 1.4 }}>
          입력 값 이상 배관은 <span style={{ color: '#37E08A', fontWeight: 700 }}>녹색</span>,
          미만은 <span style={{ color: '#C04A4A', fontWeight: 700 }}>적색</span>으로 표시됩니다.
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Tooltip
            placement="top"
            content={
              <>
                <strong style={{ color: '#37E08A' }}>외경 임계값(mm)</strong><br/>
                Pipe 카테고리 element 의 외경(Tube/Rod) 을 이 값과 비교해 시각화합니다.<br/>
                · 임계값 이상 → <span style={{ color: '#40FF8E', fontWeight: 700 }}>녹색(굵게)</span> — 권상 후보<br/>
                · 임계값 미만 → <span style={{ color: '#FF4E55', fontWeight: 700 }}>적색</span> — 부적합<br/>
                Bar/L/H 단면은 비교 대상이 아닙니다.
              </>
            }>
            <input
              type="number"
              min="0"
              step="any"
              value={pipeDiameter ?? ''}
              placeholder="예: 80"
              onChange={e => setPipeDiameter(e.target.value)}
              aria-label="배관 외경 임계 입력"
              style={{
                flex: 1,
                padding: '5px 7px',
                borderRadius: 4,
                background: '#0c0c1c',
                border: `1px solid ${pipeDiameter ? '#37E08A66' : '#2a2a4a'}`,
                color: '#e8f4ff',
                fontSize: 12,
                outline: 'none',
                minWidth: 0,
                width: '100%',
              }}
            />
          </Tooltip>
          <Tooltip placement="top" content="배관 외경 비교 시각화를 끕니다.">
            <button
              onClick={() => setPipeDiameter(null)}
              disabled={pipeDiameter == null}
              aria-label="외경 비교 해제"
              style={{
                padding: '0 9px',
                borderRadius: 4,
                background: pipeDiameter == null ? '#0a0a18' : '#101024',
                border: '1px solid #2a2a4a',
                color: pipeDiameter == null ? '#3a3a52' : '#7070a0',
                cursor: pipeDiameter == null ? 'not-allowed' : 'pointer',
                fontSize: 10,
                fontWeight: 700,
              }}>
              해제
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 자세안정성 평가 실행 */}
      <div style={{
        marginTop: 4,
        borderTop: '1px solid #2a2a4a',
        paddingTop: 8,
      }}>
        <Tooltip
          placement="top"
          content={
            !mode
              ? '먼저 권상 방식(Hydro / Goliat / 천장 Crane)을 선택해 주세요.'
              : !allGroupsValid
                ? (mode === 'ceiling'
                    ? '천장 Crane 은 그룹 1개에 노드 3 또는 4개(삼각형/사각형) 를 선택해야 평가를 실행할 수 있습니다.'
                    : '모든 그룹이 2~4 개의 노드(직선/삼각형/사각형) 를 가져야 평가를 실행할 수 있습니다.')
                : (
                  <>
                    <strong style={{ color: '#6AE07A' }}>자세안정성 평가 실행</strong><br/>
                    편집 의도가 있으면 적용된 모델 <code>_edited.json</code> 을 먼저 저장한 뒤,
                    권상 설정 <code>_posture.json</code> 을 저장합니다.<br/>
                    저장 위치 우선순위: <strong>Workbench 백엔드</strong> → 열어둔 폴더 → 다운로드.
                  </>
                )
          }>
          <button
            type="button"
            onClick={onRunEvaluation}
            disabled={!canRunEvaluation || running}
            aria-label="자세안정성 평가 실행"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              width: '100%',
              padding: '10px 10px',
              borderRadius: 7,
              background: canRunEvaluation
                ? 'linear-gradient(180deg, #1FA86A 0%, #178A55 100%)'
                : '#0a0a18',
              border: `1px solid ${canRunEvaluation ? '#2BD380' : '#2a2a4a'}`,
              color: canRunEvaluation ? '#F0FFF4' : '#3a3a52',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.4,
              cursor: canRunEvaluation && !running ? 'pointer' : 'not-allowed',
              boxShadow: canRunEvaluation ? '0 0 14px rgba(43, 211, 128, 0.30)' : 'none',
              transition: 'background 150ms ease, box-shadow 150ms ease, color 150ms ease',
            }}>
            {running
              ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
              : <Play size={14} fill={canRunEvaluation ? '#F0FFF4' : 'none'} strokeWidth={2.5} />}
            {running ? '저장 중…' : '자세안정성 평가 실행'}
          </button>
        </Tooltip>
        {!canRunEvaluation && (
          <div style={{ marginTop: 5, fontSize: 10, color: '#7a8aaa', lineHeight: 1.45 }}>
            {!mode
              ? '권상 방식(Hydro / Goliat / 천장 Crane) 선택 필요'
              : mode === 'ceiling'
                ? '천장 Crane: 그룹 1개에 노드 3 또는 4개 필요'
                : '각 그룹은 2~4개의 노드가 있어야 합니다'}
          </div>
        )}

        {hasReportOrError && (
          <Tooltip placement="top" content="가장 최근 자세안정성 해석 결과 패널을 다시 열어 단계별 PASS/WARN/FAIL 카드를 확인합니다.">
            <button
              type="button"
              onClick={openStabilityPanel}
              aria-label="자세안정성 결과 패널 열기"
              style={{
                marginTop: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%',
                padding: '7px 10px',
                borderRadius: 6,
                background: stabilityOverall === 'fail' ? 'rgba(255,85,102,0.10)'
                          : stabilityOverall === 'warn' ? 'rgba(255,196,71,0.10)'
                          : stabilityOverall === 'pass' ? 'rgba(55,224,138,0.10)'
                          : '#101024',
                border: `1px solid ${
                  stabilityOverall === 'fail' ? 'rgba(255,85,102,0.55)'
                : stabilityOverall === 'warn' ? 'rgba(255,196,71,0.55)'
                : stabilityOverall === 'pass' ? 'rgba(55,224,138,0.55)'
                : '#2a2a4a'}`,
                color: stabilityOverall === 'fail' ? '#FF99A6'
                     : stabilityOverall === 'warn' ? '#FFC447'
                     : stabilityOverall === 'pass' ? '#37E08A'
                     : '#cad8e8',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                cursor: 'pointer',
              }}>
              <ClipboardList size={13} />
              결과 보기
              {stabilityOverall && (
                <span style={{ fontSize: 10, fontWeight: 800 }}>
                  · {stabilityOverall.toUpperCase()}
                </span>
              )}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
