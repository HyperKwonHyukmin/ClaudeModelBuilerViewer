import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// package.json 의 version 을 읽어 manifest 에 자동 주입한다.
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))

// Workbench 마켓플레이스가 ModuleUnitStudio 를 등록할 때 읽는 카탈로그 파일.
// dist 루트에 항상 같이 출력되어야 한다.
// 카드 메뉴(linkedMenu)는 'ModuleUnitStudio' 로 고정.
// 이 앱 자체는 BDF 모델 확인, 권상 위치 지정, wire 생성, 구조 안정성 평가를 위한 Studio 이다.
const VIEWER_MANIFEST = {
  id: 'module-unit-studio',
  name: 'ModuleUnitStudio',
  version: pkg.version,
  entry: 'index.html',
  linkedMenu: 'ModuleUnitStudio',
  minWorkbenchVersion: '2.0.0',
  description: 'BDF 기반 Module Unit 권상 wire 생성 및 구조 안정성 평가 Studio',
  hostApi: 'workbenchAPI@1',
}

/**
 * dist 루트에 manifest.json 을 쓴다. closeBundle 단계라 vite build 의 모든 자산이
 * 출력된 직후에 실행된다.
 */
function workbenchManifestPlugin(manifest) {
  return {
    name: 'workbench-manifest',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      fs.mkdirSync(outDir, { recursive: true })
      const outFile = path.join(outDir, 'manifest.json')
      fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
      this.info?.(`[workbench-manifest] wrote ${outFile}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), workbenchManifestPlugin(VIEWER_MANIFEST)],
  // base: './'  — 빌드 산출물이 file:// (Electron) 와 http:// 양쪽에서 모두 동작하도록
  // 자산 경로를 상대로 만든다. http 호스팅에서도 이상 없음.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,   // 5175 가 점유 중이면 다른 포트로 자동 이동하지 않고 실패
  },
  preview: {
    port: 5175,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,    // 배포 패키지 크기 절감. 디버깅 필요 시 'inline' 로 변경
    target: 'es2022',
    chunkSizeWarningLimit: 1500, // three.js 가 800KB 정도라 기본 500 보다 여유있게
  },
})
