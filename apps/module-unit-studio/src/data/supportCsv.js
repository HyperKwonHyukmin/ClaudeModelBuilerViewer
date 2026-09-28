import { resolveSupportSection } from './supportSections.js'

/**
 * 가서포트(보강) 목록을 사내 구조 CSV 서식으로 내보낸다.
 *
 * 기준 구현은 HiTessCloud 의 `PythonModule/BdfToCsv.py` — BDF 를 읽어 PID 1000(가서포트)
 * CBEAM 만 골라 CSV 한 줄씩 쓰는 서버 도구다. 출력 예시는 `3370_M04_csv.csv`.
 * 여기서는 BDF 를 거치지 않고 편집 의도(addSupportBeam)에서 바로 만든다 —
 * 같은 정보를 이미 스튜디오가 들고 있어 왕복이 필요 없다.
 *
 * ── 열 규약 (ModelBuilder `Cmb.Io.Csv.StructureCsv` 와 1:1) ────────────────
 *   name      부재 이름(라벨). 엔진은 sourceName 으로만 쓴다.
 *   type      'SCTN' 고정 (형강 부재)
 *   pos/poss  시작점, pose 끝점 — 'X ..mm Y ..mm Z ..mm'
 *   size      'ANG_<w>x<h>x<t>' — 엔진이 여기서 단면 종류·치수를 파싱한다(유일한 필수 단면 정보)
 *   stru      상위 구조 참조. 엔진은 읽지 않는다(StructureCsv.ParentStru 상수만 존재).
 *   ori       국부축 기준벡터 3개 (%8.3f)
 *   division  'SUPP'
 *   weld      빈 값
 *
 * ⚠ `name` 과 `stru` 는 BdfToCsv.py 가 예시 CAD 참조를 그대로 박아 둔 값이라 여기서도
 * 같은 상수를 쓴다(출력 파일 서식 일치). 엔진이 둘 다 판정에 쓰지 않으므로 무해하다.
 */

/** BdfToCsv.py 가 모든 행에 고정으로 쓰는 CAD 참조 placeholder. */
export const CSV_NAME_PLACEHOLDER = ' =30137/384565'
export const CSV_PARENT_STRU_PLACEHOLDER = '0.0308360511306552'
export const CSV_HEADER = ['name', 'type', 'pos', 'poss', 'pose', 'size', 'stru', 'ori', 'division', 'weld']

/** 'X 124925mm Y 6245mm Z 35488mm' — 원본 mm 좌표(정수 반올림). */
function formatPos(n) {
  return `X ${Math.round(n.x)}mm Y ${Math.round(n.y)}mm Z ${Math.round(n.z)}mm`
}

/** '   0.000   0.000   1.000' — 폭 8 · 소수 3자리. -0 은 0 으로 눕힌다. */
function formatOri(v) {
  return v.map(c => {
    const r = Math.abs(c) < 5e-4 ? 0 : c
    return r.toFixed(3).padStart(8, ' ')
  }).join('')
}

/**
 * 방향(기준) 벡터 — 부재축과 평행하지 않은 축 단위벡터를 고른다.
 *
 * ori 는 "부재축에 수직인 벡터"가 아니라 국부 y축을 잡기 위한 **기준 벡터**다(엔진·Nastran 이
 * 부재축 성분을 빼고 직교화한다). 그래서 사내 CAD CSV 도, BdfToCsv.py 도 축 단위벡터
 * ('0 0 1' / '1 0 0')를 그대로 쓴다 — 여기서도 같은 규칙이라 기준 출력과 글자까지 일치한다.
 *
 * ⚠ 다만 '0 0 1' 고정은 **수직 부재에서 축과 평행**해져 퇴화한다(Nastran G0/오리엔테이션 FATAL).
 * 그래서 `applyEditedModel.computeSupportOrientation` 과 같은 기준(|dz|>0.9)으로 [1,0,0] 으로
 * 갈아탄다 — 직교화 전 기준 벡터가 같으므로 CSV 와 BDF 가 같은 국부 좌표계를 가리킨다.
 */
function orientationOf(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const len = Math.hypot(dx, dy, dz) || 1
  return Math.abs(dz / len) > 0.9 ? [1, 0, 0] : [0, 0, 1]
}

/**
 * 가서포트 intent 들을 CSV 텍스트로 만든다.
 *
 * 노드 좌표는 `stageData.nodeMap`(원본 mm)에서 읽는다 — 모델 회전(rotateModel)은 이미
 * StageData 에 반영돼 있으므로 CSV 도 현재 화면·BDF 와 같은 좌표계다.
 *
 * @param {import('./StageData.js').StageData} stageData
 * @param {object[]} intents  전체 intent 목록 (addSupportBeam 만 골라 쓴다)
 * @returns {{ csv: string, rowCount: number, skipped: number }}
 */
export function buildSupportCsv(stageData, intents) {
  const rows = []
  let skipped = 0

  for (const intent of intents ?? []) {
    if (intent?.kind !== 'addSupportBeam') continue
    const { startNode, endNode } = intent.params ?? {}
    const a = stageData?.nodeMap?.get?.(startNode)
    const b = stageData?.nodeMap?.get?.(endNode)
    if (!a || !b) { skipped++; continue }   // 노드가 삭제된 경우 — 조용히 건너뛰고 건수만 보고
    const section = resolveSupportSection(intent.params)
    const poss = formatPos(a)
    rows.push([
      CSV_NAME_PLACEHOLDER,
      'SCTN',
      poss,          // pos — BdfToCsv.py 와 동일하게 시작점과 같은 값
      poss,          // poss
      formatPos(b),  // pose
      section.csvSize,
      CSV_PARENT_STRU_PLACEHOLDER,
      formatOri(orientationOf(a, b)),
      'SUPP',
      '',
    ])
  }

  // pandas.to_csv 산출물과 동일하게 CRLF + 마지막 줄 개행까지 붙인다.
  const lines = [CSV_HEADER.join(','), ...rows.map(r => r.join(','))]
  return { csv: lines.join('\r\n') + '\r\n', rowCount: rows.length, skipped }
}

/**
 * `<원본파일명>_support.csv`. sourceFileName 이 없으면 phase/타임스탬프 기반.
 */
export function buildSupportCsvFileName(stage, formatTimestamp) {
  const src = stage?.sourceFileName
  if (src) return `${src.replace(/\.json$/i, '')}_support.csv`
  const phase = stage?.meta?.phase ?? 'X'
  const ts = formatTimestamp ? formatTimestamp(new Date()) : Date.now()
  return `support_${phase}_${ts}.csv`
}
