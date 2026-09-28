import { describe, it, expect } from 'vitest'

import {
  deriveIds, initialReportForm, isPositiveNumber, isReportFormValid, toReportOptions, REPORT_DEFAULTS,
  EXTRA_NOTICE_MAX,
} from './unitLiftingReportForm.js'

describe('unitLiftingReportForm', () => {
  it('파일명의 호선-유닛 패턴을 뽑는다', () => {
    expect(deriveIds('3496-35210-A508372_20260108_edit.bdf')).toEqual({ hullNo: '3496', unitNo: '35210' })
    expect(deriveIds('3496_35210_x.json')).toEqual({ hullNo: '3496', unitNo: '35210' })
  })

  it('패턴이 없거나 자릿수가 다르면 빈 문자열', () => {
    expect(deriveIds('foo.bdf')).toEqual({ hullNo: '', unitNo: '' })
    expect(deriveIds('12345-35210.bdf')).toEqual({ hullNo: '', unitNo: '' })
    expect(deriveIds(undefined)).toEqual({ hullNo: '', unitNo: '' })
  })

  it('초기 폼은 파일명·작성자를 선입력하고 기본값을 채운다', () => {
    const f = initialReportForm('3496-35210-x.bdf', 'A476854')
    expect(f.hullNo).toBe('3496')
    expect(f.unitNo).toBe('35210')
    expect(f.author).toBe('A476854')
    expect(f.revision).toBe('0')
    expect(f.jigLimitTon).toBe(REPORT_DEFAULTS.jigLimitTon)
    expect(f.yieldStrengthMpa).toBe(REPORT_DEFAULTS.yieldStrengthMpa)
  })

  it('0·음수·빈값·문자는 양수가 아니다', () => {
    expect(isPositiveNumber('6.2')).toBe(true)
    expect(isPositiveNumber('0')).toBe(false)
    expect(isPositiveNumber('-1')).toBe(false)
    expect(isPositiveNumber('')).toBe(false)
    expect(isPositiveNumber('abc')).toBe(false)
  })

  it('지그 기준·항복강도만 필수다', () => {
    expect(isReportFormValid(initialReportForm('', ''))).toBe(true)
    expect(isReportFormValid({ ...initialReportForm('', ''), jigLimitTon: '0' })).toBe(false)
    expect(isReportFormValid({ ...initialReportForm('', ''), yieldStrengthMpa: '' })).toBe(false)
  })

  it('options 로 바꿀 때 숫자 변환·trim·리비전 기본값을 적용한다', () => {
    expect(toReportOptions({
      hullNo: ' 3496 ', unitNo: '35210', drawingNo: ' D-1 ', revision: '  ', author: ' A1 ',
      department: ' 구조 ', jigLimitTon: '5', yieldStrengthMpa: '355', notes: ' 비고 ',
      extraNotice: ' 추가 문구 ',
    })).toEqual({
      hullNo: '3496', unitNo: '35210', drawingNo: 'D-1', revision: '0', author: 'A1',
      department: '구조', jigLimitTon: 5, yieldStrengthMpa: 355, notes: '비고',
      extraNotice: '추가 문구',
    })
  })

  it('주의 사항 추가 문구는 서식 박스 폭에 맞춰 잘린다', () => {
    // 입력란 maxLength 를 우회해 붙여넣기로 긴 글이 들어와도 서식을 넘지 않게 한다.
    expect(toReportOptions({ jigLimitTon: 6.2, yieldStrengthMpa: 275, extraNotice: '가'.repeat(60) })
      .extraNotice).toHaveLength(EXTRA_NOTICE_MAX)
    expect(initialReportForm().extraNotice).toBe('')
  })
})
