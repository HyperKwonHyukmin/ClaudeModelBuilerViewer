import { useState } from 'react'
import { Wrench, Trash2, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { SUPPORT_SECTIONS, supportSectionLabel } from '../data/supportSections.js'

/**
 * 가서포트(보강) 추가 — Edit 탭 좌측 패널의 편집 도구.
 *
 * 단면을 고르고 버튼을 켜면 픽 모드가 되고, 3D 뷰에서 Shift + Node 2개를 고르면 두 노드를 잇는
 * 보강재(addSupportBeam intent → CBEAM + PBEAML L)가 설치된다. 단면은 설치 시점 값이
 * intent 에 박히므로 부재마다 다른 규격을 섞어 쓸 수 있다.
 * 픽 모드 게이트는 `ViewportContainer` 의 `supportPickEnabled`(Edit 탭에서만 true).
 *
 * 다른 편집과 달리 가서포트는 자세안정성 결과를 무효화하지 않는다
 * (`useEditStore.STABILITY_PRESERVING_KINDS`) — 구조 보강이라 자세는 그대로다.
 * 재해석은 Analyze 탭의 "구조 해석 실행" 에서 한다.
 *
 * CSV 내보내기는 사내 구조 CSV 서식(HiTessCloud `BdfToCsv.py` 와 같은 열)으로 저장한다.
 */
export default function SupportBeamSection() {
  const supportPickActive = useEditStore(s => s.supportPickActive)
  const toggleSupportPick = useEditStore(s => s.toggleSupportPick)
  const removeSupportBeam = useEditStore(s => s.removeSupportBeam)
  const supportSectionId = useEditStore(s => s.supportSectionId)
  const setSupportSectionId = useEditStore(s => s.setSupportSectionId)
  const exportSupportCsv = useEditStore(s => s.exportSupportCsv)
  // ⚠️ 셀렉터에서 .filter() 로 새 배열을 반환하면 Zustand v5 가 매 렌더마다 다른 참조로 보고
  // 무한 렌더 루프에 빠진다(패널 크래시 → 빈 화면). 안정적인 intents 참조만 구독하고 본문에서 필터링.
  const intents = useEditStore(s => s.intents)
  const supportBeams = intents.filter(i => i.kind === 'addSupportBeam')

  const [csv, setCsv] = useState({ phase: 'idle', message: '' })

  const onExportCsv = async () => {
    setCsv({ phase: 'saving', message: '' })
    try {
      const r = await exportSupportCsv()
      if (r?.ok) {
        // 'picker'(파일 선택 대화상자)·'download'(Electron 저장 대화상자) 모두 사용자가 위치를 고른다.
        const skipped = r.skipped > 0 ? ` · 노드 삭제로 제외 ${r.skipped}건` : ''
        setCsv({ phase: 'ok', message: `${r.fileName} · ${r.rowCount}행${skipped}` })
      } else if (r?.error === '취소되었습니다') {
        setCsv({ phase: 'idle', message: '' })
      } else {
        setCsv({ phase: 'error', message: r?.error ?? 'CSV 저장 실패' })
      }
    } catch (e) {
      setCsv({ phase: 'error', message: e?.message ?? String(e) })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10, color: '#5eead4', letterSpacing: 1.2,
        textTransform: 'uppercase', fontWeight: 800, paddingLeft: 2,
      }}>
        <span>가서포트(보강)</span>
        {supportBeams.length > 0 && (
          <span style={{ fontSize: 10, color: '#9a9ad0', letterSpacing: 0.5, textTransform: 'none' }}>
            {supportBeams.length} 개
          </span>
        )}
      </div>

      {/* 단면 선택 — 사내 CSV 에 실재하는 앵글 3종. 다음에 설치할 부재에만 적용된다. */}
      <div style={{ display: 'flex', gap: 4 }}>
        {SUPPORT_SECTIONS.map(sec => {
          const on = sec.id === supportSectionId
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setSupportSectionId(sec.id)}
              title={`${sec.csvSize} — PBEAML L ${sec.dims.join('/')}`}
              style={{
                flex: 1, padding: '5px 2px', borderRadius: 5, cursor: 'pointer',
                fontSize: 9.5, fontWeight: 800, letterSpacing: -0.2,
                background: on ? 'rgba(45,212,191,0.18)' : '#0f0f1e',
                color: on ? '#5eead4' : '#8a96ac',
                border: `1px solid ${on ? '#2DD4BF' : '#2a2a40'}`,
                transition: 'all 0.15s ease',
              }}
            >
              {sec.label.replace('L', '')}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={toggleSupportPick}
        title="버튼을 켠 뒤 3D 뷰에서 Shift + Node 2개를 클릭하면 선택한 단면의 보강재가 설치됩니다."
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', padding: '6px 9px', borderRadius: 5,
          fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, cursor: 'pointer',
          background: supportPickActive ? 'rgba(45,212,191,0.18)' : '#0f0f1e',
          color: supportPickActive ? '#5eead4' : '#ccd8e8',
          border: `1px solid ${supportPickActive ? '#2DD4BF' : '#2a2a40'}`,
          transition: 'all 0.15s ease',
        }}
      >
        <Wrench size={12} />
        {supportPickActive ? '설치 모드 — Shift+Node 2개' : '가서포트 추가'}
      </button>

      {supportPickActive && (
        <div style={{ fontSize: 10, color: '#7a8aaa', lineHeight: 1.45 }}>
          <strong style={{ color: '#bfe9d8' }}>Shift + Node 2개</strong>를 선택하면 두 노드를 잇는
          {' '}{supportSectionLabel({ sectionId: supportSectionId })} 보강재가 설치됩니다.
        </div>
      )}

      {supportBeams.map((sb) => (
        <div key={sb.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          padding: '4px 7px', background: 'rgba(45,212,191,0.08)',
          border: '1px solid rgba(45,212,191,0.35)', borderRadius: 5,
        }}>
          <span style={{ fontSize: 10, color: '#bfe9d8', fontWeight: 700 }}>
            {supportSectionLabel(sb.params)} · N{sb.params?.startNode}↔N{sb.params?.endNode}
          </span>
          <button
            type="button"
            onClick={() => removeSupportBeam(sb.id)}
            title="이 가서포트 제거"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
              background: 'transparent', border: '1px solid #2a2a4a', color: '#FF8090',
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}

      {supportBeams.length > 0 && (
        <>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={csv.phase === 'saving'}
            title="설치된 가서포트를 사내 구조 CSV 서식(name/type/pos/…/division)으로 저장합니다. 저장 위치를 묻는 창이 뜹니다."
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '6px 9px', borderRadius: 5,
              fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
              cursor: csv.phase === 'saving' ? 'progress' : 'pointer',
              background: '#0f0f1e', color: '#ccd8e8', border: '1px solid #2a2a40',
            }}
          >
            {csv.phase === 'saving'
              ? <Loader2 size={12} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
              : <FileSpreadsheet size={12} />}
            {csv.phase === 'saving' ? 'CSV 생성 중…' : `가서포트 CSV 내보내기 (${supportBeams.length}행)`}
          </button>
          {csv.phase !== 'idle' && csv.phase !== 'saving' && (
            <div style={{
              fontSize: 10, lineHeight: 1.45, wordBreak: 'break-all',
              color: csv.phase === 'ok' ? '#8fd0c0' : '#FF8090',
            }}>
              {csv.phase === 'ok' ? '저장 완료 · ' : '실패 · '}{csv.message}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#7a8aaa', lineHeight: 1.45 }}>
            보강 후 <strong style={{ color: '#8fd0c0' }}>Analyze</strong> 탭의 "구조 해석 실행" 을 누르면
            가서포트가 반영되어 재해석됩니다.
          </div>
        </>
      )}
    </div>
  )
}
