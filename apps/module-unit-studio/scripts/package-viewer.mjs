#!/usr/bin/env node
/**
 * Workbench 마켓플레이스 배포용 zip 패키징 스크립트.
 *
 * 동작:
 *   1) viewer/dist 의 모든 파일을 viewer/release/<id>-<version>.zip 으로 압축
 *      - zip 루트에 manifest.json / index.html / assets/ 가 바로 위치 (폴더 래퍼 없음)
 *      - Workbench 가 viewers/<id>/ 폴더를 미리 만들어 두고 그 안에 풀기 때문
 *   2) zip 의 SHA256 을 계산해 <id>-<version>.zip.sha256 에 기록
 *   3) 결과(경로/크기/해시)를 콘솔에 출력
 *
 * 전제: 직전에 `vite build` 가 성공해 dist/manifest.json 이 존재해야 한다.
 *      package.json scripts.package = "npm run build && node scripts/package-viewer.mjs"
 *
 * 외부 의존성: archiver (zip 라이브러리). 다른 의존성은 Node 내장만 사용.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist')
const RELEASE_DIR = path.join(ROOT, 'release')
const MANIFEST_PATH = path.join(DIST_DIR, 'manifest.json')

function fail(msg) {
  console.error(`[package-viewer] ✗ ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(DIST_DIR)) fail(`dist 폴더가 없습니다: ${DIST_DIR}\n먼저 'npm run build' 를 실행해 주세요.`)
if (!fs.existsSync(MANIFEST_PATH)) fail(`manifest.json 이 없습니다: ${MANIFEST_PATH}`)

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
} catch (e) {
  fail(`manifest.json 파싱 실패: ${e.message}`)
}

if (!manifest.id || !manifest.version) {
  fail('manifest.json 에 id/version 필드가 필요합니다.')
}

fs.mkdirSync(RELEASE_DIR, { recursive: true })

const zipName = `${manifest.id}-${manifest.version}.zip`
const zipPath = path.join(RELEASE_DIR, zipName)
const hashPath = `${zipPath}.sha256`

// 기존 산출물 정리 (덮어쓰기)
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
if (fs.existsSync(hashPath)) fs.unlinkSync(hashPath)

const output = fs.createWriteStream(zipPath)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => {
  const buf = fs.readFileSync(zipPath)
  const hash = crypto.createHash('sha256').update(buf).digest('hex')
  fs.writeFileSync(hashPath, `${hash}  ${zipName}\n`, 'utf8')

  const bytes = archive.pointer()
  const sizeMB = (bytes / 1024 / 1024).toFixed(2)
  const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/')

  console.log('[package-viewer] ✔ 패키징 완료')
  console.log(`  id      : ${manifest.id}`)
  console.log(`  version : ${manifest.version}`)
  console.log(`  zip     : ${rel(zipPath)}`)
  console.log(`  size    : ${sizeMB} MB (${bytes.toLocaleString()} bytes)`)
  console.log(`  sha256  : ${hash}`)
  console.log(`  hashfile: ${rel(hashPath)}`)
})

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn(`[package-viewer] warning: ${err.message}`)
  else throw err
})
archive.on('error', (err) => fail(`archive error: ${err.message}`))

archive.pipe(output)
// 두 번째 인자 false → dist 디렉터리 자체는 zip 에 포함하지 않고,
// dist 내부 파일들을 zip 루트에 그대로 둔다.
archive.directory(DIST_DIR, false)
archive.finalize()
