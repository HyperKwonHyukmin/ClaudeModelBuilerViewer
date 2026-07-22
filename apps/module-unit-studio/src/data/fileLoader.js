import { StageData } from './StageData.js'
import { InputAuditData, isInputAuditJson } from './InputAuditData.js'
import { StageSummaryData, isStageSummaryJson } from './StageSummaryData.js'
import { applyFinalGroupMapping } from './applyFinalGroupMapping.js'

/**
 * Extracts the leading integer from a filename like "01_SanityPreprocess.json".
 * Returns Infinity if no leading number found.
 * @param {string} filename
 * @returns {number}
 */
export function parseStageIndex(filename) {
  const match = filename.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : Infinity
}

/**
 * Returns a new array of file-like objects sorted by parseStageIndex ascending.
 * Does not mutate the input array.
 * @param {Array<{name: string}>} files
 * @returns {Array<{name: string}>}
 */
export function sortStageFiles(files) {
  return [...files].sort((a, b) => parseStageIndex(a.name) - parseStageIndex(b.name))
}

/**
 * Reads a File as text and parses JSON.
 * Returns null and logs a warning on parse failure.
 * @param {File} file
 * @returns {Promise<object|null>}
 */
async function readJsonFile(file) {
  try {
    const text = await file.text()
    return JSON.parse(text)
  } catch (err) {
    console.warn(`[fileLoader] Failed to parse ${file.name}:`, err)
    return null
  }
}

export function emptyLoadSummary() {
  return {
    total: 0,
    json: 0,
    loaded: 0,
    failed: 0,
    skipped: 0,
    failedFiles: [],
  }
}

// phase JSON인지 판별 — 인덱스/요약 파일(00_InputAudit, 00_StageSummary 등)은 nodes/elements 배열이 없음
function isPhaseStageJson(json) {
  return Array.isArray(json?.nodes) && Array.isArray(json?.elements)
}

/**
 * Loads multiple JSON files, sorts by filename number, and returns StageData[].
 * Files that fail to parse are skipped. 00_InputAudit.json 과 00_StageSummary.json 은
 * phase JSON 과 구분되어 별도 객체로 추출된다.
 *
 * @param {FileList | File[]} fileList
 * @returns {Promise<{
 *   stages: StageData[],
 *   inputAudit: InputAuditData|null,
 *   stageSummary: StageSummaryData|null,
 *   summary: ReturnType<typeof emptyLoadSummary>
 * }>}
 */
export async function loadFiles(fileList) {
  const allFiles = Array.from(fileList)
  const files = sortStageFiles(allFiles.filter(f => f.name.endsWith('.json')))
  const summary = {
    ...emptyLoadSummary(),
    total: allFiles.length,
    json: files.length,
    skipped: allFiles.length - files.length,
  }

  const jsons = await Promise.all(files.map(async (file) => ({
    file,
    json: await readJsonFile(file),
  })))

  const stages = []
  let inputAudit = null
  let stageSummary = null
  for (const { file, json } of jsons) {
    if (!json) {
      summary.failed++
      summary.failedFiles.push(file.name)
      continue
    }
    // JSON.parse 는 됐지만 생성자(StageData/InputAuditData/StageSummaryData)가 throw 하면
    // 해당 파일 하나 때문에 폴더 전체 로드가 중단되지 않도록, 그 파일만 실패 처리하고 계속한다.
    try {
      // 00_InputAudit.json — CSV 변환 감사 (한 폴더에 한 개; 마지막으로 만난 것이 최종)
      if (isInputAuditJson(json)) {
        inputAudit = new InputAuditData(json)
        continue
      }
      // 00_StageSummary.json — phase 알고리즘 요약 + 모델 전체 질량/무게중심
      if (isStageSummaryJson(json)) {
        stageSummary = new StageSummaryData(json)
        continue
      }
      // phase 데이터가 아닌 그 외 메타/요약 파일은 건너뜀
      if (!isPhaseStageJson(json)) {
        summary.skipped++
        continue
      }
      const stage = new StageData(json)
      // 원본 파일명 보존 — 편집 모드 export 파일명("<원본>_edit.json") 생성에 사용.
      stage.sourceFileName = file.name
      stages.push(stage)
    } catch (err) {
      console.warn(`[fileLoader] Failed to construct data for ${file.name}:`, err)
      summary.failed++
      summary.failedFiles.push(file.name)
    }
  }

  // 모든 stage의 group 색·번호를 마지막 stage 기준으로 통일 (multi-viewport 시각적 비교용)
  applyFinalGroupMapping(stages)

  summary.loaded = stages.length
  return { stages, inputAudit, stageSummary, summary }
}
