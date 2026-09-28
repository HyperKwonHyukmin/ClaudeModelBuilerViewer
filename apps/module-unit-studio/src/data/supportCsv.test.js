import { describe, it, expect } from 'vitest'
import { StageData } from './StageData.js'
import { buildSupportCsv, buildSupportCsvFileName, CSV_HEADER } from './supportCsv.js'

// 기준 출력 `3370_M04_csv.csv` 의 첫 두 행에 쓰인 실제 좌표를 그대로 노드로 만든다.
const stage = (extra = []) => new StageData({
  meta: {},
  nodes: [
    { id: 1, x: 124925, y: 6245, z: 35488 },
    { id: 2, x: 126957, y: 4030, z: 35536 },
    { id: 3, x: 128040, y: 4030, z: 35536 },
    { id: 4, x: 129175, y: 5250, z: 35510 },
    // 수직 부재용 — dz 가 지배적이라 orientation 이 [1,0,0] 이어야 한다.
    { id: 5, x: 100000, y: 0, z: 0 },
    { id: 6, x: 100000, y: 0, z: 3000 },
    ...extra,
  ],
  elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
  connectivity: null, healthMetrics: null,
})

const sb = (startNode, endNode, sectionId) => ({
  id: `sb-${startNode}-${endNode}`, kind: 'addSupportBeam',
  params: { startNode, endNode, sectionId, sectionKind: 'L', dims: null },
  validation: { status: 'ok' },
})

describe('buildSupportCsv', () => {
  it('헤더 + 행 서식이 기준 출력(3370_M04_csv.csv)과 같다', () => {
    const { csv, rowCount, skipped } = buildSupportCsv(stage(), [
      sb(1, 2, 'ANG_100x100x10'),
    ])
    expect(rowCount).toBe(1)
    expect(skipped).toBe(0)

    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(CSV_HEADER.join(','))
    // 기준 파일 2행: 좌표·size·division 이 글자까지 같아야 한다.
    expect(lines[1]).toBe(
      ' =30137/384565,SCTN,X 124925mm Y 6245mm Z 35488mm,X 124925mm Y 6245mm Z 35488mm,' +
      'X 126957mm Y 4030mm Z 35536mm,ANG_100x100x10,0.0308360511306552,' +
      '   0.000   0.000   1.000,SUPP,'
    )
    // pandas.to_csv 와 동일하게 CRLF + 마지막 줄 개행
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(lines[2]).toBe('')
  })

  it('단면별로 size 열이 달라진다', () => {
    const { csv } = buildSupportCsv(stage(), [
      sb(1, 2, 'ANG_100x100x10'),
      sb(2, 3, 'ANG_100x100x13'),
      sb(3, 4, 'ANG_130x130x12'),
    ])
    const sizes = csv.trim().split('\r\n').slice(1).map(l => l.split(',')[5])
    expect(sizes).toEqual(['ANG_100x100x10', 'ANG_100x100x13', 'ANG_130x130x12'])
  })

  it('sectionId 가 없는 구(舊) intent 는 기본 단면(ANG_100x100x10)으로 나온다', () => {
    const legacy = {
      id: 'old', kind: 'addSupportBeam',
      params: { startNode: 1, endNode: 2, sectionKind: 'L', dims: [100, 100, 10, 10] },
      validation: { status: 'ok' },
    }
    const { csv } = buildSupportCsv(stage(), [legacy])
    expect(csv.trim().split('\r\n')[1].split(',')[5]).toBe('ANG_100x100x10')
  })

  it('수직 부재의 기준벡터는 퇴화하지 않는다(BDF orientation 과 같은 기준)', () => {
    // BdfToCsv.py 는 ori 를 0,0,1 로 고정하지만 수직 부재에서는 축과 평행해 Nastran 이 FATAL 이다.
    const { csv } = buildSupportCsv(stage(), [sb(5, 6, 'ANG_100x100x10')])
    expect(csv.trim().split('\r\n')[1].split(',')[7]).toBe('   1.000   0.000   0.000')
  })

  it('노드가 사라진 가서포트는 건너뛰고 건수로 보고한다', () => {
    const { rowCount, skipped } = buildSupportCsv(stage(), [
      sb(1, 2, 'ANG_100x100x10'),
      sb(1, 999, 'ANG_100x100x10'),
    ])
    expect(rowCount).toBe(1)
    expect(skipped).toBe(1)
  })

  it('가서포트가 없으면 헤더만 남는다', () => {
    const { csv, rowCount } = buildSupportCsv(stage(), [
      { id: 'x', kind: 'deleteGroup', params: { groupId: 1 }, validation: { status: 'ok' } },
    ])
    expect(rowCount).toBe(0)
    expect(csv).toBe(`${CSV_HEADER.join(',')}\r\n`)
  })
})

describe('buildSupportCsvFileName', () => {
  it('원본 파일명 기반', () => {
    expect(buildSupportCsvFileName({ sourceFileName: '05_RigidPostProc.json' }))
      .toBe('05_RigidPostProc_support.csv')
  })
  it('원본이 없으면 phase/타임스탬프 기반', () => {
    expect(buildSupportCsvFileName({ meta: { phase: '05' } }, () => 'TS'))
      .toBe('support_05_TS.csv')
  })
})
