import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildScene, disposeScene } from '../three/SceneBuilder.js'

const LAYER_KEYS = ['structure', 'pipe', 'nodes', 'rigids', 'masses', 'boundaries', 'welds']

/**
 * Single Three.js viewport.
 * Renders on-demand — only when controls change, stage changes,
 * layer visibility changes, or container resizes.
 *
 * Props:
 *   stageData  {StageData|null}   The pipeline stage to display
 *   layers     {object}           Visibility flags per LAYER_KEYS
 *   onReady    {function}         Called with { camera, controls, requestRender }
 */
export default function ThreeViewport({ stageData, layers, onReady }) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const sceneRef = useRef(null)
  const sceneDataRef = useRef(null)   // { root, layers }
  const renderScheduled = useRef(false)

  const requestRender = useCallback(() => {
    if (renderScheduled.current) return
    renderScheduled.current = true
    requestAnimationFrame(() => {
      renderScheduled.current = false
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
    })
  }, [])

  // Initialize renderer, camera, controls once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x1a1a2e)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000)
    camera.position.set(20, 15, 30)
    cameraRef.current = camera

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    sceneRef.current = scene

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.addEventListener('change', requestRender)
    controlsRef.current = controls

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
      ro.disconnect()
      controls.removeEventListener('change', requestRender)
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild scene when stageData changes
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

    // Apply current layer visibility immediately
    if (layers) applyLayers(sceneData.layers, layers)

    fitCamera(stageData, cameraRef.current, controlsRef.current)
    requestRender()
  }, [stageData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply layer visibility changes
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

function applyLayers(threeLayerMap, layerState) {
  for (const key of LAYER_KEYS) {
    if (threeLayerMap[key]) {
      threeLayerMap[key].visible = layerState[key] ?? true
    }
  }
}

function fitCamera(stageData, camera, controls) {
  const bbox = stageData.bbox
  const dx = (bbox.maxX - bbox.minX) / 1000
  const dy = (bbox.maxY - bbox.minY) / 1000
  const dz = (bbox.maxZ - bbox.minZ) / 1000
  const size = Math.max(dx, dy, dz, 1)

  controls.target.set(0, 0, 0)
  const fov = camera.fov * (Math.PI / 180)
  const dist = (size / 2) / Math.tan(fov / 2) * 1.5
  camera.position.set(dist, dist * 0.6, dist)
  camera.near = dist * 0.001
  camera.far = dist * 100
  camera.updateProjectionMatrix()
  controls.update()
}
