import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { buildScene, disposeScene } from '../three/SceneBuilder.js'
import { applyFreeNodeFilters } from '../three/NodePoints.js'
import { applyGroupVisibility } from '../three/GroupVisibility.js'
import { applyDeleteMask } from '../three/applyDeleteMask.js'
import { buildBrokenRbeHighlight } from '../three/BrokenRbeHighlight.js'
import { buildAddRigidPreview } from '../three/AddRigidPreview.js'
import { buildElementsHighlight, buildNodesHighlight, buildMultiSelectionHighlight } from '../three/SelectionHighlight.js'
import { buildCenterOfGravityMarker } from '../three/CenterOfGravityMarker.js'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { computeDeleteMask } from '../data/applyEditIntents.js'

const LAYER_KEYS = ['structure', 'pipe', 'nodes', 'rigids', 'masses', 'boundaries', 'uboltMarkers', 'uboltDof']
const DRAG_THRESHOLD = 3  // px — moves less than this are treated as a click
const AXES_PX      = 108  // corner indicator size (CSS px)
const AXES_MARGIN  = 10   // margin from corner
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
export default function ThreeViewport({ stageData, layers, onReady, onPick, colorMode = 'category', freeNodeFilters, groupFilters, selectedEntity, isolateSelection = false, renderMode = 'cylinder', isEditTargetStage = true }) {
  const [sceneError, setSceneError] = useState(null)
  const containerRef = useRef(null)
  const rendererRef  = useRef(null)
  const cameraRef    = useRef(null)
  const controlsRef  = useRef(null)
  const sceneRef     = useRef(null)
  const axesSceneRef = useRef(null)
  const axesCamRef   = useRef(null)
  const stageDataRef = useRef(stageData)
  const sceneDataRef = useRef(null)   // { root, layers, pickables }
  const renderScheduled = useRef(false)
  const animRafRef   = useRef(null)
  const raycasterRef   = useRef((() => {
    // LineSegments(RBE) 픽은 0폭 라인이라 threshold 가 필요. 크게 잡으면 정확도가 떨어지므로
    // 매번 picking 직전에 카메라 거리 기반으로 동적으로 갱신한다 (아래 onPointerUp 참고).
    const r = new THREE.Raycaster()
    r.params.Line = { threshold: 0.3 }
    return r
  })())
  const pointerDownRef = useRef(null)   // { x, y } at pointerdown
  const fitStateRef    = useRef(null)   // { position, target, up } saved by fitCamera
  const highlightRef   = useRef(null)   // current selection highlight Group
  const brokenRbeRef   = useRef(null)   // broken RBE 노란 overlay (편집 모드)
  const selectedElementIdsRef = useRef(new Set())

  useEffect(() => {
    stageDataRef.current = stageData
  }, [stageData])

  // ── Edit intents (deleteGroup) → derived deleteMask ───────────────────
  // 편집 모드 OFF 일 때는 intent 가 메모리에 남아 있어도 미리보기를 적용하지 않는다.
  // 그렇지 않으면 모드 OFF 후에도 hide 가 유지되어 "노드 토글 ON 인데 안 보이는" 버그가 발생.
  const editIntents          = useEditStore(s => s.intents)
  const editEnabled          = useEditStore(s => s.enabled)
  const pendingNodeSelection = useEditStore(s => s.pendingNodeSelection)
  const toggleNodeSelection  = useEditStore(s => s.toggleNodeSelection)
  // 편집 대상 단계(마지막 단계)가 아닌 viewport 에서는 미리보기를 적용하지 않는다.
  // 그 단계의 group/node ID 가 마지막 단계와 다를 수 있어 의도와 무관한 노드가 hide 될 위험.
  const deleteMask = useMemo(
    () => (editEnabled && isEditTargetStage) ? computeDeleteMask(stageData, editIntents) : null,
    [stageData, editIntents, editEnabled, isEditTargetStage],
  )

  // 클릭 핸들러가 항상 최신 store/prop 값을 보도록 ref 로 캡처
  const editStateRef = useRef({ enabled: false, isTarget: true, toggle: () => {}, mask: null, hasPendingNodes: false })
  useEffect(() => {
    editStateRef.current = {
      enabled: editEnabled,
      isTarget: isEditTargetStage,
      toggle: toggleNodeSelection,
      mask: deleteMask,
      hasPendingNodes: pendingNodeSelection.length > 0,
    }
  }, [editEnabled, isEditTargetStage, toggleNodeSelection, deleteMask, pendingNodeSelection.length])

  const multiSelRef = useRef(null)   // 다중 선택 노드 overlay (노란 sphere)
  const addRigidRef = useRef(null)   // addRigid intent 미리보기 overlay (노란 점선)
  const cogRef      = useRef(null)   // 무게중심 마커 (sphere + cross + 라벨)

  // 무게중심 시각화 — useStageStore 의 stageSummary 가 있고 layer 토글이 켜져 있을 때만.
  const stageSummary = useStageStore(s => s.stageSummary)

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

    // Axes indicator — top-right corner
    const ax = AXES_PX
    const am = AXES_MARGIN
    renderer.setViewport(w - ax - am, h - ax - am, ax, ax)
    renderer.setScissor(w - ax - am, h - ax - am, ax, ax)
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
    renderer.toneMapping = THREE.NoToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000)
    camera.position.set(20, 15, 30)
    cameraRef.current = camera

    // Main scene
    const scene = new THREE.Scene()

    // Balanced lighting for engineering review:
    // enough ambient fill to keep group colors readable, plus soft directional lights for shape depth.
    scene.add(new THREE.HemisphereLight(0xd8eaff, 0x3d3d48, 1.25))
    scene.add(new THREE.AmbientLight(0xffffff, 0.28))

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.55)
    keyLight.position.set(4, -5, 7)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0x9fc8ff, 0.35)
    rimLight.position.set(-5, 4, 5)
    scene.add(rimLight)

    // Headlight: attached to camera so it always illuminates from the viewer direction.
    // Camera must be in the scene for its children to receive matrix updates.
    const headLight = new THREE.DirectionalLight(0xffffff, 1.0)
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

    // ── F key: restore to last fitCamera view ────────────────────────
    const restoreFitView = () => {
      const s = fitStateRef.current
      if (s) {
        camera.position.copy(s.position)
        camera.up.copy(s.up)
        controls.target.copy(s.target)
        controls.update()
      }
      requestRender()
    }

    // Keyboard shortcuts (only when pointer is inside this viewport)
    const onKeyDown = (e) => {
      if (!container.matches(':hover')) return

      const k = e.key.toLowerCase()

      // F → fit view
      if (k === 'f') { restoreFitView(); return }

      // A / S / D → axis-aligned orthographic views
      if (k === 'a' || k === 's' || k === 'd') {
        const fitPos = fitStateRef.current?.position
        const dist = fitPos ? fitPos.length() : 30

        let pos, up
        if (k === 'a') {
          // X/Y 평면 (평면도) — +Z 방향에서 내려다봄, X 종방향, Y 횡방향
          pos = new THREE.Vector3(0, 0, dist)
          up  = new THREE.Vector3(1, 0, 0)
        } else if (k === 's') {
          // X/Z 평면 (종단면) — +Y 방향에서 봄, X 종방향, Z 수직
          pos = new THREE.Vector3(0, -dist, 0)
          up  = new THREE.Vector3(0, 0, 1)
        } else {
          // Y/Z 평면 (횡단면) — +X 방향에서 봄, Y 횡방향, Z 수직
          pos = new THREE.Vector3(dist, 0, 0)
          up  = new THREE.Vector3(0, 0, 1)
        }

        camera.position.copy(pos)
        camera.up.copy(up)
        controls.target.set(0, 0, 0)
        camera.lookAt(controls.target)
        controls.update()
        requestRender()
      }
    }
    window.addEventListener('keydown', onKeyDown)

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
      // Line threshold 는 카메라 거리에 비례 — 픽셀 기준 ~6px 반경의 일관된 클릭 영역을 제공.
      // 거리 30m 이면 약 0.3m, 가까이 다가가면 자연스럽게 줄어든다.
      const camDist = camera.position.distanceTo(controlsRef.current?.target ?? new THREE.Vector3())
      raycaster.params.Line.threshold = Math.max(0.05, camDist * 0.01)

      const { structure, pipe, nodes, beams, masses, rigidLines = [] } = sceneDataRef.current.pickables
      const editState = editStateRef.current
      const rigidPickMode = editState.enabled && editState.isTarget && (e.shiftKey || editState.hasPendingNodes)
      const baseTargets = rigidPickMode
        ? [nodes]
        : (beams ? [...beams, nodes, masses] : [structure, pipe, nodes, masses])
      const targets = rigidPickMode ? baseTargets.filter(Boolean) : [...baseTargets, ...rigidLines].filter(Boolean)
      // 레이어가 꺼진 객체는 picking 대상에서도 제외 — 화면에 안 보이는 객체를 잘못 집지 않도록.
      // RBE LineSegments 는 'rigids' 그룹 자식이라 그룹의 visible 을 거슬러 올라가 확인.
      const isVisible = (t) => {
        if (t.visible === false) return false
        let p = t.parent
        while (p) { if (p.visible === false) return false; p = p.parent }
        return true
      }
      const visibleTargets = targets.filter(isVisible)
      const hits = raycaster.intersectObjects(visibleTargets)

      if (hits.length === 0) {
        if (rigidPickMode) return
        onPick(null, e)
        return
      }

      const hit = hits[0]
      const obj = hit.object
      const iid = hit.instanceId

      // 편집 모드 미리보기에서 삭제된 (또는 통째로 사라진) 인스턴스는 picking 무시 —
      // scale 이 0.0001 이라 시각적으로 없는데 raycast 에 매우 정밀 클릭 시 잡힐 위험이 있음.
      const mask = editState.mask
      if (obj === nodes) {
        const nodeId = obj.userData.nodeIds?.[iid]
        if (mask?.deletedNodeIds?.has(nodeId)) {
          if (rigidPickMode) return
          onPick(null, e)
          return
        }
        // 편집 모드 + 마지막 단계 + Shift = 다중 선택 토글 (Inspector/Tooltip 으로 propagate 하지 않음)
        if (editState.enabled && editState.isTarget && e.shiftKey && nodeId != null) {
          editState.toggle(nodeId)
          return
        }
        // RBE 생성 노드 선택이 시작된 동안에는 일반 click 선택을 막는다.
        // 노란 선택 마크업만 유지하고, 파란 단일 선택 하이라이트/Inspector 선택으로 전파하지 않는다.
        if (rigidPickMode) {
          return
        }
        onPick({ type: 'node', nodeId }, e)
      } else if (obj === masses) {
        if (rigidPickMode) return
        const data = obj.userData.massData?.[iid]
        if (data && mask?.deletedMassIds?.has(data.id)) { onPick(null, e); return }
        if (data) onPick({ type: 'mass', ...data }, e)
        else onPick(null, e)
      } else if (obj.isLineSegments && obj.userData.rigidData) {
        if (rigidPickMode) return
        // hit.index = 정점 인덱스 (LineSegments 는 정점 2개당 1개 세그먼트 → /2 가 세그먼트 인덱스)
        const segIdx = (hit.index ?? 0) >> 1
        const data = obj.userData.rigidData[segIdx]
        if (data && mask?.fullyRemovedRbeIds?.has(data.id)) { onPick(null, e); return }
        if (data) onPick({ type: 'rigid', ...data }, e)
        else onPick(null, e)
      } else {
        if (rigidPickMode) return
        const data = obj.userData.elementData?.[iid]
        if (data && mask?.deletedElementIds?.has(data.id)) { onPick(null, e); return }
        if (data) onPick({ type: 'element', ...data }, e)
        else onPick(null, e)
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup',   onPointerUp)

    requestRender()
    if (onReady) {
      onReady({
        camera,
        controls,
        requestRender,
        focusEntity: (entity) => focusEntity(entity, stageDataRef.current, camera, controls, requestRender),
      })
    }

    return () => {
      if (animRafRef.current) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null }
      ro.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end',   onEnd)
      controls.dispose()

      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup',   onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild scene when stageData or colorMode changes ────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (highlightRef.current) {
      scene.remove(highlightRef.current)
      disposeScene(highlightRef.current)
      highlightRef.current = null
    }
    if (brokenRbeRef.current) {
      scene.remove(brokenRbeRef.current)
      disposeScene(brokenRbeRef.current)
      brokenRbeRef.current = null
    }
    if (multiSelRef.current) {
      scene.remove(multiSelRef.current)
      disposeScene(multiSelRef.current)
      multiSelRef.current = null
    }
    if (addRigidRef.current) {
      scene.remove(addRigidRef.current)
      disposeScene(addRigidRef.current)
      addRigidRef.current = null
    }
    if (cogRef.current) {
      scene.remove(cogRef.current)
      disposeScene(cogRef.current)
      cogRef.current = null
    }
    if (sceneDataRef.current) {
      scene.remove(sceneDataRef.current.root)
      disposeScene(sceneDataRef.current.root)
      sceneDataRef.current = null
    }

    if (!stageData) {
      setTimeout(() => setSceneError(null), 0)
      requestRender()
      return
    }

    try {
      const sceneData = buildScene(stageData, colorMode, renderMode)
      scene.add(sceneData.root)
      sceneDataRef.current = sceneData

      applyFullVisibility(sceneData, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask)

      fitCamera(stageData, cameraRef.current, controlsRef.current)
      // Save state so double-click can restore this exact view
      fitStateRef.current = {
        position: cameraRef.current.position.clone(),
        target:   controlsRef.current.target.clone(),
        up:       cameraRef.current.up.clone(),
      }
      setTimeout(() => setSceneError(null), 0)
      requestRender()
    } catch (err) {
      console.error('[ThreeViewport] Scene build failed:', err)
      setTimeout(() => setSceneError(err.message ?? String(err)), 0)
    }
  }, [stageData, colorMode, renderMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer visibility ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current) return
    applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask)
    requestRender()
  }, [layers, groupFilters, stageData, isolateSelection, selectedEntity, freeNodeFilters, deleteMask, requestRender])

  // ── Free Node filters ────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current || !freeNodeFilters) return
    applyFreeNodeFilters(sceneDataRef.current.pickables?.nodes, freeNodeFilters)
    // freeNode 필터 적용 후 deleteMask 도 다시 적용해 삭제된 노드가 다시 살아나지 않도록
    if (deleteMask) applyDeleteMask(sceneDataRef.current, deleteMask)
    requestRender()
  }, [freeNodeFilters, deleteMask, requestRender])

  // ── 다중 선택 노드 overlay (편집 모드, 마지막 단계 viewport 만) ─────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (multiSelRef.current) {
      scene.remove(multiSelRef.current)
      disposeScene(multiSelRef.current)
      multiSelRef.current = null
    }
    if (!stageData || !editEnabled || !isEditTargetStage || !pendingNodeSelection?.length) {
      requestRender()
      return
    }
    const group = buildMultiSelectionHighlight(pendingNodeSelection, stageData)
    if (group.children.length > 0) {
      scene.add(group)
      multiSelRef.current = group
    }
    requestRender()
  }, [pendingNodeSelection, editEnabled, isEditTargetStage, stageData, requestRender])

  // ── Broken RBE 노란 overlay (편집 모드) ────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // 이전 overlay 제거
    if (brokenRbeRef.current) {
      scene.remove(brokenRbeRef.current)
      disposeScene(brokenRbeRef.current)
      brokenRbeRef.current = null
    }
    if (!stageData || !deleteMask?.brokenRbeIds || deleteMask.brokenRbeIds.size === 0) {
      requestRender()
      return
    }
    const line = buildBrokenRbeHighlight(stageData, deleteMask.brokenRbeIds)
    if (line) {
      scene.add(line)
      brokenRbeRef.current = line
    }
    requestRender()
  }, [deleteMask, stageData, requestRender])

  // ── addRigid 미리보기 overlay (노란 점선) ──────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (addRigidRef.current) {
      scene.remove(addRigidRef.current)
      disposeScene(addRigidRef.current)
      addRigidRef.current = null
    }
    if (!stageData || !deleteMask?.addedRigids?.length) {
      requestRender()
      return
    }
    const line = buildAddRigidPreview(stageData, deleteMask.addedRigids)
    if (line) {
      scene.add(line)
      addRigidRef.current = line
    }
    requestRender()
  }, [deleteMask, stageData, requestRender])

  // ── Group visibility filters ──────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current || !stageData) return
    applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask)
    requestRender()
  }, [groupFilters, stageData, layers, isolateSelection, selectedEntity, freeNodeFilters, deleteMask, requestRender])

  // ── 무게중심 마커 (00_StageSummary.json 의 massProperties.centerOfGravityMm) ─
  // layer 토글 / stageData / stageSummary 변동 시 추가·제거.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // 이전 마커 제거
    if (cogRef.current) {
      scene.remove(cogRef.current)
      disposeScene(cogRef.current)
      cogRef.current = null
    }

    if (!layers?.cog || !stageData || !stageSummary) {
      requestRender()
      return
    }
    const cogMm = stageSummary.massProperties?.centerOfGravityMm
    if (!cogMm) {
      requestRender()
      return
    }

    // mm 절대좌표 → scene 좌표(현재 viewport stage 의 center 기준 / 1000m 스케일)
    const center = stageData.center
    const bbox   = stageData.bbox
    const positionScene = {
      x: (cogMm.x - center.x) / 1000,
      y: (cogMm.y - center.y) / 1000,
      z: (cogMm.z - center.z) / 1000,
    }
    const sizeM = Math.max(
      (bbox.maxX - bbox.minX) / 1000,
      (bbox.maxY - bbox.minY) / 1000,
      (bbox.maxZ - bbox.minZ) / 1000,
      1,
    )
    const marker = buildCenterOfGravityMarker(positionScene, sizeM)
    scene.add(marker)
    cogRef.current = marker
    requestRender()
  }, [layers?.cog, stageData, stageSummary, requestRender])

  // ── Selection highlight ───────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // Remove previous highlight
    if (highlightRef.current) {
      scene.remove(highlightRef.current)
      disposeScene(highlightRef.current)
      highlightRef.current = null
    }

    selectedElementIdsRef.current = new Set()

    if (!selectedEntity || !stageData) {
      if (sceneDataRef.current) applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask)
      requestRender()
      return
    }

    let group = null
    if (selectedEntity.type === 'node') {
      // Node selected → highlight all connected elements
      const connected = stageData.elements.filter(
        e => e.startNode === selectedEntity.nodeId || e.endNode === selectedEntity.nodeId
      )
      selectedElementIdsRef.current = new Set(connected.map(e => e.id))
      group = buildElementsHighlight(connected.map(e => e.id), stageData)
    } else if (selectedEntity.type === 'element') {
      // Element selected → highlight its two endpoint nodes
      const nodeIds = [selectedEntity.startNode, selectedEntity.endNode].filter(Boolean)
      selectedElementIdsRef.current = new Set([selectedEntity.id])
      group = buildNodesHighlight(nodeIds, stageData)
    } else if (selectedEntity.type === 'rigid') {
      // RBE 선택 → 독립노드 + 모든 종속노드를 함께 강조 (RBE 자체는 line 이라 그대로 두고 노드만 표시)
      const nodeIds = [selectedEntity.independentNode, ...(selectedEntity.dependentNodes ?? [])]
        .filter(id => id != null && stageData.nodeMap?.has(id))
      if (nodeIds.length > 0) group = buildNodesHighlight(nodeIds, stageData)
    } else if (selectedEntity.type === 'sourceName') {
      // CSV 행 (sourceName) 선택 → 같은 sourceName 으로 매칭되는 모든 element 와 mass node 를 함께 강조
      // ─ stage 에 따라 매칭 결과가 다를 수 있으므로 매번 새로 계산 (보통 한 자릿수~수십개)
      const name = selectedEntity.sourceName
      const matchedElems = stageData.elements.filter(e => e.sourceName === name)
      const matchedMassNodes = (stageData.pointMasses ?? [])
        .filter(m => m.sourceName === name)
        .map(m => m.nodeId)
        .filter(id => stageData.nodeMap?.has(id))
      selectedElementIdsRef.current = new Set(matchedElems.map(e => e.id))
      const composite = new THREE.Group()
      if (matchedElems.length > 0) {
        composite.add(buildElementsHighlight(matchedElems.map(e => e.id), stageData))
      }
      if (matchedMassNodes.length > 0) {
        composite.add(buildNodesHighlight(matchedMassNodes, stageData))
      }
      if (composite.children.length > 0) group = composite
    }

    if (group) {
      scene.add(group)
      highlightRef.current = group
    }
    if (sceneDataRef.current) applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask)
    requestRender()
  }, [selectedEntity, stageData, layers, isolateSelection, requestRender]) // eslint-disable-line react-hooks/exhaustive-deps

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
const _m = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _rot = new THREE.Quaternion()
const _scl = new THREE.Vector3()

function applyFullVisibility(sceneData, layerState, groupFilters, stageData, isolateSelection, selectedElementIds, freeNodeFilters, deleteMask) {
  if (!sceneData) return
  applyLayers(sceneData.layers, layerState)
  applyGroupFilters(sceneData.pickables, groupFilters, stageData)
  // NodePoints 는 매번 freeNodeFilters 로 복원해야 — applyDeleteMask 가 hide 한 노드를
  // 마스크 해제 시 (편집 모드 OFF 등) 다시 보이게 하려면 이 단계가 필수.
  if (freeNodeFilters) applyFreeNodeFilters(sceneData.pickables?.nodes, freeNodeFilters)
  applyElementIsolation(sceneData.layers.structure, isolateSelection, selectedElementIds)
  applyElementIsolation(sceneData.layers.pipe, isolateSelection, selectedElementIds)
  // 편집 모드 deleteMask 는 항상 마지막에 적용 — 위 단계가 originalMatrices 로 인스턴스를 복원하기 때문
  if (deleteMask) applyDeleteMask(sceneData, deleteMask)
}

function applyLayers(threeLayerMap, layerState) {
  if (!layerState) return
  for (const key of LAYER_KEYS) {
    if (threeLayerMap[key]) threeLayerMap[key].visible = layerState[key] ?? true
  }
}

function applyGroupFilters(pickables, groupFilters, stageData) {
  if (!pickables || !groupFilters || !stageData) return
  const { structure, pipe, beams } = pickables
  const maxIndividual = (stageData.groups?.length ?? 0) <= 5 ? (stageData.groups?.length ?? 0) : 10
  if (beams) {
    beams.forEach(m => applyGroupVisibility(m, groupFilters, maxIndividual))
  } else {
    applyGroupVisibility(structure, groupFilters, maxIndividual)
    applyGroupVisibility(pipe, groupFilters, maxIndividual)
  }
}

function applyElementIsolation(object, isolateSelection, selectedElementIds) {
  const isolate = isolateSelection && selectedElementIds?.size > 0
  if (!isolate || !object) return
  let hasSelected = false
  object.traverse?.(mesh => {
    if (!mesh?.isInstancedMesh || !mesh.userData?.elementData || !mesh.userData?.originalMatrices) return
    const { elementData, originalMatrices } = mesh.userData
    for (let i = 0; i < mesh.count; i++) {
      _m.fromArray(originalMatrices, i * 16)
      const selected = selectedElementIds.has(elementData[i]?.id)
      if (selected) {
        hasSelected = true
      } else if (isolate) {
        _m.decompose(_pos, _rot, _scl)
        _m.compose(_pos, _rot, _scl.setScalar(0.0001))
      }
      mesh.setMatrixAt(i, _m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  object.visible = hasSelected
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

  // Z-up 좌표계: X 종방향, Y 횡방향, Z 수직
  // 카메라를 X+ / Y- / Z+ 방향에서 바라봄 (정면 우측 상단 시점)
  camera.up.set(0, 0, 1)
  camera.position.set(dist * 0.9, -dist * 0.7, dist * 0.6)

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

function focusEntity(entity, stageData, camera, controls, requestRender) {
  if (!entity || !stageData || !camera || !controls) return

  const points = []
  if (entity.type === 'node' || entity.type === 'mass') {
    const p = stageData.getNodePos(entity.nodeId)
    if (p) points.push(p)
  } else if (entity.type === 'element') {
    const a = stageData.getNodePos(entity.startNode)
    const b = stageData.getNodePos(entity.endNode)
    if (a) points.push(a)
    if (b) points.push(b)
  } else if (entity.type === 'rigid') {
    // 독립노드 + 모든 종속노드의 bbox 로 카메라 포커스
    const nodeIds = [entity.independentNode, ...(entity.dependentNodes ?? [])]
    for (const id of nodeIds) {
      const p = stageData.getNodePos(id)
      if (p) points.push(p)
    }
  } else if (entity.type === 'sourceName') {
    // 매칭된 모든 element 의 양 끝 노드 + 매칭된 mass node 좌표 → bbox 중심에 카메라 포커스
    const name = entity.sourceName
    for (const e of stageData.elements) {
      if (e.sourceName !== name) continue
      const a = stageData.getNodePos(e.startNode)
      const b = stageData.getNodePos(e.endNode)
      if (a) points.push(a)
      if (b) points.push(b)
    }
    for (const m of stageData.pointMasses ?? []) {
      if (m.sourceName !== name) continue
      const p = stageData.getNodePos(m.nodeId)
      if (p) points.push(p)
    }
    // ignored 행처럼 stage entity 가 없는 경우는 mm 좌표가 entity.pos 에 들어 있으면 사용
    if (points.length === 0 && entity.pos) {
      const center = stageData.center
      points.push(new THREE.Vector3(
        (entity.pos.x - center.x) / 1000,
        (entity.pos.y - center.y) / 1000,
        (entity.pos.z - center.z) / 1000,
      ))
    }
  }
  if (points.length === 0) return

  const center = points.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length)
  const radius = Math.max(0.25, ...points.map(p => p.distanceTo(center)))
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target)
  if (dir.lengthSq() < 1e-6) dir.set(1, -1, 0.7)
  dir.normalize()

  controls.target.copy(center)
  camera.position.copy(center).addScaledVector(dir, radius * 5)
  camera.near = Math.max(0.001, radius * 0.01)
  camera.far = Math.max(camera.far, radius * 200)
  camera.updateProjectionMatrix()
  controls.update()
  requestRender()
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
