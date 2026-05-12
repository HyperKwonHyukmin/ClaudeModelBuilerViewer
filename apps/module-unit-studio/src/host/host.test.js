import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectHost, getHost, setHost, WebHost, ElectronHost } from './host.js'

describe('host adapter — detection', () => {
  let hadWindow
  let savedWorkbenchAPI

  beforeEach(() => {
    setHost(null)
    hadWindow = 'window' in globalThis
    if (!hadWindow) globalThis.window = {}
    savedWorkbenchAPI = globalThis.window.workbenchAPI
    delete globalThis.window.workbenchAPI
  })

  afterEach(() => {
    setHost(null)
    if (hadWindow) {
      if (savedWorkbenchAPI) globalThis.window.workbenchAPI = savedWorkbenchAPI
      else delete globalThis.window.workbenchAPI
    } else {
      delete globalThis.window
    }
  })

  it('window.workbenchAPI 가 없으면 WebHost 를 반환한다', () => {
    const h = detectHost()
    expect(h).toBeInstanceOf(WebHost)
    expect(h.name).toBe('web')
  })

  it('window.workbenchAPI 가 있으면 ElectronHost 를 반환한다', () => {
    globalThis.window.workbenchAPI = { pickFolder: vi.fn(), writeFile: vi.fn() }
    const h = detectHost()
    expect(h).toBeInstanceOf(ElectronHost)
    expect(h.name).toBe('electron')
  })

  it('getHost 는 싱글톤을 캐시한다', () => {
    const a = getHost()
    const b = getHost()
    expect(a).toBe(b)
  })

  it('setHost(null) 후 getHost 는 환경을 재감지한다', () => {
    const a = getHost()
    setHost(null)
    const b = getHost()
    expect(b).not.toBe(a)
  })
})

describe('WebHost.writeFile', () => {
  it('FileSystemDirectoryHandle 에 파일을 쓰고 ok=true 를 반환한다', async () => {
    const writeSpy = vi.fn()
    const closeSpy = vi.fn()
    const fakeFh = { createWritable: vi.fn(async () => ({ write: writeSpy, close: closeSpy })) }
    const fakeDirHandle = {
      getFileHandle: vi.fn(async () => fakeFh),
      requestPermission: vi.fn(async () => 'granted'),
    }

    const h = new WebHost()
    const r = await h.writeFile(fakeDirHandle, 'foo_edit.json', '{"ok":1}')

    expect(r.ok).toBe(true)
    expect(r.location).toBe('folder')
    expect(fakeDirHandle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(fakeDirHandle.getFileHandle).toHaveBeenCalledWith('foo_edit.json', { create: true })
    expect(writeSpy).toHaveBeenCalledWith('{"ok":1}')
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('권한 거절 시 ok=false 를 반환한다', async () => {
    const fakeDirHandle = {
      getFileHandle: vi.fn(),
      requestPermission: vi.fn(async () => 'denied'),
    }

    const h = new WebHost()
    const r = await h.writeFile(fakeDirHandle, 'foo.json', '{}')

    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/권한/)
    expect(fakeDirHandle.getFileHandle).not.toHaveBeenCalled()
  })

  it('folderRef 가 null 이면 ok=false 를 반환한다', async () => {
    const h = new WebHost()
    const r = await h.writeFile(null, 'foo.json', '{}')
    expect(r.ok).toBe(false)
  })

  it('getInitialFolder 는 항상 null 을 반환한다 (Web 단독 모드)', async () => {
    const h = new WebHost()
    expect(await h.getInitialFolder()).toBeNull()
  })
})

describe('ElectronHost', () => {
  it('pickFolder 가 workbenchAPI 결과를 file-like 로 변환한다', async () => {
    const api = {
      pickFolder: vi.fn(async () => ({
        folderPath: '/tmp/foo',
        files: [{ name: 'a.json', content: '{"x":1}' }],
      })),
      getInitialFolder: vi.fn(async () => null),
      writeFile: vi.fn(),
    }
    const h = new ElectronHost(api)

    const r = await h.pickFolder()
    expect(r.cancelled).toBeUndefined()
    expect(r.folderRef).toBe('/tmp/foo')
    expect(r.files).toHaveLength(1)
    expect(r.files[0].name).toBe('a.json')
    // file-like 는 .text() 로 내용을 돌려준다 (fileLoader 가 사용)
    expect(await r.files[0].text()).toBe('{"x":1}')
  })

  it('pickFolder 가 null 을 받으면 cancelled 로 표시한다', async () => {
    const api = { pickFolder: vi.fn(async () => null), writeFile: vi.fn() }
    const h = new ElectronHost(api)
    const r = await h.pickFolder()
    expect(r.cancelled).toBe(true)
  })

  it('writeFile 이 폴더 경로를 그대로 IPC 에 전달한다', async () => {
    const apiWrite = vi.fn(async () => ({ ok: true }))
    const api = { pickFolder: vi.fn(), writeFile: apiWrite }
    const h = new ElectronHost(api)

    const r = await h.writeFile('/tmp/foo', 'bar_edit.json', '{}')
    expect(r.ok).toBe(true)
    expect(r.location).toBe('folder')
    expect(apiWrite).toHaveBeenCalledWith('/tmp/foo', 'bar_edit.json', '{}')
  })

  it('writeFile 이 IPC 에러를 ok=false 로 변환한다', async () => {
    const api = {
      pickFolder: vi.fn(),
      writeFile: vi.fn(async () => ({ ok: false, error: '디스크 가득' })),
    }
    const h = new ElectronHost(api)

    const r = await h.writeFile('/tmp/foo', 'bar.json', '{}')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('디스크 가득')
  })

  it('getInitialFolder 가 자동 폴더 정보를 반환한다', async () => {
    const api = {
      pickFolder: vi.fn(),
      writeFile: vi.fn(),
      getInitialFolder: vi.fn(async () => ({
        folderPath: '/auto',
        files: [{ name: '01_X.json', content: '{}' }],
      })),
    }
    const h = new ElectronHost(api)

    const r = await h.getInitialFolder()
    expect(r.folderRef).toBe('/auto')
    expect(r.files).toHaveLength(1)
  })

  it('uploadEvaluationArtifact 는 preload 가 노출하지 않으면 활성화되지 않는다', () => {
    const api = { pickFolder: vi.fn(), writeFile: vi.fn() }
    const h = new ElectronHost(api)
    expect(typeof h.uploadEvaluationArtifact).toBe('undefined')
  })

  it('uploadEvaluationArtifact 는 preload 가 노출하면 IPC 결과를 표준 형태로 변환', async () => {
    const upload = vi.fn(async () => ({ ok: true, remotePath: '/userConnections/u1/posture/x_posture.json' }))
    const api = { pickFolder: vi.fn(), writeFile: vi.fn(), uploadEvaluationArtifact: upload }
    const h = new ElectronHost(api)
    const r = await h.uploadEvaluationArtifact('x_posture.json', '{"a":1}')
    expect(upload).toHaveBeenCalledWith('x_posture.json', '{"a":1}')
    expect(r.ok).toBe(true)
    expect(r.location).toBe('backend')
    expect(r.remotePath).toBe('/userConnections/u1/posture/x_posture.json')
  })

  it('uploadEvaluationArtifact 는 IPC 에러를 ok=false 로 변환', async () => {
    const upload = vi.fn(async () => ({ ok: false, error: '서버 응답 없음' }))
    const api = { pickFolder: vi.fn(), writeFile: vi.fn(), uploadEvaluationArtifact: upload }
    const h = new ElectronHost(api)
    const r = await h.uploadEvaluationArtifact('x.json', '{}')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('서버 응답 없음')
  })

  it('uploadEvaluationArtifact 가 throw 해도 ok=false 로 안전하게 처리', async () => {
    const upload = vi.fn(async () => { throw new Error('네트워크 끊김') })
    const api = { pickFolder: vi.fn(), writeFile: vi.fn(), uploadEvaluationArtifact: upload }
    const h = new ElectronHost(api)
    const r = await h.uploadEvaluationArtifact('x.json', '{}')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('네트워크 끊김')
  })
})
