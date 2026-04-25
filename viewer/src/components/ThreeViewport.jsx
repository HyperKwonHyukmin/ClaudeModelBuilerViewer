import { useRef, useEffect, useCallback, useState } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { buildScene, disposeScene } from '../three/SceneBuilder.js'

const LAYER_KEYS = ['structure', 'pipe', 'nodes', 'rigids', 'masses', 'boundaries', 'diagnostics']
const DRAG_THRESHOLD = 3  // px — moves less than this are treated as a click
const AXES_PX      = 90   // corner indicator size (CSS px)
const AXES_MARGIN  = 10   // margin from bottom-left corner
const DAMPING_TAIL = 800  // ms to keep rendering after drag ends (for inertia)

/**
 * Single Three.js viewport.
 *
 * Camera controls (full 3D, no polar-angle limit):
 *   Left / Middle drag → Rotate  (any axis, unlimited)
 *   Right drag         → Pan
 *   Scroll wheel       → Zoom
 *
 * Rendering is on-demand:
 *   Drag interaction + inertia tail → animation loop
 *   Layer toggle / stage change / sync → single rAF via requestRender()
 *
 * Bottom-left corner: live XYZ axes indicator.
 */
export default function ThreeViewport({ stageData, layers, onReady, onPick, colorMode = 'category' }) {
  const [sceneError, setSceneError] = useState(null)
  const containerRef = useRef(null)
  const rendererRef  = useRef(null)
  const cameraRef    = useRef(null)
  const controlsRef  = useRef(null)
  const sceneRef     = useRef(null)
  const axesSceneRef = useRef(null)
  const axesCamRef   = useRef(null)
  const sceneDataRef = useRef(null)   // { root, layers, pickables }
  const renderScheduled = useRef(false)
  const animRafRef   = useRef(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerDownRef = useRef(null)  // { x, y } at pointerdown
  const fitStateRef  = useRef(null)    // { position, target, up } saved by fitCamera

  // ── Core render: main scene + axes indicator ──────────────────────────
  const doRender = useCallback(() => {
    const renderer = rendererRef.current
    const scene    = sceneRef.current
    const camera   = cameraRef.current
    if (!renderer || !scene || !camera || !renderer.domElement.isConnected) return

    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight

    renderer.setScissorTest(true)

    // Main scene
    renderer.setViewport(0, 0, w, h)
    renderer.setScissor(0, 0, w, h)
    renderer.setClearColor(0x1a1a2e, 1)
    renderer.clear()
    renderer.render(scene, camera)

    // Axes indicator — bottom-left corner
    const ax = AXES_PX
    const am = AXES_MARGIN
    renderer.setViewport(am, am, ax, ax)
    renderer.setScissor(am, am, ax, ax)
    renderer.setClearColor(0x0d0d1a, 1)
    renderer.clear()
    const axesCam = axesCamRef.current
    if (axesCam && axesSceneRef.current) {
      axesCam.quaternion.copy(camera.quaternion)
      _camDir.set(0, 0, 2.5).applyQuaternion(camera.quaternion)
      axesCam.position.copy(_camDir)
      axesCam.updateMatrixWorld()
      renderer.render(axesSceneRef.current, axesCam)
    }

    renderer.setScissorTest(false)
  }, [])

  // ── requestRender: non-interactive updates (layer toggle, sync…) ──────
  const requestRender = useCallback(() => {
    if (renderScheduled.current) return
    renderScheduled.current = true
    requestAnimationFrame(() => {
      renderScheduled.current = false
      doRender()
    })
  }, [doRender])

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.autoClear = false
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000)
    camera.position.set(20, 15, 30)
    cameraRef.current = camera

    // Main scene
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    // Headlight: attached to camera so it always illuminates from the viewer direction.
    // Camera must be in the scene for its children to receive matrix updates.
    const headLight = new THREE.DirectionalLight(0xffffff, 0.85)
    headLight.position.set(0.5, 1, 0.5)   // relative to camera
    camera.add(headLight)
    scene.add(camera)
    sceneRef.current = scene

    // Axes indicator scene
    const axesScene = new THREE.Scene()
    axesScene.add(new THREE.AxesHelper(0.7))
    axesScene.add(_makeLabel('X', '#FF4444', 0.88, 0,    0))
    axesScene.add(_makeLabel('Y', '#44CC44', 0,    0.88, 0))
    axesScene.add(_makeLabel('Z', '#4488FF', 0,    0,    0.88))
    axesSceneRef.current = axesScene

    const axesCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10)
    axesCamRef.current = axesCam

    // ── TrackballControls — unlimited 3D rotation ─────────────────────
    const controls = new TrackballControls(camera, renderer.domElement)
    controls.rotateSpeed = 1.5             // was 4.0 — finer control
    controls.zoomSpeed   = 0.7             // was 1.2
    controls.panSpeed    = 0.25            // was 0.5
    controls.staticMoving   = false        // keep inertia
    controls.dynamicDampingFactor = 0.2   // slightly more damping for crispness
    controls.mouseButtons = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,   // middle button = zoom (less accidental pan)
      RIGHT:  THREE.MOUSE.PAN,
    }
    controlsRef.current = controls

    // ── Animation loop for interaction + inertia ─────────────────────
    let active  = false
    let endTime = 0

    const animate = () => {
      controls.update()   // applies inertia; fires 'change' for camera sync
      doRender()
      if (active || Date.now() - endTime < DAMPING_TAIL) {
        animRafRef.current = requestAnimationFrame(animate)
      } else {
        animRafRef.current = null
      }
    }

    const onStart = () => {
      active = true
      if (!animRafRef.current) animRafRef.current = requestAnimationFrame(animate)
    }
    const onEnd = () => {
      active = false
      endTime = Date.now()
    }

    controls.addEventListener('start', onStart)
    controls.addEventListener('end',   onEnd)

    // ── Double-click: restore to last fitCamera view ─────────────────
    const onDblClick = () => {
      const s = fitStateRef.current
      if (s) {
        camera.position.copy(s.position)
        camera.up.copy(s.up)
        controls.target.copy(s.target)
        controls.update()
      }
      requestRender()
    }
    renderer.domElement.addEventListener('dblclick', onDblClick)

    // ── ResizeObserver ────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      controls.handleResize()   // TrackballControls needs explicit resize notification
      requestRender()
    })
    ro.observe(container)

    // ── Picking: pointerdown/up to distinguish click from drag ───────
    const onPointerDown = (e) => {
      pointerDownRef.current = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e) => {
      if (!pointerDownRef.current) return
      const dx = e.clientX - pointerDownRef.current.x
      const dy = e.clientY - pointerDownRef.current.y
      pointerDownRef.current = null
      if (Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) return  // was a drag

      if (!onPick || !sceneDataRef.current?.pickables) { if (onPick) onPick(null, e); return }

      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = raycasterRef.current
      raycaster.setFromCamera(ndc, camera)

      const { structure, pipe, nodes } = sceneDataRef.current.pickables
      const targets = [structure, pipe, nodes].filter(Boolean)
      const hits = raycaster.intersectObjects(targets)

      if (hits.length === 0) { onPick(null, e); return }

      const hit = hits[0]
      const obj = hit.object
      const iid = hit.instanceId

      if (obj === nodes) {
        const nodeId = obj.userData.nodeIds?.[iid]
        onPick({ type: 'node', nodeId }, e)
      } else {
        const data = obj.userData.elementData?.[iid]
        if (data) onPick({ type: 'element', ...data }, e)
        else onPick(null, e)
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup',   onPointerUp)

    requestRender()
    if (onReady) onReady({ camera, controls, requestRender })

    return () => {
      if (animRafRef.current) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null }
      ro.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end',   onEnd)
      controls.dispose()
      renderer.domElement.removeEventListener('dblclick',    onDblClick)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup',   onPointerUp)
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild scene when stageData or colorMode changes ────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (sceneDataRef.current) {
      scene.remove(sceneDataRef.current.root)
      disposeScene(sceneDataRef.current.root)
      sceneDataRef.current = null
    }

    if (!stageData) { setSceneError(null); requestRender(); return }

    try {
      const sceneData = buildScene(stageData, colorMode)
      scene.add(sceneData.root)
      sceneDataRef.current = sceneData

      if (layers) applyLayers(sceneData.layers, layers)

      fitCamera(stageData, cameraRef.current, controlsRef.current)
      // Save state so double-click can restore this exact view
      fitStateRef.current = {
        position: cameraRef.current.position.clone(),
        target:   controlsRef.current.target.clone(),
        up:       cameraRef.current.up.clone(),
      }
      setSceneError(null)
      requestRender()
    } catch (err) {
      console.error('[ThreeViewport] Scene build failed:', err)
      setSceneError(err.message ?? String(err))
    }
  }, [stageData, colorMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer visibility ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current || !layers) return
    applyLayers(sceneDataRef.current.layers, layers)
    requestRender()
  }, [layers, requestRender])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {sceneError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10,0,0,0.85)', color: '#FF6B6B',
          fontSize: 12, padding: 20, gap: 8, zIndex: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠ 씬 빌드 실패</span>
          <span style={{ color: '#aaa', textAlign: 'center', wordBreak: 'break-all' }}>{sceneError}</span>
          <span style={{ color: '#666', fontSize: 11 }}>콘솔에서 자세한 오류를 확인하세요</span>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

const _camDir = new THREE.Vector3()

function applyLayers(threeLayerMap, layerState) {
  for (const key of LAYER_KEYS) {
    if (threeLayerMap[key]) threeLayerMap[key].visible = layerState[key] ?? true
  }
}

function fitCamera(stageData, camera, controls) {
  const bbox = stageData.bbox
  const dx = (bbox.maxX - bbox.minX) / 1000
  const dy = (bbox.maxY - bbox.minY) / 1000
  const dz = (bbox.maxZ - bbox.minZ) / 1000
  const size = Math.max(dx, dy, dz, 1)

  // Target is always the model centre in scene space (0,0,0 after centring)
  controls.target.set(0, 0, 0)

  const fov  = camera.fov * (Math.PI / 180)
  const dist = (size / 2) / Math.tan(fov / 2) * 1.5
  camera.position.set(dist, dist * 0.6, dist)

  // Explicitly orient the camera towards the rotation centre so TrackballControls
  // initialises its internal _eye vector correctly.
  camera.lookAt(controls.target)

  camera.near = dist * 0.001
  camera.far  = dist * 100
  camera.updateProjectionMatrix()

  controls.minDistance = dist * 0.01
  controls.maxDistance = dist * 50
  controls.update()
}

function _makeLabel(text, color, x, y, z) {
  const canvas = document.createElement('canvas')
  canvas.width = 64; canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.font = 'bold 44px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 32, 34)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }))
  sprite.scale.set(0.28, 0.28, 0.28)
  sprite.position.set(x, y, z)
  return sprite
}
