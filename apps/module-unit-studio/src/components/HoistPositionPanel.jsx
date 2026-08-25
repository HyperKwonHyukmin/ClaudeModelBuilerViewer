import { Fragment, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardList, Eye, EyeOff, Loader2, Play, Plus, RotateCcw, ShieldAlert, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import {
  useEditStore,
  getHoistMaxGroups,
  getHoistDefaultWireLengthM,
  getHoistMinNodesPerGroup,
  suggestCogToleranceMm,
} from '../store/useEditStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { autoHoistCircleTolMm } from '../three/HoistCircleCandidateNodes.js'
import { COLORS } from '../utils/colors.js'
import Tooltip from './Tooltip.jsx'
import HoistAutoResultModal from './HoistAutoResultModal.jsx'

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

// 권상 후보 강조 색(민트) — 3D 오버레이(HoistCandidateNodes)와 동일 토큰을 공유한다.
const CANDIDATE_CSS = `#${COLORS.hoistCandidate.toString(16).padStart(6, '0')}`

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
  const resetHoistPoints = useEditStore(s => s.resetHoistPoints)
  const pipeDiameter = useEditStore(s => s.pipeDiameterThreshold)
  const setPipeDiameter = useEditStore(s => s.setPipeDiameterThreshold)
  const circleGuideEnabled = useEditStore(s => s.circleGuideEnabled)
  const toggleCircleGuide = useEditStore(s => s.toggleCircleGuide)
  const hoistCircleTolMm = useEditStore(s => s.hoistCircleTolMm)
  const setHoistCircleTol = useEditStore(s => s.setHoistCircleTol)
  const showHoistPlate = useEditStore(s => s.showHoistPlate)
  const toggleHoistPlate = useEditStore(s => s.toggleHoistPlate)
  const wireLengthM = useEditStore(s => s.wireLengthM)
  const setWireLength = useEditStore(s => s.setWireLength)
  const exportPosture = useEditStore(s => s.exportPostureStabilityToFile)
  const flashGuide = useEditStore(s => s.flashHoistGuide)
  const stabilityReport  = useStabilityStore(s => s.report)
  const stabilityRunning = useStabilityStore(s => s.running)
  const stabilityError   = useStabilityStore(s => s.error)
  const stabilityOverall = useStabilityStore(s => s.overallStatus)
  const openStabilityPanel = useStabilityStore(s => s.openPanel)
  const resetStability = useStabilityStore(s => s.reset)

  const maxGroupsForMode = getHoistMaxGroups(mode)
  const minNodesForMode  = getHoistMinNodesPerGroup(mode)   // ceiling=3, 그 외=2

  // Circle Guide Tolerance 자동값(placeholder/안내용) — 마지막 stage bbox 수평(XY) 대각 기반.
  const stages = useStageStore(s => s.stages)
  const lastStage = stages?.[stages.length - 1] ?? null
  const autoCircleTolMm = autoHoistCircleTolMm(
    lastStage?.bbox ? Math.hypot(lastStage.bbox.maxX - lastStage.bbox.minX, lastStage.bbox.maxY - lastStage.bbox.minY) : 0
  )

  const hasModel = (stages?.length ?? 0) > 0
  const [autoModalOpen, setAutoModalOpen] = useState(false)
  const canAutoSelect = hasModel && !!mode

  // STEP 3 옵션을 사용자가 건드렸는지(강조 Tolerance/배관 외경 지정) — 미니 스테퍼 표시용.
  // 옵션은 선택 사항이므로 '완료'가 아니라 '입력됨' 신호로만 쓴다.
  const optionsTouched = pipeDiameter != null

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
        flashGuide(`저장 실패: ${r.error ?? '알 수 없는 오류'}`, 'error')
        return
      }
      // CLI 자동 실행이 시도된 경우는 결과/에러를 토스트로 함께 안내.
      const saveMsg = formatPostureSuccess(r.results)
      if (r.stability) {
        if (r.stability.ok) {
          flashGuide(`${saveMsg} · 자세안정성 해석 완료 — 결과 패널이 열렸습니다.`, 'success')
        } else if (r.stability.notRun) {
          // 저장은 됐으나 경로 미확인으로 자동 해석을 건너뜀 — '저장 완료'로 오인하지 않게 경고로 안내.
          flashGuide(`${saveMsg} · ⚠ 자동 해석 미실행: ${r.stability.error}`, 'noMode')
        } else {
          flashGuide(
            `${saveMsg} · 해석 실패: ${r.stability.error ?? '알 수 없는 오류'}${r.stability.exitCode != null ? ` (exit ${r.stability.exitCode})` : ''}`,
            'error',
          )
        }
      } else {
        flashGuide(saveMsg, 'success')
      }
    } catch (e) {
      // exportPosture 가 throw 하면 무음 실패가 되지 않도록 사용자에게 안내.
      flashGuide(`저장 실패: ${e?.message ?? String(e)}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  const hasReportOrError = !!stabilityReport || !!stabilityError

  // 초기화 — 지정된 권상점 또는 실행 결과(wire)가 있을 때만 활성.
  const anyHoistNodes = Object.values(groups).some(a => (a?.length ?? 0) > 0)
  const canReset = anyHoistNodes || hasReportOrError
  const onResetHoist = () => {
    if (!canReset) return
    resetHoistPoints()   // 모든 그룹 노드 비우기 + 그룹 수/활성 그룹 → 1 (권상 방식은 유지)
    resetStability()     // 생성된 wire(및 자세안정성 결과) 시각화 제거
    flashGuide('권상점과 생성된 wire를 모두 초기화했습니다.', 'success')
  }

  return (
    // 상단 Hoist 탭의 좌측 도크(301px). 이전엔 3D 뷰포트 위 position:absolute floating 이었으나
    // 메뉴바 도입으로 도크로 이주했다. 폭은 Edit/Analyze 도크(301)와 동일하게 고정해야
    // UnitStructuralResultDock 의 layoutBounds.sidebarWidth 계산과 어긋나지 않는다.
    // 내부 컨트롤(방식·그룹·노드 칩·Wire·외경·실행)·store·단축키 로직은 그대로 유지.
    <div style={{
      width: 301,
      flexShrink: 0,
      position: 'relative',
      background: '#0b0b1e',
      borderRight: '1px solid #1e1e38',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '8px',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 14, color: '#90E8FF', letterSpacing: 0.8, fontWeight: 900 }}>
          권상(Hoisting) 위치 설정
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* 가상판(Z-레벨 가이드 평판) 표시 토글 — hoist 리본 헤더 고정(사용자 요청 2026-07-03, 기본 켜짐). */}
        <Tooltip
          placement="bottom"
          content={showHoistPlate
            ? <>활성 권상 그룹의 <strong style={{ color: '#90E8FF' }}>Z-레벨 가이드 판(가상판)</strong>을 <strong>숨깁니다</strong>. (뷰가 가려질 때)</>
            : <>활성 권상 그룹의 <strong style={{ color: '#90E8FF' }}>Z-레벨 가이드 판(가상판)</strong>을 <strong>표시합니다</strong>.</>}>
          <button
            type="button"
            onClick={toggleHoistPlate}
            role="switch"
            aria-checked={showHoistPlate}
            aria-label="가상판 표시 토글"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '5px 10px', borderRadius: 6,
              background: showHoistPlate ? 'rgba(0,209,255,0.16)' : '#0a0a18',
              border: `1px solid ${showHoistPlate ? '#00D1FF' : '#2a2a4a'}`,
              color: showHoistPlate ? '#90E8FF' : '#5a6a82',
              cursor: 'pointer', fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
              transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
            }}>
            {showHoistPlate ? <Eye size={13} strokeWidth={2.4} /> : <EyeOff size={13} strokeWidth={2.4} />}
            가상판
          </button>
        </Tooltip>
        {/* 초기화 — 모든 권상점 해지 + 생성된 wire 제거(처음부터 다시 지정). 헤더 고정 액션. */}
        <Tooltip
          placement="left"
          content={
            <>
              <strong style={{ color: '#FFC447' }}>권상점 초기화</strong><br/>
              지정된 <strong>모든 권상 그룹의 노드</strong>를 비우고 그룹을 1개로 되돌리며,
              자세안정성 평가로 생성된 <strong>wire 표시도 모두 제거</strong>합니다.<br/>
              권상 방식·Wire 길이·옵션은 유지되므로 곧바로 다시 지정할 수 있습니다.
            </>
          }>
          <button
            type="button"
            onClick={onResetHoist}
            disabled={!canReset}
            aria-label="권상점 초기화"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '5px 10px',
              borderRadius: 6,
              background: canReset ? 'rgba(255,196,71,0.14)' : '#0a0a18',
              border: `1px solid ${canReset ? 'rgba(255,196,71,0.6)' : '#2a2a4a'}`,
              color: canReset ? '#FFC447' : '#3a3a52',
              cursor: canReset ? 'pointer' : 'not-allowed',
              fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
              transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
            }}
            onMouseEnter={e => { if (canReset) e.currentTarget.style.background = 'rgba(255,196,71,0.24)' }}
            onMouseLeave={e => { if (canReset) e.currentTarget.style.background = 'rgba(255,196,71,0.14)' }}>
            <RotateCcw size={13} strokeWidth={2.4} />
            초기화
          </button>
        </Tooltip>
        </div>
      </div>

      {/* 진행 로드맵 — 초심자가 "지금 어디까지 했고 다음에 뭘 하는지" 한눈에 보도록 */}
      <StepFlow mode={mode} groupsValid={allGroupsValid} hasResult={!!stabilityReport} optionsTouched={optionsTouched} />

      {/* Strict 평가 토글 + 완화 상태 상시 경고 — STEP 들보다 위에 둔다(평가 전체의 전제 조건). */}
      <StrictEvaluationControl />

      {/* ── STEP 1. 권상 방식 ── */}
      <StepHeader n={1} title="권상 방식 선택" done={!!mode}
        desc="크레인/후크 방식을 먼저 고르세요. 방식에 따라 그룹 수와 노드 규칙이 자동으로 정해집니다." />

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
                <span style={{ fontSize: 10, color: active ? '#90E8FF' : '#8aa0b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 180ms ease' }}>
                  {detailText}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* ── STEP 2. 권상 위치 정하기 — 자동 추천(주) 또는 직접 지정(보조) ── */}
      <StepHeader n={2} title="권상 위치 정하기" done={allGroupsValid} disabled={!mode}
        desc={mode
          ? '구역을 나눠 PASS 위치를 추천받거나(권장), 3D에서 직접 클릭해 지정하세요.'
          : '먼저 STEP 1에서 권상 방식을 선택하세요.'} />

      {/* 주 경로 — 자동 추천(구역 기반): 구역을 나눠 자세안정성 PASS 위치를 찾아 제안 */}
      <button
        onClick={() => { if (canAutoSelect) setAutoModalOpen(true) }}
        disabled={!canAutoSelect}
        title={!hasModel ? '모델을 먼저 로드하세요' : !mode ? 'STEP 1 에서 권상 방식을 먼저 선택하세요' : '구역을 나눠 자세안정성 PASS 위치를 찾아 추천합니다'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 10px', borderRadius: 7, width: '100%',
          background: canAutoSelect ? 'linear-gradient(90deg, rgba(0,209,255,0.22), rgba(181,124,255,0.22))' : '#101024',
          color: canAutoSelect ? '#E8FBFF' : '#4a5a72',
          border: `1px solid ${canAutoSelect ? '#00D1FF' : '#2a2a4a'}`,
          cursor: canAutoSelect ? 'pointer' : 'not-allowed', fontSize: 12.5, fontWeight: 800,
          boxShadow: canAutoSelect ? '0 0 12px rgba(0,209,255,0.20)' : 'none',
        }}>
        <Sparkles size={15} /> 자동 추천 (구역 기반)
      </button>
      <div style={{ fontSize: 10, color: canAutoSelect ? '#7fd7ff' : '#5a6a82', textAlign: 'center', marginTop: -2, lineHeight: 1.4 }}>
        구역을 나눠 자세안정성 <b>PASS 위치</b>를 제안받습니다{mode ? '' : ' · 방식 선택 후 사용'}
      </div>

      {autoModalOpen && <HoistAutoResultModal onClose={() => setAutoModalOpen(false)} />}

      {/* 보조 경로 — 직접 지정(3D Shift+클릭). 접지 않고 노출하되 시각적으로 보조. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0 0' }}>
        <span style={{ flex: 1, height: 1, background: '#2a2a4a' }} />
        <span style={{ fontSize: 10, color: '#8aa0b8', fontWeight: 700, whiteSpace: 'nowrap' }}>또는 직접 지정</span>
        <span style={{ flex: 1, height: 1, background: '#2a2a4a' }} />
      </div>
      <div style={{ fontSize: 10, color: '#8aa0b8', marginTop: -2, lineHeight: 1.4 }}>
        그룹을 누른 뒤 3D 뷰에서 <b style={{ color: '#8aa0b8' }}>Shift+노드 클릭</b>으로 권상점을 직접 찍습니다. (민트색 = 후보 노드)
      </div>

      {/* Circle Guide — 무게중심 기준 등거리(가상 원) 후보 강조 토글 + 전용 Tolerance */}
      <div style={{
        marginTop: 2,
        border: `1px solid ${circleGuideEnabled ? CANDIDATE_CSS + '66' : '#2a2a4a'}`,
        borderRadius: 6,
        background: circleGuideEnabled ? `${CANDIDATE_CSS}12` : '#0f0f22',
        padding: '7px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <Tooltip
          placement="top"
          content={
            <>
              <strong style={{ color: CANDIDATE_CSS }}>Circle Guide</strong><br/>
              켜면 활성 그룹에서 <strong>첫 노드를 하나 찍었을 때</strong>, 무게중심(COG)을 중심으로
              <strong> COG↔첫노드 수평거리</strong>를 반지름으로 하는 가상 원(수평 링)을 그리고,
              그 원에서 <strong>±Tolerance</strong> 이내이면서 <strong>첫 노드와 같은 Z 레벨</strong>인 노드를 후보(민트)로 강조합니다.<br/>
              같은 데크(높이)에서 무게중심 기준 <strong>등거리</strong> 지점을 쉽게 고르도록 돕습니다.<br/>
              켜져 있는 동안 기존 "같은 높이" 후보 강조는 대체됩니다.
            </>
          }>
          <button
            type="button"
            onClick={toggleCircleGuide}
            role="switch"
            aria-checked={circleGuideEnabled}
            aria-label="Circle Guide 토글"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              width: '100%', padding: '6px 10px', borderRadius: 6,
              background: circleGuideEnabled ? `${CANDIDATE_CSS}24` : '#0a0a18',
              border: `1px solid ${circleGuideEnabled ? CANDIDATE_CSS : '#2a2a4a'}`,
              color: circleGuideEnabled ? '#e8f4ff' : '#7a8aaa',
              cursor: 'pointer', fontSize: 11.5, fontWeight: 800, letterSpacing: 0.3,
              transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
            }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: circleGuideEnabled ? CANDIDATE_CSS : '#3a3a58', boxShadow: circleGuideEnabled ? `0 0 6px ${CANDIDATE_CSS}` : 'none' }} />
              Circle Guide
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: circleGuideEnabled ? CANDIDATE_CSS : '#8aa0b8' }}>
              {circleGuideEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </Tooltip>
        {circleGuideEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: '#8aa0b8', lineHeight: 1.4 }}>
원 근처·같은 Z 레벨 판정 거리 <span style={{ color: CANDIDATE_CSS, fontWeight: 700 }}>Tolerance (mm)</span> — 비우면 자동(모델 크기 기반 ≈ {Math.round(autoCircleTolMm)}mm).
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                min="0"
                step="any"
                value={hoistCircleTolMm ?? ''}
                placeholder={`자동 ≈ ${Math.round(autoCircleTolMm)}`}
                onChange={e => setHoistCircleTol(e.target.value)}
                aria-label="Circle Guide Tolerance (mm)"
                style={{
                  flex: 1, padding: '5px 7px', borderRadius: 4,
                  background: '#0c0c1c',
                  border: `1px solid ${hoistCircleTolMm ? CANDIDATE_CSS + '66' : '#2a2a4a'}`,
                  color: '#e8f4ff', fontSize: 12, outline: 'none', minWidth: 0, width: '100%',
                }}
              />
              <Tooltip placement="top" content="Circle Guide Tolerance 를 자동값(모델 크기 기반)으로 되돌립니다.">
                <button
                  type="button"
                  onClick={() => setHoistCircleTol(null)}
                  disabled={hoistCircleTolMm == null}
                  aria-label="Circle Guide Tolerance 자동으로 리셋"
                  style={{
                    padding: '0 9px', borderRadius: 4,
                    background: hoistCircleTolMm == null ? '#0a0a18' : '#101024',
                    border: '1px solid #2a2a4a',
                    color: hoistCircleTolMm == null ? '#3a3a52' : '#9a9ad0',
                    cursor: hoistCircleTolMm == null ? 'not-allowed' : 'pointer',
                    fontSize: 10, fontWeight: 700,
                  }}>
                  자동
                </button>
              </Tooltip>
            </div>
          </div>
        )}
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
                      이 그룹을 통째로 제거하고 <strong>해당 그룹의 wire 표시도 함께 삭제</strong>합니다. 이후 그룹 ID 는 한 칸씩 당겨와 자동 재정렬됩니다 (예: 그룹 2 삭제 → 옛 그룹 3·4 가 새 2·3).
                    </>
                  )
                  : '최소 1개 그룹은 유지해야 합니다.'
                return (
                  <Tooltip placement="top" content={tipDel}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!canDelete) return
                        // 그룹 삭제(+ID 재정렬). wire 시각화 재정렬(dropGroupWires)은
                        // removeHoistGroup 이 스토어에서 함께 보장하므로 여기서 중복 호출하지 않는다.
                        removeGroup(id)
                      }}
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

      {/* ── STEP 3. 옵션 ── */}
      <StepHeader n={3} title="옵션 (선택 사항)"
        desc="Wire 길이·배관 외경 기준. 비워두면 자동값으로 진행됩니다." />

      {/* (후보 강조 Tolerance 입력은 제거됨 — STEP 2 의 Circle Guide 로 대체. 기본 같은-높이 강조는 자동값 사용) */}
      {/* (가상판 표시 토글은 상단 리본 헤더로 이동함 — 사용자 요청 2026-07-03) */}

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
                <span style={{ fontSize: 10, color: '#8aa0b8', fontWeight: 600 }}>기본값</span>
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
                        color: isDefault ? '#3a3a52' : '#9a9ad0',
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
        <div style={{ fontSize: 10, color: '#8aa0b8', lineHeight: 1.4 }}>
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
                color: pipeDiameter == null ? '#3a3a52' : '#9a9ad0',
                cursor: pipeDiameter == null ? 'not-allowed' : 'pointer',
                fontSize: 10,
                fontWeight: 700,
              }}>
              해제
            </button>
          </Tooltip>
        </div>
      </div>

      <AdvancedEvaluationOptions />

      {/* ── STEP 4. 평가 실행 ── */}
      <StepHeader n={4} title="자세안정성 평가 실행" done={!!stabilityReport}
        desc={canRunEvaluation ? '준비 완료 — 아래 버튼으로 평가를 실행하세요.' : 'STEP 1·2를 완료하면 실행할 수 있습니다.'} />

      {/* 자세안정성 평가 실행 — 도크 하단에 고정(sticky).
          이 패널의 내용은 1366×768 에서 세로로 301px 넘치기 때문에, 예전에는 이 탭의
          존재 이유인 실행 버튼이 fold 아래 181px 지점에 있어 스크롤해야 보였다.
          sticky 로 바닥에 붙여 두면 STEP 1·2 를 채우는 동안에도 "다음에 누를 것"이
          항상 눈에 남는다. 좌우 -8 은 패널 padding 을 상쇄해 푸터를 전폭으로 만든다. */}
      <div style={{
        position: 'sticky',
        bottom: -8,
        zIndex: 2,
        marginTop: 4,
        marginLeft: -8,
        marginRight: -8,
        padding: '8px 8px 10px',
        background: '#0b0b1e',
        borderTop: '1px solid #2a2a4a',
        boxShadow: '0 -10px 18px -10px rgba(0,0,0,0.75)',
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

// ── Strict 평가 토글 ────────────────────────────────────────────────────────
// OFF(기본) 면 엔진이 형상 판정을 완화한다 — Stage 1(형상 분류)·Stage 2(Z단차·convex·평면도·
// Trolley 단변·삼각형 내각) FAIL 을 warn 으로 강등하고, 옵티마이저 후보 게이트의 형상 검증도
// 우회해 형상 미충족 조합까지 권상 후보로 열거한다. 그 결과 권상 위치를 확정해 wire 를 설치하고
// 다음 단계로 넘어갈 수 있다.
//
// 완화되지 <b>않는</b> 것 — 이 두 가지는 OFF 여도 그대로 FAIL 이라 다음 단계가 막힌다:
//   · Stage 3 wireLengthM ≤ 0 (정점 자체를 만들 수 없음)
//   · Stage 6 전도 (COG 가 지지영역 이탈 — 모듈이 실제로 넘어지는 위험)
// 안전 판정을 느슨하게 하는 쪽이 기본값이므로 OFF 일 때는 항상 경고 배너를 함께 노출한다.
function StrictEvaluationControl() {
  const strict = useEditStore(s => s.strictEvaluation)
  const setStrict = useEditStore(s => s.setStrictEvaluation)
  const stabilityReport = useStabilityStore(s => s.report)

  const tip = strict
    ? (
      <>
        <strong style={{ color: '#6AE07A' }}>Strict 평가 ON</strong> — 형상 기준을 모두 만족해야 통과합니다.<br/>
        · 형상 분류·Z단차·평면도·볼록성·삼각형 내각 위반 시 <strong>FAIL</strong><br/>
        · 끄면 위 항목이 경고로만 표시되고 권상 위치를 확정할 수 있습니다.
      </>
    )
    : (
      <>
        <strong style={{ color: '#FFC447' }}>Strict 평가 OFF</strong> — 형상 기준 미달을 경고로만 표시합니다.<br/>
        · 형상 분류·Z단차·평면도·볼록성·삼각형 내각 → <strong>경고</strong>(권상 위치 확정 가능)<br/>
        · <strong style={{ color: '#FF99A6' }}>전도(자세안정성)</strong>와 <strong style={{ color: '#FF99A6' }}>Wire 길이 오류</strong>는 그대로 FAIL 입니다.<br/>
        · 켜면 기존처럼 형상 미달 시 진행이 막힙니다.
      </>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Tooltip content={tip} placement="right">
        <button
          type="button"
          role="switch"
          aria-checked={strict}
          aria-label="Strict 평가 토글"
          onClick={() => setStrict(!strict)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, width: '100%',
            padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
            background: strict ? 'rgba(106,224,122,0.14)' : 'rgba(255,196,71,0.12)',
            border: `1px solid ${strict ? 'rgba(106,224,122,0.55)' : 'rgba(255,196,71,0.55)'}`,
            color: strict ? '#6AE07A' : '#FFC447',
            transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
          }}>
          {strict ? <ShieldCheck size={13} strokeWidth={2.4} /> : <ShieldAlert size={13} strokeWidth={2.4} />}
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
            Strict 평가
          </span>
          {/* 스위치 트랙 — 우측 정렬 */}
          <span style={{
            marginLeft: 'auto', position: 'relative', flexShrink: 0,
            width: 28, height: 15, borderRadius: 999,
            background: strict ? 'rgba(106,224,122,0.35)' : 'rgba(120,130,150,0.30)',
            border: `1px solid ${strict ? 'rgba(106,224,122,0.7)' : 'rgba(140,150,170,0.5)'}`,
            transition: 'background 150ms ease, border-color 150ms ease',
          }}>
            <span style={{
              position: 'absolute', top: 1, left: strict ? 14 : 1,
              width: 11, height: 11, borderRadius: '50%',
              background: strict ? '#6AE07A' : '#8aa0b8',
              transition: 'left 150ms ease, background 150ms ease',
            }} />
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, width: 24, textAlign: 'right', flexShrink: 0 }}>
            {strict ? 'ON' : 'OFF'}
          </span>
        </button>
      </Tooltip>

      {/* 완화 상태 상시 경고 — 토글이 꺼져 있는 동안 계속 보인다(결과 유무와 무관). */}
      {!strict && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          padding: '6px 8px', borderRadius: 6,
          background: 'rgba(255,196,71,0.08)',
          border: '1px dashed rgba(255,196,71,0.45)',
          color: '#FFC447', fontSize: 10, lineHeight: 1.5,
        }}>
          <AlertTriangle size={12} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            형상 기준 미달을 <strong>경고로만</strong> 표시합니다{stabilityReport ? ' (현재 결과도 이 기준으로 평가됨)' : ''}.
            <br/>전도·Wire 길이 오류는 그대로 FAIL 입니다.
          </span>
        </div>
      )}
    </div>
  )
}

// ── 진행 로드맵(미니 스테퍼) — 초심자가 전체 흐름(방식→위치→옵션→실행)을 한눈에 ──
// '옵션'은 선택 사항이라 done 개념이 없다 → optional 로 표시하고, 입력이 있으면 touched(점) 로만 구분.
function StepFlow({ mode, groupsValid, hasResult, optionsTouched = false }) {
  const steps = [
    { n: 1, label: '방식', done: !!mode },
    { n: 2, label: '위치', done: !!mode && groupsValid },
    { n: 3, label: '옵션', optional: true, touched: optionsTouched },
    { n: 4, label: '실행', done: !!hasResult },
  ]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '6px 7px', borderRadius: 7,
      background: '#0e0e22', border: '1px solid #20203a',
    }}>
      {steps.map((s, i) => {
        // 옵션(optional) 단계는 완료 개념 대신 '선택'으로 표시하고, 입력이 있으면 점(●)으로 구분.
        const isOptional = s.optional === true
        const borderColor = s.done ? '#2BD380' : '#2a3a55'
        return (
        <Fragment key={s.n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{
              width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? '#1FA86A' : '#16233a',
              color: s.done ? '#06121e' : (isOptional && s.touched) ? '#7fd7ff' : '#90E8FF',
              border: `1px ${isOptional ? 'dashed' : 'solid'} ${borderColor}`,
              fontSize: 10, fontWeight: 900,
            }}>{s.done ? '✓' : isOptional ? (s.touched ? '●' : '·') : s.n}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: s.done ? '#9fe6c2' : '#8fa9bf', whiteSpace: 'nowrap' }}>
              {s.label}{isOptional ? <span style={{ color: '#5a6a82', fontWeight: 600 }}> (선택)</span> : null}
            </span>
          </div>
          {i < steps.length - 1 && <span style={{ flex: 1, height: 1, background: '#2a2a4a', minWidth: 6 }} />}
        </Fragment>
        )
      })}
    </div>
  )
}

// ── 단계 헤더 — 번호 배지 + 제목 + 한 줄 가이드(초심자 안내) ──
function StepHeader({ n, title, desc, done = false, disabled = false }) {
  const accent = done ? '#1FA86A' : disabled ? '#33384a' : '#00D1FF'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4, opacity: disabled ? 0.6 : 1 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#1FA86A' : 'transparent',
        color: done ? '#06121e' : accent,
        border: `1.5px solid ${accent}`,
        fontSize: 11, fontWeight: 900,
      }}>{done ? '✓' : n}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: done ? '#9fe6c2' : '#e6f1ff', letterSpacing: 0.2 }}>{title}</span>
        {desc && <span style={{ fontSize: 10, color: '#7a8aaa', lineHeight: 1.4 }}>{desc}</span>}
      </div>
    </div>
  )
}

// ── 정밀 검토 옵션 (선택) ───────────────────────────────────────────────────
// 둘 다 기본 OFF 이고, 켜야만 _posture.json 에 실려 엔진 동작이 달라진다.
//
//  · 리깅 검토(Stage 7) — 켜기 전까지 Module Unit 은 liftAnalysis 를 보내지 않아 슬링·샤클·
//    러그가 견디는지 한 번도 검토되지 않았다. 모듈 부재 응력은 Nastran 단위 구조해석이 잡지만
//    리깅 요소는 그 FE 모델에 없다.
//  · 무게중심 포락선(Stage 6) — massSource 가 빔+점질량이라 FE 모델에 없는 의장품이 통째로
//    빠진다. 결정론적 COG 한 점 평가로는 "여유 20mm 로 PASS" 가 아무것도 보장하지 못한다.
//
// 패널이 이미 세로로 넘치므로 기본 접힘. 켜져 있으면 접혀 있어도 헤더에 배지를 남겨
// "지금 어떤 기준으로 평가되는지"가 숨지 않게 한다.
function AdvancedEvaluationOptions() {
  const [open, setOpen] = useState(false)
  const lift = useEditStore(s => s.liftAnalysis)
  const setLift = useEditStore(s => s.setLiftAnalysis)
  const cogTol = useEditStore(s => s.cogTolerance)
  const setCogTol = useEditStore(s => s.setCogTolerance)
  const bbox = useStageStore(s => s.stages?.[s.stages.length - 1]?.bbox ?? null)

  const activeCount = (lift?.enabled ? 1 : 0) + (cogTol?.enabled ? 1 : 0)
  const suggestion = suggestCogToleranceMm(bbox)

  return (
    <div style={{ marginTop: 6, borderTop: '1px solid #2a2a4a', paddingTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
          color: '#9fb4cc', fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
        }}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>정밀 검토 옵션</span>
        {activeCount > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 9.5, fontWeight: 800,
            padding: '1px 6px', borderRadius: 999,
            background: 'rgba(0,209,255,0.16)', color: '#00D1FF',
            border: '1px solid rgba(0,209,255,0.45)',
          }}>{activeCount}개 사용 중</span>
        )}
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>

          {/* 권상 리깅 검토 (Stage 7) */}
          <OptionBlock
            label="권상 리깅 검토 (SWL·DAF)"
            checked={!!lift?.enabled}
            onToggle={v => setLift({ enabled: v })}
            hint="슬링 장력을 계산해 허용하중(SWL) 대비 검토합니다. 허용값은 직접 입력하세요 — 비우면 그 검사만 생략되고 장력은 계속 산출됩니다."
          >
            {[
              { key: 'daf', label: 'DAF (동하중계수)', step: '0.05', ph: '1.15' },
              { key: 'weightContingencyPct', label: '무게 여유 (%)', step: '1', ph: '10' },
              { key: 'wireSwlTon', label: '와이어 SWL (ton)', step: '0.5', ph: '예: 12' },
              { key: 'shackleSwlTon', label: '샤클 SWL (ton)', step: '0.5', ph: '예: 17' },
              { key: 'lugSwlTon', label: '러그 허용 (ton)', step: '0.5', ph: '예: 15' },
            ].map(f => (
              <NumField key={f.key} label={f.label} step={f.step} placeholder={f.ph}
                value={lift?.[f.key] ?? ''} onChange={v => setLift({ [f.key]: v })} />
            ))}
          </OptionBlock>

          {/* 무게중심 포락선 (Stage 6) */}
          <OptionBlock
            label="무게중심 불확도 반영"
            checked={!!cogTol?.enabled}
            onToggle={v => setCogTol({ enabled: v })}
            hint="무게중심이 계산값에서 벗어날 수 있는 범위(±mm)입니다. 이 범위의 최악 지점에서 전도를 판정합니다. 모델에 없는 의장품(배관·트레이·보온·도장)이 많을수록 크게 잡으세요."
          >
            {[
              { key: 'x', label: '± X (mm)', ph: suggestion ? String(suggestion.x) : '예: 300' },
              { key: 'y', label: '± Y (mm)', ph: suggestion ? String(suggestion.y) : '예: 300' },
              { key: 'z', label: '± Z (mm)', ph: suggestion ? String(suggestion.z) : '예: 150' },
            ].map(f => (
              <NumField key={f.key} label={f.label} step="10" placeholder={f.ph}
                value={cogTol?.[f.key] ?? ''} onChange={v => setCogTol({ [f.key]: v })} />
            ))}
            {suggestion && (
              <button
                type="button"
                onClick={() => setCogTol({ ...suggestion })}
                style={{
                  alignSelf: 'flex-start', marginTop: 2,
                  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  background: 'rgba(0,209,255,0.12)', border: '1px solid rgba(0,209,255,0.4)',
                  color: '#8fe4ff', fontSize: 10, fontWeight: 700,
                }}>
                모델 치수의 2%로 채우기 ({suggestion.x} / {suggestion.y} / {suggestion.z})
              </button>
            )}
          </OptionBlock>
        </div>
      )}
    </div>
  )
}

function OptionBlock({ label, checked, onToggle, hint, children }) {
  return (
    <div style={{
      border: `1px solid ${checked ? 'rgba(0,209,255,0.35)' : '#2a2a4a'}`,
      borderRadius: 7, padding: '8px 10px',
      background: checked ? 'rgba(0,209,255,0.05)' : 'transparent',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onToggle(e.target.checked)}
          style={{ accentColor: '#00D1FF', width: 13, height: 13, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, fontWeight: 800, color: checked ? '#8fe4ff' : '#cad8e8', letterSpacing: 0.2 }}>
          {label}
        </span>
      </label>
      {checked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 9.5, color: '#8aa0b8', lineHeight: 1.5 }}>{hint}</div>
          {children}
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange, step, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#cad8e8' }}>{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: 82, padding: '4px 6px', borderRadius: 4,
          background: '#0c0c1c', border: '1px solid #2a2a4a',
          color: '#e8f4ff', fontSize: 11, textAlign: 'right', outline: 'none',
        }}
      />
    </div>
  )
}
