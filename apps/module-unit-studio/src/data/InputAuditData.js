/**
 * Wraps a parsed 00_InputAudit.json — pipeline-side CSV-input audit.
 *
 * 입력 JSON 구조:
 *   meta          { schemaVersion, timestamp, unit, purpose }
 *   inputFiles[]  { kind, path, exists, header[], physicalLineCount, dataRowCount, blankDataRowCount }
 *   summary       { totalDataRows, convertedRows, ignoredRows, parseFailedRows, blankRows,
 *                   ambiguousDuplicateSourceNameRows, ignoredByReason }
 *   rowAudit[]    { kind, file, physicalLineNumber, dataRowNumber, name, status, reasonCode,
 *                   reason, mappingConfidence, rawLine, rawFields }
 *
 * 핵심 사용처:
 *   - sourceName(=CSV name) 으로 stage element/pointMass 와 조인 (3D 하이라이트)
 *   - ignored 행은 위치 좌표(rawFields.pos)만 있고 stage entity 는 없으므로 ghost 마커용
 */
export class InputAuditData {
  constructor(json) {
    this.meta       = json?.meta       ?? {}
    this.inputFiles = json?.inputFiles ?? []
    this.summary    = json?.summary    ?? {}
    this.rowAudit   = json?.rowAudit   ?? []

    // 같은 sourceName 을 가진 행을 한 번에 찾기 위한 인덱스 (ambiguous 검출 + 클릭 매핑)
    this._byName = new Map()
    for (const r of this.rowAudit) {
      if (!r.name) continue
      let arr = this._byName.get(r.name)
      if (!arr) { arr = []; this._byName.set(r.name, arr) }
      arr.push(r)
    }
  }

  /** 동일 name 으로 등록된 모든 행을 반환 (없으면 []). */
  rowsByName(name) {
    return this._byName.get(name) ?? []
  }

  /**
   * "X 94305mm Y 3385mm Z 34943mm" 형식의 좌표 문자열을 파싱.
   * 잘못된 입력이면 null. CSV 로더가 사용하는 동일한 토큰 규칙을 따름.
   */
  static parsePosition(text) {
    if (!text || typeof text !== 'string') return null
    const m = text.match(/X\s*(-?[\d.]+)mm.*?Y\s*(-?[\d.]+)mm.*?Z\s*(-?[\d.]+)mm/i)
    if (!m) return null
    const x = parseFloat(m[1])
    const y = parseFloat(m[2])
    const z = parseFloat(m[3])
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
    return { x, y, z }
  }
}

/** 스테이지 JSON 인지 여부 (nodes/elements 배열 기반)를 판별하는 fileLoader 헬퍼와 짝. */
export function isInputAuditJson(json) {
  return Array.isArray(json?.rowAudit) && json?.summary != null
}
