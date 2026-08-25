import { useState } from 'react'
import {
  Save,
  FileDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
} from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'

/**
 * SavePanel — 상단 메뉴바 'Save' 모드의 좌측 도크 본문.
 *
 * 현재 모델(편집: 회전·유체비우기·삭제·가서포트·RBE 반영)을 Nastran BDF 로 출력한다.
 * 가서포트(wire) 설치 여부와 무관하게 항상 "현재 화면의 최종 모델" 을 저장한다.
 *
 * 실제 BDF 생성은 백엔드 convert_json_to_bdf(해석 파이프라인과 동일 라이터)가 수행한다.
 * useEditStore.exportEditedBdf() → host.exportUnitBdf(업로드+변환+다운로드+Save-As).
 * WorkBench 앱(브리지) 미지원 환경에서는 버튼이 안내 메시지를 표시한다.
 *
 * 폭 301 고정(AnalyzePanel 과 동일), background '#0b0b1e'.
 */
export default function SavePanel() {
  // 안정적 참조만 구독하고 본문에서 파생값 계산(Zustand v5 무한 렌더 루프 회피).
  const intents = useEditStore(s => s.intents)
  const exportEditedBdf = useEditStore(s => s.exportEditedBdf)
  const stageCount = useStageStore(s => s.stages?.length ?? 0)
  // 회전 적용 여부는 intent 유무가 아니라 실제 회전 상태(useStageStore.modelRotated)로 판정한다 —
  // rotateModel intent 는 provenance 전용이라, intent 만 지워도 좌표는 회전된 채 남기 때문.
  const modelRotated = useStageStore(s => s.modelRotated)

  const supportCount  = intents.filter(i => i.kind === 'addSupportBeam').length
  const addRigidCount = intents.filter(i => i.kind === 'addRigid').length
  const deleteCount   = intents.filter(i => i.kind?.startsWith('delete')).length
  const rotated       = modelRotated
  const fluidEmptied  = intents.some(i => i.kind === 'emptyPipeFluid')
  const hasEdits = supportCount + addRigidCount + deleteCount > 0 || rotated || fluidEmptied

  const [status, setStatus] = useState({ phase: 'idle', message: '', stats: null })
  const saving = status.phase === 'saving'
  const modelLoaded = stageCount > 0

  const onSave = async () => {
    setStatus({ phase: 'saving', message: 'BDF 생성 중...', stats: null })
    try {
      const r = await exportEditedBdf()
      if (r?.ok) {
        setStatus({ phase: 'ok', message: r.savedPath ?? '저장 완료', stats: r.stats ?? null })
      } else if (r?.canceled) {
        setStatus({ phase: 'idle', message: '', stats: null })
      } else {
        setStatus({ phase: 'error', message: r?.error ?? '저장 실패', stats: null })
      }
    } catch (e) {
      // exportEditedBdf 가 throw 하면 'saving' 에 고착돼 버튼이 영구 disabled 되는 것을 방지.
      setStatus({ phase: 'error', message: e?.message ?? String(e), stats: null })
    }
  }

  return (
    <div style={{
      width: 301,
      flexShrink: 0,
      position: 'relative',
      background: '#0b0b1e',
      borderRight: '1px solid #1e1e38',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* ── 헤더 ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '12px 10px 10px',
        borderBottom: '1px solid #1e1e38',
      }}>
        <Save size={15} color="#6ee7b7" />
        <span style={{ fontSize: 12, fontWeight: 900, color: '#e6f1ff', letterSpacing: 0.5 }}>
          저장 (Save)
        </span>
      </div>

      {/* ── 섹션: 편집 요약 ───────────────────────────── */}
      <Section label="편집 요약 (출력에 반영됨)">
        {hasEdits ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <SummaryRow label="가서포트(보강)" value={`${supportCount}개`} on={supportCount > 0} />
            <SummaryRow label="추가 RBE" value={`${addRigidCount}개`} on={addRigidCount > 0} />
            <SummaryRow label="삭제(그룹·요소 등)" value={`${deleteCount}건`} on={deleteCount > 0} />
            <SummaryRow label="회전 적용" value={rotated ? '예' : '아니오'} on={rotated} />
            <SummaryRow label="유체 비우기" value={fluidEmptied ? '예' : '아니오'} on={fluidEmptied} />
          </div>
        ) : (
          <Hint>편집 없음 — 현재 원본 모델을 그대로 BDF 로 출력합니다.</Hint>
        )}
      </Section>

      {/* ── 섹션: BDF 출력 ────────────────────────────── */}
      <Section label="Nastran BDF 출력">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !modelLoaded}
          title={modelLoaded
            ? '편집이 반영된 현재 모델을 Nastran BDF 로 저장합니다 (저장 위치 선택).'
            : '모델을 먼저 로드하세요.'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            width: '100%', padding: '9px 10px', borderRadius: 6,
            fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
            cursor: (saving || !modelLoaded) ? 'not-allowed' : 'pointer',
            background: (saving || !modelLoaded)
              ? '#0f0f1e'
              : 'linear-gradient(180deg, #6ee7b7 0%, #2dd4bf 100%)',
            color: (saving || !modelLoaded) ? '#5a5a80' : '#04241c',
            border: `1px solid ${(saving || !modelLoaded) ? '#2a2a40' : '#2DD4BF'}`,
            transition: 'all 0.15s ease',
          }}
        >
          {saving
            ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
            : <FileDown size={14} />}
          {saving ? 'BDF 생성 중...' : 'Nastran BDF로 저장'}
        </button>

        {/* 성공 */}
        {status.phase === 'ok' && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 5,
            padding: '7px 9px',
            background: 'rgba(55,224,138,0.08)',
            border: '1px solid rgba(55,224,138,0.40)',
            borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#37E08A', fontSize: 11, fontWeight: 800 }}>
              <CheckCircle2 size={13} /> 저장 완료
            </div>
            <div style={{ fontSize: 10, color: '#9fc7b6', lineHeight: 1.5, wordBreak: 'break-all' }}>
              {status.message}
            </div>
            {status.stats && (
              <div style={{ fontSize: 10, color: '#7a9a8c', lineHeight: 1.5 }}>
                GRID {status.stats.gridCount ?? 0} · BEAM {status.stats.beamCount ?? 0} · RBE2 {status.stats.rbe2Count ?? 0} · CONM2 {status.stats.conm2Count ?? 0}
              </div>
            )}
          </div>
        )}

        {/* 실패 */}
        {status.phase === 'error' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            fontSize: 10, color: '#FFB3BC', lineHeight: 1.5,
            background: 'rgba(255,85,102,0.08)',
            border: '1px solid rgba(255,85,102,0.40)',
            borderRadius: 6, padding: '6px 8px',
          }}>
            <XCircle size={13} color="#FF5566" style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong style={{ color: '#FF5566' }}>저장 실패</strong> · {status.message}</span>
          </div>
        )}

        <Hint>
          편집(회전·유체비우기·삭제·가서포트·RBE)이 반영된 최종 모델을 백엔드 라이터로 BDF 생성해
          저장합니다. 구조해석에 쓰는 BDF 와 동일한 양식입니다.
        </Hint>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, paddingLeft: 2 }}>
          <Info size={11} color="#60708a" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 10, color: '#8aa0b8', lineHeight: 1.5 }}>
            BDF 출력은 WorkBench 앱 환경에서 동작합니다. 버튼이 "WorkBench 앱 업데이트" 안내를
            표시하면 앱을 최신 버전으로 갱신하세요.
          </span>
        </div>
      </Section>
    </div>
  )
}

// ── 공통 프리미티브 (AnalyzePanel 스타일과 동일) ───────────────────────────

function Section({ label, children }) {
  return (
    <div style={{
      padding: '11px 8px 12px',
      borderBottom: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{
        fontSize: 10, color: '#7ab2d4', letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 800,
        marginBottom: 1, paddingLeft: 2,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function SummaryRow({ label, value, on }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ fontSize: 10.5, color: '#7a8aaa', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: on ? '#5eead4' : '#5a6a82', fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function Hint({ children }) {
  return (
    <div style={{ fontSize: 10, color: '#8aa0b8', lineHeight: 1.5, paddingLeft: 2 }}>
      {children}
    </div>
  )
}
