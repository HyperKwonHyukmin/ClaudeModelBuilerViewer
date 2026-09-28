import { useEffect, useState } from 'react'
import { X, FileSpreadsheet, FileType2 } from 'lucide-react'
import {
  EXTRA_NOTICE_MAX, initialReportForm, isPositiveNumber, isReportFormValid, toReportOptions,
} from '../utils/unitLiftingReportForm.js'

const FIELDS = [
  ['hullNo', '호선 (HULL NO.)', 'text'],
  ['unitNo', '유닛 (UNIT NO.)', 'text'],
  ['drawingNo', '도면 번호', 'text'],
  ['revision', '리비전', 'text'],
  ['author', '작성자', 'text'],
  ['department', '부서', 'text'],
  ['jigLimitTon', '지그 기준 (ton)', 'number'],
  ['yieldStrengthMpa', '항복강도 (MPa)', 'number'],
]

// 출력 형식. PDF 는 백엔드가 만든 xlsx 를 서버 Excel 로 인쇄해 변환한다(라우터 format=pdf).
// 배포용은 PDF 가 기본 — 서식이 고정되어 받는 사람 환경에 따라 달라지지 않는다.
// 표 수치를 복사하거나 손봐야 할 때만 xlsx 를 고른다.
const FORMATS = [
  ['pdf',  'PDF',        FileType2,        '서식 고정 · 배포용'],
  ['xlsx', 'Excel(xlsx)', FileSpreadsheet, '수치 복사 · 편집용'],
]

const inputStyle = {
  background: '#0f0f1e', border: '1px solid #2a2a40', borderRadius: 6, color: '#e6e9f2',
  padding: '6px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box',
}

/**
 * 보고서 표지 정보 입력 — WorkBench 의 UnitLiftingReportDialog 와 같은 필드(백엔드 options 키 동일).
 * props: sourceFileName, defaultAuthor, onClose(), onSubmit(options, format)
 */
export default function UnitStructuralReportDialog({ kind = 'result', sourceFileName = '', defaultAuthor = '', onClose, onSubmit }) {
  const [form, setForm] = useState(() => initialReportForm(sourceFileName, defaultAuthor))
  const [format, setFormat] = useState('pdf')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = isReportFormValid(form)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const extraLen = [...String(form.extraNotice ?? '')].length   // 서로게이트 쌍을 1자로 센다

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: '92vw', background: '#0d0d22',
          border: '1px solid rgba(55,224,138,0.45)', borderRadius: 8, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            fontSize: 12, fontWeight: 800, color: '#65F0A2', letterSpacing: 1.2,
            textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <FileSpreadsheet size={13} /> {kind === 'detail' ? '상세 레포트' : '결과 레포트 (사내 표준 서식)'}
          </div>
          <button
            type="button" onClick={onClose} aria-label="닫기"
            style={{ background: 'none', border: 'none', color: '#9fb4cc', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {FIELDS.map(([key, label, type]) => {
            const invalid = type === 'number' && !isPositiveNumber(form[key])
            return (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#9fb4cc', fontWeight: 700 }}>
                {label}
                <input
                  aria-label={label} type={type} step="any" value={form[key]} onChange={set(key)}
                  style={{ ...inputStyle, borderColor: invalid ? '#FF5566' : '#2a2a40' }}
                />
              </label>
            )
          })}
          {kind !== 'detail' && (
            // 사내 표준 서식의 '주의 사항' 5행. 4행까지는 고정 문구이고 이 한 줄만 사용자가 적는다.
            // 입력이 없으면 백엔드가 그 줄을 감춰 4줄짜리 박스로 인쇄한다.
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#9fb4cc', fontWeight: 700 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>주의 사항 문구 추가 (선택)</span>
                <span style={{ color: extraLen > EXTRA_NOTICE_MAX * 0.9 ? '#FFC24B' : '#6a7a98', fontWeight: 600 }}>
                  {extraLen} / {EXTRA_NOTICE_MAX}자
                </span>
              </span>
              <input
                aria-label="주의 사항 문구 추가" type="text" maxLength={EXTRA_NOTICE_MAX}
                placeholder="비워 두면 4줄로 인쇄됩니다"
                value={form.extraNotice} onChange={set('extraNotice')}
                style={inputStyle}
              />
            </label>
          )}
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#9fb4cc', fontWeight: 700 }}>
            비고
            <textarea
              aria-label="비고" rows={2} value={form.notes} onChange={set('notes')}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10.5, color: '#9fb4cc', fontWeight: 700 }}>출력 형식</div>
          <div role="radiogroup" aria-label="출력 형식" style={{ display: 'flex', gap: 6 }}>
            {FORMATS.map(([value, label, Icon, hint]) => {
              const on = format === value
              return (
                <button
                  key={value} type="button" role="radio" aria-checked={on} aria-label={label}
                  onClick={() => setFormat(value)}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '7px 8px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${on ? 'rgba(55,224,138,0.55)' : '#2a2a40'}`,
                    background: on ? 'rgba(55,224,138,0.12)' : '#0f0f1e',
                    color: on ? '#65F0A2' : '#9fb4cc',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800 }}>
                    <Icon size={13} /> {label}
                  </span>
                  <span style={{ fontSize: 9.5, color: on ? '#8fd0c0' : '#6a7a98', fontWeight: 600 }}>{hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ fontSize: 10, color: '#7a8aaa', lineHeight: 1.5 }}>
          호선·유닛은 파일명에서 자동 추출됩니다. 허용응력 = 항복강도 × 0.8, 지그 기준은 와이어 장력(ton) 판정에 씁니다.
          그림은 백엔드가 3D 로 그리므로 화면 상태와 무관합니다.
          {kind === 'detail' ? ' 상세 레포트는 다장 기술문서입니다.' : ' 결과 레포트는 사내 표준 서식 2~3페이지입니다.'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '7px 12px', borderRadius: 6, border: '1px solid #2a2a40', background: 'transparent',
              color: '#9fb4cc', fontSize: 11.5, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button" disabled={!valid}
            onClick={() => { if (valid) onSubmit?.(toReportOptions(form), format) }}
            style={{
              padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(55,224,138,0.55)',
              background: valid ? 'rgba(55,224,138,0.15)' : '#0f0f1e', color: valid ? '#65F0A2' : '#5a5a80',
              fontSize: 11.5, fontWeight: 800, cursor: valid ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <FileSpreadsheet size={13} /> {format === 'pdf' ? 'PDF 생성' : 'Excel 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
