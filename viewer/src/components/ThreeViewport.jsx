import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildBeamMesh } from '../three/BeamMesh.js'

/**
 * Single Three.js viewport.
 * Renders on-demand (not continuous rAF) — only when controls change,
 * stage changes, layer visibility changes, or window resizes.
 *
 * Props:
 *   stageData  {StageData|null}  The pipeline stage to display
 *   layers     {object}         Visibility flags: { structure, pipe, ... }
 *   onReady    {function}       Called with { camera, controls, requestRender }
 */
export default function ThreeViewport({ stageData, layers, onReady }) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const sceneRef = useRef(null)
  const layerGroupsRef = useRef(null)
  const renderScheduled = useRef(false)

  // Schedule a single render frame (debounced via rAF)
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

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x1a1a2e)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000)
    camera.position.set(20, 15, 30)
    cameraRef.current = camera

    // Scene
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    sceneRef.current = scene

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.addEventListener('change', requestRender)
    controlsRef.current = controls

    // Resize observer
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
      container.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild scene when stageData changes
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // Remove old layer groups
    if (layerGroupsRef.current) {
      const { root } = layerGroupsRef.current
      scene.remove(root)
      disposeGroup(root)
      layerGroupsRef.current = null
    }

    if (!stageData) {
      requestRender()
      return
    }

    // Build beam meshes
    const { structure, pipe } = buildBeamMesh(stageData)

    const root = new THREE.Group()
    root.add(structure)
    root.add(pipe)
    scene.add(root)

    layerGroupsRef.current = { root, structure, pipe }

    // Apply current layer visibility
    if (layers) {
      structure.visible = layers.structure ?? true
      pipe.visible = layers.pipe ?? true
    }

    // Fit camera to bounding box
    fitCamera(stageData, cameraRef.current, controlsRef.current)
    requestRender()
  }, [stageData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update layer visibility when layers prop changes
  useEffect(() => {
    const groups = layerGroupsRef.current
    if (!groups || !layers) return
    if (groups.structure) groups.structure.visible = layers.structure ?? true
    if (groups.pipe) groups.pipe.visible = layers.pipe ?? true
    requestRender()
  }, [layers, requestRender])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    />
  )
}

// --- helpers ---

function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else obj.material.dispose()
    }
  })
}

function fitCamera(stageData, camera, controls) {
  const bbox = stageData.bbox
  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2
  const cz = (bbox.minZ + bbox.maxZ) / 2
  const dx = (bbox.maxX - bbox.minX) / 1000
  const dy = (bbox.maxY - bbox.minY) / 1000
  const dz = (bbox.maxZ - bbox.minZ) / 1000
  const size = Math.max(dx, dy, dz, 1)

  // center in scene coordinates is always (0,0,0) after transform
  controls.target.set(0, 0, 0)

  const fov = camera.fov * (Math.PI / 180)
  const dist = (size / 2) / Math.tan(fov / 2) * 1.5
  camera.position.set(dist, dist * 0.6, dist)
  camera.near = dist * 0.001
  camera.far = dist * 100
  camera.updateProjectionMatrix()
  controls.update()
}
