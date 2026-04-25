import { StageData } from './StageData.js'

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

/**
 * Loads multiple JSON files, sorts by filename number, and returns StageData[].
 * Files that fail to parse are skipped.
 * @param {FileList | File[]} fileList
 * @returns {Promise<StageData[]>}
 */
export async function loadFiles(fileList) {
  const files = sortStageFiles(Array.from(fileList).filter(f => f.name.endsWith('.json')))
  const jsons = await Promise.all(files.map(readJsonFile))
  return jsons
    .map((json, i) => json ? new StageData(json) : null)
    .filter(Boolean)
}
