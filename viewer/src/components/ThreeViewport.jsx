import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildScene, disposeScene } from '../three/SceneBuilder.js'

const LAYER_KEYS = ['structure', 'pipe', 'nodes', 'rigids', 'masses', 'boundaries', 'welds']
const AXES_PX = 90        // corner indicator size in CSS pixels
const AXES_MARGIN = 10    // margin from corner
const DAMPING_TAIL_MS = 700  // how long to keep rendering after drag ends

/**
 * Single Three.js viewport.
 *
 * Camera controls (HyperMesh style):
 *   Left / Middle drag → Rotate
 *   Right drag         → Pan
 *   Scroll wheel       → Zoom
 *
 * Rendering is on-demand:
 *   - During and after interaction: animation loop with damping
 *   - Layer toggle / stage change / camera sync: single rAF via requestRender()
 *
 * Bottom-left corner shows a live XYZ axes indicator.
 */
export default function ThreeViewport({ stageData, layers, onReady }) {
  const containerRef  = useRef(null)
  const rendererRef   = useRef(null)
  const cameraRef     = useRef(null)
  const controlsRef   = useRef(null)
  const sceneRef      = useRef(null)
  const axesSceneRef  = useRef(null)
  const axesCamRef    = useRef(null)
  const sceneDataRef  = useRef(null)   // { root, layers }
  const renderScheduled = useRef(false)
  const animRafRef    = useRef(null)

  // ── Core render (main scene + axes indicator) ──────────────────────────
  const doRender = useCallback(() => {
    const renderer = rendererRef.current
    const scene    = sceneRef.current
    const camera   = cameraRef.current
    if (!renderer || !scene || !camera || !renderer.domElement.isConnected) return

    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight

    renderer.setScissorTest(true)

    // ── Main scene ─────────────────────────────────────────────────────
    renderer.setViewport(0, 0, w, h)
    renderer.setScissor(0, 0, w, h)
    renderer.setClearColor(0x1a1a2e, 1)
    renderer.clear()
    renderer.render(scene, camera)

    // ── Axes indicator (bottom-left corner) ────────────────────────────
    const ax = AXES_PX
    const am = AXES_MARGIN
    renderer.setViewport(am, am, ax, ax)
    renderer.setScissor(am, am, ax, ax)
    renderer.setClearColor(0x0d0d1a, 1)
    renderer.clear()

    const axesCam = axesCamRef.current
    if (axesCam && axesSceneRef.current) {
      // Sync orientation only — axes cam always looks at origin
      axesCam.quaternion.copy(camera.quaternion)
      _camDir.set(0, 0, 2.5).applyQuaternion(camera.quaternion)
      axesCam.position.copy(_camDir)
      axesCam.updateMatrixWorld()
      renderer.render(axesSceneRef.current, axesCam)
    }

    renderer.setScissorTest(false)
  }, [])

  // ── requestRender: for non-interactive updates (layer toggle, sync…) ──
  const requestRender = useCallback(() => {
    if (renderScheduled.current) return
    renderScheduled.current = true
    requestAnimationFrame(() => {
      renderScheduled.current = false
      doRender()
    })
  }, [doRender])

  // ── Init renderer / camera / controls / axes ──────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.autoClear = false  // we manage clear manually
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Main camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000)
    camera.position.set(20, 15, 30)
    cameraRef.current = camera

    // Main scene
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    sceneRef.current = scene

    // ── Axes indicator scene ─────────────────────────────────────────
    const axesScene = new THREE.Scene()
    axesScene.add(new THREE.AxesHelper(0.7))
    // Sprite labels for X / Y / Z
    axesScene.add(makeLabel('X', '#FF4444', 0.88, 0, 0))
    axesScene.add(makeLabel('Y', '#44CC44', 0, 0.88, 0))
    axesScene.add(makeLabel('Z', '#4488FF', 0, 0, 0.88))
    axesSceneRef.current = axesScene

    const axesCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10)
    axesCamRef.current = axesCam

    // ── OrbitControls — HyperMesh style ─────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.10
    controls.screenSpacePanning = true
    controls.mouseButtons = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT:  THREE.MOUSE.PAN,
    }
    controlsRef.current = controls

    // ── Animation loop (active during drag + damping tail) ───────────
    let active = false
    let endTime = 0

    const animate = () => {
      controls.update()   // applies damping; fires 'change' events → camera sync
      doRender()
      if (active || Date.now() - endTime < DAMPING_TAIL_MS) {
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

    // ── ResizeObserver ───────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      requestRender()
    })
    ro.observe(container)

    requestRender()
    if (onReady) onReady({ camera, controls, requestRender })

    return () => {
      if (animRafRef.current) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null }
      ro.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end',   onEnd)
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild scene when stageData changes ─────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (sceneDataRef.current) {
      scene.remove(sceneDataRef.current.root)
      disposeScene(sceneDataRef.current.root)
      sceneDataRef.current = null
    }

    if (!stageData) { requestRender(); return }

    const sceneData = buildScene(stageData)
    scene.add(sceneData.root)
    sceneDataRef.current = sceneData

    if (layers) applyLayers(sceneData.layers, layers)

    fitCamera(stageData, cameraRef.current, controlsRef.current)
    requestRender()
  }, [stageData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer visibility changes ──────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current || !layers) return
    applyLayers(sceneDataRef.current.layers, layers)
    requestRender()
  }, [layers, requestRender])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Reusable vector — avoids per-frame allocation in doRender
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

  controls.target.set(0, 0, 0)
  const fov  = camera.fov * (Math.PI / 180)
  const dist = (size / 2) / Math.tan(fov / 2) * 1.5
  camera.position.set(dist, dist * 0.6, dist)
  camera.near = dist * 0.001
  camera.far  = dist * 100
  camera.updateProjectionMatrix()
  controls.minDistance = dist * 0.01
  controls.maxDistance = dist * 50
  controls.update()
}

/** Creates a canvas-texture sprite label for the axes indicator. */
function makeLabel(text, color, x, y, z) {
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
