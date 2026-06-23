import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { buildScene, disposeScene } from '../three/SceneBuilder.js'
import { applyFreeNodeFilters, applyHoistModeHighlight } from '../three/NodePoints.js'
import { applyGroupVisibility } from '../three/GroupVisibility.js'
import { applyDeleteMask } from '../three/applyDeleteMask.js'
import { buildBrokenRbeHighlight } from '../three/BrokenRbeHighlight.js'
import { buildAddRigidPreview } from '../three/AddRigidPreview.js'
import { buildElementsHighlight, buildNodesHighlight, buildMultiSelectionHighlight, buildMultiSelElementHighlight } from '../three/SelectionHighlight.js'
import { buildCenterOfGravityMarker } from '../three/CenterOfGravityMarker.js'
import { buildHoistGroupHighlight } from '../three/HoistGroupHighlight.js'
import { buildHoistLevelPlate } from '../three/HoistLevelPlate.js'
import { buildHoistCandidateNodes } from '../three/HoistCandidateNodes.js'
import { buildHoistGroupCog } from '../three/HoistGroupCog.js'
import { buildPipeDiameterOverlay } from '../three/PipeDiameterOverlay.js'
import { buildPolygonOverlay } from '../three/PolygonOverlay.js'
import { buildStabilityWireOverlay } from '../three/StabilityWireOverlay.js'
import { buildStabilityIssueOverlay } from '../three/StabilityIssueOverlay.js'
import { buildSlingAngleOverlay, hasSlingAngleIssues } from '../three/SlingAngleOverlay.js'
import { buildNastranResultOverlay } from '../three/NastranResultOverlay.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
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
export default function ThreeViewport({ stageData, layers, onReady, onPick, onHover, colorMode = 'category', freeNodeFilters, groupFilters, selectedEntity, isolateSelection = false, renderMode = 'cylinder', displayStyle = 'shaded', pickFilters, isEditTargetStage = true, hoistPickEnabled = false }) {
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
  const pickFiltersRef = useRef(pickFilters)
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

  useEffect(() => {
    pickFiltersRef.current = pickFilters
  }, [pickFilters])

  // ── Edit intents (deleteGroup / addRigid) → derived deleteMask ────────
  // 편집 모드 토글과 무관하게 intents 가 1개 이상이면 미리보기를 항상 적용한다.
  // 그래야 편집 모드를 꺼도 변경사항이 유지되고, 이어서 권상 위치 설정 시 삭제된 노드가
  // 자동으로 픽킹·시각화에서 제외된다 (자세안정성 평가가 _edited.json 으로 일관되게 흐름).
  const editIntents            = useEditStore(s => s.intents)
  const editEnabled            = useEditStore(s => s.enabled)
  const pendingNodeSelection   = useEditStore(s => s.pendingNodeSelection)
  const toggleNodeSelection    = useEditStore(s => s.toggleNodeSelection)
  const multiSelElements       = useEditStore(s => s.multiSelElements)
  const toggleMultiSelElement  = useEditStore(s => s.toggleMultiSelElement)
  const clearMultiSelElements  = useEditStore(s => s.clearMultiSelElements)
  const hoistMode              = useEditStore(s => s.hoistMode)
  const hoistGroups            = useEditStore(s => s.hoistGroups)
  const activeHoistGroupId     = useEditStore(s => s.activeHoistGroupId)
  const addHoistNode           = useEditStore(s => s.addHoistNode)
  const flashHoistGuide        = useEditStore(s => s.flashHoistGuide)
  const pipeDiameterThreshold  = useEditStore(s => s.pipeDiameterThreshold)
  const hoistToleranceMm       = useEditStore(s => s.hoistToleranceMm)
  // 편집 대상 단계(마지막 단계)가 아닌 viewport 에서는 미리보기를 적용하지 않는다.
  // 그 단계의 group/node ID 가 마지막 단계와 다를 수 있어 의도와 무관한 노드가 hide 될 위험.
  const deleteMask = useMemo(
    () => (isEditTargetStage && editIntents.length > 0) ? computeDeleteMask(stageData, editIntents) : null,
    [stageData, editIntents, isEditTargetStage],
  )

  // 클릭 핸들러가 항상 최신 store/prop 값을 보도록 ref 로 캡처
  const editStateRef = useRef({ enabled: false, isTarget: true, toggle: () => {}, mask: null, hasPendingNodes: false })
  useEffect(() => {
    editStateRef.current = {
      enabled: editEnabled,
      isTarget: isEditTargetStage,
      toggle: toggleNodeSelection,
      toggleMultiSelElement,
      clearMultiSelElements,
      addHoistNode,
      flashHoistGuide,
      mask: deleteMask,
      hasPendingNodes: pendingNodeSelection.length > 0,
      hoistMode,
      // 권상 픽킹은 상단 Hoist 탭에서만 — hoistMode 가 남아있어도 다른 탭에선 Shift+클릭이
      // 권상 노드 추가로 새지 않도록 게이트. (Edit 의 rigid/다중선택 Shift 흐름과 충돌 방지)
      hoistPickEnabled,
    }
  }, [editEnabled, isEditTargetStage, toggleNodeSelection, toggleMultiSelElement, clearMultiSelElements, addHoistNode, flashHoistGuide, deleteMask, pendingNodeSelection.length, hoistMode, hoistPickEnabled])

  const multiSelRef     = useRef(null)   // 다중 선택 노드 overlay (노란 sphere)
  const multiSelElemRef = useRef(null)   // Ctrl+Click 다중 선택 element overlay (주황 cylinder)
  const addRigidRef = useRef(null)   // addRigid intent 미리보기 overlay (노란 점선)
  const hoistRef    = useRef(null)   // 권상 그룹 노드 overlay
  const cogRef      = useRef(null)   // 무게중심 마커 (sphere + cross + 라벨)
  const polygonRef  = useRef(null)   // 권상 그룹별 도형(line/triangle/quad) overlay — hoistGroups 직접 파생
  const levelPlateRef = useRef(null) // 권상 그룹별 Z-레벨 가이드 평판 (첫 노드 기준)
  const candidateNodesRef = useRef(null) // 평판 위/아래 가장 가까운 레벨의 후보 노드 강조
  const groupCogRef   = useRef(null) // 권상 그룹별 도형 무게중심 마커
  const pipeDiamRef   = useRef(null) // 배관 외경 비교 overlay
  const resultWireRef = useRef(null) // 자세안정성 결과 JSON 에서 생성된 최종 wire overlay
  const stabilityIssueRef = useRef(null) // 자세안정성 간섭 Element overlay (Stage 5)
  const slingAngleRef = useRef(null)     // 슬링 각도 60° 미만 와이어 overlay (Stage 4)
  const nastranResultRef = useRef(null)  // Unit 구조 해석 결과 색맵핑 overlay

  // 무게중심 시각화 — useStageStore 의 stageSummary 가 있고 layer 토글이 켜져 있을 때만.
  const stageSummary = useStageStore(s => s.stageSummary)
  const stabilityReport = useStabilityStore(s => s.report)

  // 배관/구조 토글이 OFF 면 그 카테고리 전용 노드를 자동 숨김.
  // 단, 사용자가 Node 토글을 OFF→ON 으로 다시 켜면 그 후로는 모든 노드를 보여 준다 (auto-filter override).
  // 배관/구조 토글이 다시 변하면 override 해제. — hideNodeIds 계산은 이 ref 들로 컨트롤.
  const prevPipeRef  = useRef(layers?.pipe)
  const prevStructRef = useRef(layers?.structure)
  const prevNodesRef = useRef(layers?.nodes)
  const showAllNodesRef = useRef(false)
  useEffect(() => {
    if (prevNodesRef.current === false && layers?.nodes === true) {
      showAllNodesRef.current = true
    }
    if (prevPipeRef.current !== layers?.pipe || prevStructRef.current !== layers?.structure) {
      showAllNodesRef.current = false
    }
    prevPipeRef.current   = layers?.pipe
    prevStructRef.current = layers?.structure
    prevNodesRef.current  = layers?.nodes
  }, [layers?.pipe, layers?.structure, layers?.nodes])

  const hideNodeIds = useMemo(() => {
    if (!stageData) return null
    if (layers?.nodes === false || showAllNodesRef.current) return null
    const merged = new Set()
    if (layers?.pipe === false) {
      const ids = stageData.getPipeOnlyNodeIds?.()
      if (ids) for (const id of ids) merged.add(id)
    }
    if (layers?.structure === false) {
      const ids = stageData.getStructureOnlyNodeIds?.()
      if (ids) for (const id of ids) merged.add(id)
    }
    return merged.size > 0 ? merged : null
  }, [stageData, layers?.pipe, layers?.structure, layers?.nodes])

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
      // LineMaterial(Line2/LineSegments2) 들은 픽셀 단위 굵기 환산을 위해 resolution 을 직접 갱신해야 한다.
      const updateRes = (root) => {
        root?.traverse?.(obj => {
          if (obj?.material?.resolution?.set) obj.material.resolution.set(w, h)
        })
      }
      updateRes(polygonRef.current)
      updateRes(pipeDiamRef.current)
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

      const pickables = sceneDataRef.current.pickables
      const editState = editStateRef.current
      const hoistPickMode = editState.isTarget && editState.hoistPickEnabled && editState.hoistMode && e.shiftKey
      const rigidPickMode = !hoistPickMode && editState.enabled && editState.isTarget && (e.shiftKey || editState.hasPendingNodes)
      const nodeOnlyPickMode = hoistPickMode || rigidPickMode
      const targets = getPickTargets(pickables, pickFiltersRef.current, nodeOnlyPickMode)
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
        if (nodeOnlyPickMode) return
        onPick(null, e)
        return
      }

      const hit = hits[0]
      const obj = hit.object
      const iid = hit.instanceId

      // 편집 모드 미리보기에서 삭제된 (또는 통째로 사라진) 인스턴스는 picking 무시 —
      // scale 이 0.0001 이라 시각적으로 없는데 raycast 에 매우 정밀 클릭 시 잡힐 위험이 있음.
      const mask = editState.mask
      if (obj === pickables.nodes) {
        const nodeId = obj.userData.nodeIds?.[iid]
        if (mask?.deletedNodeIds?.has(nodeId)) {
          if (nodeOnlyPickMode) return
          onPick(null, e)
          return
        }
        // 권상 그룹 도형(직선/삼각형/사각형) 미리보기는 hoistGroups 에서 파생되므로
        // Shift+클릭 → addHoistNode (활성 그룹에 추가) 한 번이면 자동으로 갱신된다.
        // (별도의 polygon 누적 호출은 두지 않는다 — 그래야 그룹 전환 시 새 도형이 깔끔하게 시작되고
        //  HoistPositionPanel 에서 노드를 삭제하면 즉시 시각화가 비활성화된다.)
        if (hoistPickMode && nodeId != null) {
          // RBE(독립/종속) 연결 노드는 권상 후보에서 제외 — 강체 연결점에 권상을 걸면
          // 변형 가정과 충돌하므로 데이터 무결성 차원에서 차단하고 가이드 토스트로 안내.
          const sd = stageDataRef.current
          if (sd?.getRbeConnectedNodeIds?.()?.has(nodeId)) {
            editState.flashHoistGuide?.(`N${nodeId} 은 RBE 연결 노드라 권상 위치로 선택할 수 없습니다.`, 'noMode')
            return
          }
          editState.addHoistNode(nodeId)
          return
        }
        // 권상 모드 미선택 상태에서 Shift+클릭 — 가이드 토스트로 안내.
        // (편집 모드 ON 상태에서는 rigid 다중 선택 흐름이 우선이므로 토스트는 띄우지 않는다.)
        if (e.shiftKey && nodeId != null && editState.isTarget && editState.hoistPickEnabled && !editState.hoistMode && !editState.enabled) {
          editState.flashHoistGuide?.('권상 방식(Hydro 또는 Goliat)을 먼저 선택해 주세요.', 'noMode')
          return
        }
        // 편집 모드 + 마지막 단계 + Shift = 다중 선택 토글 (Inspector/Tooltip 으로 propagate 하지 않음)
        if (editState.enabled && editState.isTarget && e.shiftKey && nodeId != null) {
          editState.toggle(nodeId)
          return
        }
        // RBE 생성 노드 선택이 시작된 동안에는 일반 click 선택을 막는다.
        // 노란 선택 마크업만 유지하고, 파란 단일 선택 하이라이트/Inspector 선택으로 전파하지 않는다.
        if (nodeOnlyPickMode) {
          return
        }
        onPick({ type: 'node', nodeId }, e)
      } else if (obj === pickables.masses) {
        if (nodeOnlyPickMode) return
        const data = obj.userData.massData?.[iid]
        if (data && mask?.deletedMassIds?.has(data.id)) { onPick(null, e); return }
        if (data) onPick({ type: 'mass', ...data }, e)
        else onPick(null, e)
      } else if (obj.isLineSegments && obj.userData.rigidData) {
        if (nodeOnlyPickMode) return
        // hit.index = 정점 인덱스 (LineSegments 는 정점 2개당 1개 세그먼트 → /2 가 세그먼트 인덱스)
        const segIdx = (hit.index ?? 0) >> 1
        const data = obj.userData.rigidData[segIdx]
        if (data && mask?.fullyRemovedRbeIds?.has(data.id)) { onPick(null, e); return }
        if (data) onPick({ type: 'rigid', ...data }, e)
        else onPick(null, e)
      } else {
        if (nodeOnlyPickMode) return
        const data = obj.userData.elementData?.[iid]
        if (data && mask?.deletedElementIds?.has(data.id)) { onPick(null, e); return }
        // 편집 모드 + 마지막 단계 + Ctrl = element 다중 선택 토글 (일괄 삭제용)
        if (data && editState.enabled && editState.isTarget && e.ctrlKey) {
          editState.toggleMultiSelElement?.({ type: 'element', ...data })
          return
        }
        // 일반 단일 클릭 — 다중 선택 목록 초기화 후 단일 선택으로 전환
        if (data) {
          editState.clearMultiSelElements?.()
          onPick({ type: 'element', ...data }, e)
        } else {
          editState.clearMultiSelElements?.()
          onPick(null, e)
        }
      }
    }

    // ── Hover picking (호버 tooltip 용) ────────────────────────────────
    // 클릭(onPointerUp) 과 동일 raycast 흐름이지만 모드 분기 없이 단순 element/node/mass/rigid 정보만 추출.
    // RAF throttle 로 mousemove 에 비해 raycast 호출 빈도를 frame 당 최대 1회로 제한.
    // drag 중 / Shift·Alt modifier 누른 상태(편집·권상 모드) 에선 hover 비활성.
    const onHoverRef = { current: onHover }
    onHoverRef.current = onHover
    const hoverRafRef = { current: 0 }
    const lastMoveEventRef = { current: null }

    const computeHoverPick = (ev) => {
      if (!sceneDataRef.current?.pickables) return null
      const pickables = sceneDataRef.current.pickables
      if (ev.shiftKey || ev.altKey) return null  // 편집 모드 modifier 충돌 회피
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width)  * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = raycasterRef.current
      raycaster.setFromCamera(ndc, camera)
      const camDist = camera.position.distanceTo(controlsRef.current?.target ?? new THREE.Vector3())
      raycaster.params.Line.threshold = Math.max(0.05, camDist * 0.01)

      const targets = getPickTargets(pickables, pickFiltersRef.current, false)
      const isVisible = (t) => {
        if (t.visible === false) return false
        let p = t.parent
        while (p) { if (p.visible === false) return false; p = p.parent }
        return true
      }
      const hits = raycaster.intersectObjects(targets.filter(isVisible))
      if (hits.length === 0) return null

      const hit = hits[0]
      const obj = hit.object
      const iid = hit.instanceId
      const mask = editStateRef.current.mask

      if (obj === pickables.nodes) {
        const nodeId = obj.userData.nodeIds?.[iid]
        if (nodeId == null || mask?.deletedNodeIds?.has(nodeId)) return null
        return { type: 'node', nodeId }
      }
      if (obj === pickables.masses) {
        const data = obj.userData.massData?.[iid]
        if (!data || mask?.deletedMassIds?.has(data.id)) return null
        return { type: 'mass', ...data }
      }
      if (obj.isLineSegments && obj.userData.rigidData) {
        const segIdx = (hit.index ?? 0) >> 1
        const data = obj.userData.rigidData[segIdx]
        if (!data || mask?.fullyRemovedRbeIds?.has(data.id)) return null
        return { type: 'rigid', ...data }
      }
      const data = obj.userData.elementData?.[iid]
      if (!data || mask?.deletedElementIds?.has(data.id)) return null
      return { type: 'element', ...data }
    }

    const onPointerMove = (ev) => {
      if (pointerDownRef.current) return  // drag 중 hover 무시
      if (!onHoverRef.current) return
      lastMoveEventRef.current = ev
      if (hoverRafRef.current) return     // 다음 RAF 에서 일괄 처리
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = 0
        const lastEv = lastMoveEventRef.current
        if (!lastEv || !onHoverRef.current) return
        const pickInfo = computeHoverPick(lastEv)
        onHoverRef.current(pickInfo, pickInfo ? { x: lastEv.clientX, y: lastEv.clientY } : null)
      })
    }

    const onPointerLeave = () => {
      if (hoverRafRef.current) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = 0 }
      lastMoveEventRef.current = null
      if (onHoverRef.current) onHoverRef.current(null, null)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup',   onPointerUp)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)

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
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
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
    if (multiSelElemRef.current) {
      scene.remove(multiSelElemRef.current)
      disposeScene(multiSelElemRef.current)
      multiSelElemRef.current = null
    }
    if (addRigidRef.current) {
      scene.remove(addRigidRef.current)
      disposeScene(addRigidRef.current)
      addRigidRef.current = null
    }
    if (hoistRef.current) {
      scene.remove(hoistRef.current)
      disposeScene(hoistRef.current)
      hoistRef.current = null
    }
    if (cogRef.current) {
      scene.remove(cogRef.current)
      disposeScene(cogRef.current)
      cogRef.current = null
    }
    if (polygonRef.current) {
      scene.remove(polygonRef.current)
      disposeScene(polygonRef.current)
      polygonRef.current = null
    }
    if (levelPlateRef.current) {
      scene.remove(levelPlateRef.current)
      disposeScene(levelPlateRef.current)
      levelPlateRef.current = null
    }
    if (candidateNodesRef.current) {
      scene.remove(candidateNodesRef.current)
      disposeScene(candidateNodesRef.current)
      candidateNodesRef.current = null
    }
    if (groupCogRef.current) {
      scene.remove(groupCogRef.current)
      disposeScene(groupCogRef.current)
      groupCogRef.current = null
    }
    if (pipeDiamRef.current) {
      scene.remove(pipeDiamRef.current)
      disposeScene(pipeDiamRef.current)
      pipeDiamRef.current = null
    }
    if (resultWireRef.current) {
      scene.remove(resultWireRef.current)
      disposeScene(resultWireRef.current)
      resultWireRef.current = null
    }
    if (stabilityIssueRef.current) {
      scene.remove(stabilityIssueRef.current)
      disposeScene(stabilityIssueRef.current)
      stabilityIssueRef.current = null
    }
    if (slingAngleRef.current) {
      scene.remove(slingAngleRef.current)
      disposeScene(slingAngleRef.current)
      slingAngleRef.current = null
    }
    if (nastranResultRef.current) {
      scene.remove(nastranResultRef.current)
      disposeScene(nastranResultRef.current)
      nastranResultRef.current = null
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

      applyFullVisibility(sceneData, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask, hideNodeIds, displayStyle)

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
    applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask, hideNodeIds, displayStyle)
    requestRender()
  }, [layers, groupFilters, stageData, isolateSelection, selectedEntity, freeNodeFilters, deleteMask, hideNodeIds, displayStyle, requestRender])

  // ── Free Node filters ────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current || !freeNodeFilters) return
    applyFreeNodeFilters(sceneDataRef.current.pickables?.nodes, freeNodeFilters, hideNodeIds)
    // freeNode 필터 적용 후 deleteMask 도 다시 적용해 삭제된 노드가 다시 살아나지 않도록
    if (deleteMask) applyDeleteMask(sceneDataRef.current, deleteMask)
    requestRender()
  }, [freeNodeFilters, deleteMask, hideNodeIds, requestRender])

  // ── 권상 모드 RBE 노드 강조 ───────────────────────────────────────────
  // 권상 위치 설정(권상 방식 ON) 중에만 RBE 연결 노드를 연한 분홍으로 표시한다.
  // Node Check(colorMode='freeNode') 에서는 freeNode 색상 체계(빨강/노랑/보라)가 우선이므로
  // 분홍 강조를 적용하지 않고 RBE 노드는 normal 빨강 그대로 둔다 — 사용자 명시 요구.
  // stageData/renderMode/colorMode 가 바뀌면 scene 재빌드로 nodes mesh 가 새로 생성되므로
  // 그 값들도 dependency 에 포함.
  useEffect(() => {
    const nodes = sceneDataRef.current?.pickables?.nodes
    if (!nodes) return
    const active = isEditTargetStage && !!hoistMode && colorMode !== 'freeNode'
    applyHoistModeHighlight(nodes, active)
    requestRender()
  }, [hoistMode, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

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

  // ── Ctrl+Click 다중 선택 element overlay (주황 cylinder) ───────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (multiSelElemRef.current) {
      scene.remove(multiSelElemRef.current)
      disposeScene(multiSelElemRef.current)
      multiSelElemRef.current = null
    }
    if (!stageData || !editEnabled || !isEditTargetStage || !multiSelElements?.length) {
      requestRender()
      return
    }
    const ids = multiSelElements.map(e => e.id)
    const group = buildMultiSelElementHighlight(ids, stageData)
    if (group.children.length > 0) {
      scene.add(group)
      multiSelElemRef.current = group
    }
    requestRender()
  }, [multiSelElements, editEnabled, isEditTargetStage, stageData, requestRender])

  // ── Broken RBE 노란 overlay (편집 모드) ────────────────────────────────
  // colorMode/renderMode 변경으로 씬이 리빌드되면 brokenRbeRef 도 정리되므로 같은 dep 를 본다.
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
  }, [deleteMask, stageData, renderMode, colorMode, requestRender])

  // ── 권상 그룹 overlay ────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (hoistRef.current) {
      scene.remove(hoistRef.current)
      disposeScene(hoistRef.current)
      hoistRef.current = null
    }
    const hasNodes = Object.values(hoistGroups ?? {}).some(nodes => nodes?.length > 0)
    if (!stageData || !isEditTargetStage || !hasNodes) {
      requestRender()
      return
    }
    const group = buildHoistGroupHighlight(hoistGroups, stageData)
    if (group.children.length > 0) {
      scene.add(group)
      hoistRef.current = group
    }
    requestRender()
  }, [hoistGroups, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

  // ── addRigid 미리보기 overlay (노란 점선) ──────────────────────────────
  // colorMode/renderMode 변경 시 씬 리빌드 useEffect 가 addRigidRef 를 정리하므로
  // 같은 dep 를 여기서도 본다 → cleanup 후 곧바로 같은 frame 에 다시 빌드되어 미리보기가 보존된다.
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
  }, [deleteMask, stageData, renderMode, colorMode, requestRender])

  // ── Group visibility filters ──────────────────────────────────────────
  useEffect(() => {
    if (!sceneDataRef.current || !stageData) return
    applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask, hideNodeIds, displayStyle)
    requestRender()
  }, [groupFilters, stageData, layers, isolateSelection, selectedEntity, freeNodeFilters, deleteMask, hideNodeIds, requestRender])

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

    if (!layers?.cog || !stageData) {
      requestRender()
      return
    }
    const cogMm = getCogMm(stageSummary, stabilityReport, stageData)
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
    // renderMode/colorMode 변경 시 scene rebuild effect 가 cogRef 를 제거하므로
    // 같은 deps 를 본다 — 빠지면 3D 단면 등 다른 모드 전환 시 마커가 사라진다.
  }, [layers?.cog, stageData, stageSummary, stabilityReport, renderMode, colorMode, requestRender])

  // ── 권상 그룹 도형(직선/삼각형/사각형) 미리보기 ────────────────────────
  // hoistGroups 에서 직접 파생되므로 노드 추가/삭제·그룹 전환에 즉시 반응한다.
  // renderMode/colorMode 변경 시 씬 리빌드 useEffect 가 polygon ref 도 정리하므로 같은 dep 를 본다.
  useEffect(() => {
    const scene    = sceneRef.current
    const renderer = rendererRef.current
    if (!scene) return

    if (polygonRef.current) {
      scene.remove(polygonRef.current)
      disposeScene(polygonRef.current)
      polygonRef.current = null
    }

    const hasShape = Object.values(hoistGroups ?? {}).some(nodes => (nodes?.length ?? 0) >= 2)
    if (!stageData || !isEditTargetStage || !hasShape) {
      requestRender()
      return
    }

    const w = renderer?.domElement?.clientWidth  ?? 1
    const h = renderer?.domElement?.clientHeight ?? 1
    const overlay = buildPolygonOverlay(hoistGroups, stageData, { width: w, height: h })
    if (overlay.children.length > 0) {
      scene.add(overlay)
      polygonRef.current = overlay
    }
    requestRender()
  }, [hoistGroups, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

  // ── 자세안정성 평가 결과 wire overlay ─────────────────────────────
  // ModuleAnalysis.Cli 가 _stability.json 의 visualization.wires 로 산출한 최종 wire 를 표시한다.
  // 분석 후 사용자가 추가로 그룹을 삭제하면 wire 는 stale (좌표가 삭제된 노드 위치) 이므로
  // 그룹 삭제 intent 가 1개라도 있으면 overlay 를 숨겨 즉시 반영되도록 한다.
  useEffect(() => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene) return

    if (resultWireRef.current) {
      scene.remove(resultWireRef.current)
      disposeScene(resultWireRef.current)
      resultWireRef.current = null
    }

    const wires = stabilityReport?.visualization?.wires
    // 과거에는 사용자가 노드/요소를 하나라도 삭제하면 deleteMask 가 채워져서
    // wire overlay 를 전부 숨겼다. 그러나 백엔드가 _edited.bdf 기반으로 자세 안정성을
    // 평가하도록 흐름이 바뀐 뒤로는 stability.json 의 wire 가 이미 편집 반영 상태이므로
    // 추가로 숨길 필요가 없다 — 회귀를 막기 위해 hasNewDeletes 체크를 제거한다.
    if (!stageData || !isEditTargetStage || !Array.isArray(wires) || wires.length === 0) {
      requestRender()
      return
    }

    const overlay = buildStabilityWireOverlay(stabilityReport, stageData, {
      width: renderer?.domElement?.clientWidth ?? 1,
      height: renderer?.domElement?.clientHeight ?? 1,
    })
    if (overlay.children.length > 0) {
      scene.add(overlay)
      resultWireRef.current = overlay
    }
    requestRender()
  }, [stabilityReport, isEditTargetStage, stageData, renderMode, colorMode, deleteMask, requestRender])

  // ── 자세안정성 경고 Element 위치 표시 ─────────────────────────────
  // 분석 이후 사용자가 추가로 삭제한 element 는 overlay 에서 즉시 제외한다.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (stabilityIssueRef.current) {
      scene.remove(stabilityIssueRef.current)
      disposeScene(stabilityIssueRef.current)
      stabilityIssueRef.current = null
    }

    const hasIssues = hasStabilityIssueElements(stabilityReport)
    if (!layers?.stabilityIssues || !stageData || !isEditTargetStage || !hasIssues) {
      requestRender()
      return
    }

    const overlay = buildStabilityIssueOverlay(stabilityReport, stageData, {
      deletedElementIds: deleteMask?.deletedElementIds ?? null,
    })
    if (overlay.children.length > 0) {
      scene.add(overlay)
      stabilityIssueRef.current = overlay
    }
    requestRender()
  }, [layers?.stabilityIssues, stabilityReport, isEditTargetStage, stageData, renderMode, colorMode, deleteMask, requestRender])

  // ── 슬링각 60° 미만 와이어 표시 (Stage 4) ─────────────────────────
  // stage data 의 element 가 아니므로 lug↔apex 좌표를 직접 LineSegments 로 그린다.
  // stabilityIssues 토글(LayerPanel "간섭/경고 Element")과 같은 가시성을 따른다.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (slingAngleRef.current) {
      scene.remove(slingAngleRef.current)
      disposeScene(slingAngleRef.current)
      slingAngleRef.current = null
    }

    if (!layers?.stabilityIssues || !stageData || !isEditTargetStage || !hasSlingAngleIssues(stabilityReport)) {
      requestRender()
      return
    }

    const overlay = buildSlingAngleOverlay(stabilityReport, stageData)
    if (overlay.children.length > 0) {
      scene.add(overlay)
      slingAngleRef.current = overlay
    }
    requestRender()
  }, [layers?.stabilityIssues, stabilityReport, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

  // ── Unit 구조 해석 결과 색맵핑 overlay ─────────────────────────────
  // 부재: σ vs 허용응력 → 빨강/파랑.  와이어: 압축/인장/결과누락 → 노랑/녹색/회색.
  // 마지막 단계(편집 대상) viewport 에서만 표시. 사용자가 분석 후 삭제한 element 는 자동 제외.
  const unitStructuralResult = useUnitStructuralStore(s => s.result)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (nastranResultRef.current) {
      scene.remove(nastranResultRef.current)
      disposeScene(nastranResultRef.current)
      nastranResultRef.current = null
    }

    if (!unitStructuralResult || !stageData || !isEditTargetStage) {
      requestRender()
      return
    }

    // stability report 의 apex 좌표를 groupId 기준 맵으로 만들어 전달 — wire CROD 는
    // 사용자 stage JSON 에 들어가 있지 않기 때문에 chain grouping 으로 좌표를 못 찾을 때
    // apex(groupId) + lug(stage nodeMap)로 fallback 위치 계산에 사용된다.
    const apexCoordByGroup = {}
    const apexes = stabilityReport?.visualization?.apexes
    if (Array.isArray(apexes)) {
      for (const a of apexes) {
        const gid = Number(a?.groupId)
        const p = a?.pointMm
        if (Number.isInteger(gid) && p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
          apexCoordByGroup[gid] = { x: p.x, y: p.y, z: p.z }
        }
      }
    }

    const overlay = buildNastranResultOverlay(unitStructuralResult, stageData, {
      deletedElementIds: deleteMask?.deletedElementIds ?? null,
      apexCoordByGroup,
    })
    if (overlay.children.length > 0) {
      scene.add(overlay)
      nastranResultRef.current = overlay
    }
    requestRender()
  }, [unitStructuralResult, stageData, stabilityReport, isEditTargetStage, renderMode, colorMode, deleteMask, requestRender])

  // ── 활성 권상 그룹의 Z-레벨 가이드 평판 (첫 노드의 Z 에 모델 XY 전범위 평판) ─
  // "비슷한 level 의 노드를 직관적으로" 고를 수 있게 시각 가이드를 제공.
  // 활성 그룹에만 표시되며 다른 그룹으로 전환하면 자동으로 그 그룹의 평판으로 갱신된다.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (levelPlateRef.current) {
      scene.remove(levelPlateRef.current)
      disposeScene(levelPlateRef.current)
      levelPlateRef.current = null
    }
    const activeNodes = hoistGroups?.[activeHoistGroupId] ?? []
    if (!stageData || !isEditTargetStage || activeNodes.length === 0) {
      requestRender()
      return
    }
    const plate = buildHoistLevelPlate(hoistGroups, stageData, activeHoistGroupId)
    if (plate.children.length > 0) {
      scene.add(plate)
      levelPlateRef.current = plate
    }
    requestRender()
  }, [hoistGroups, activeHoistGroupId, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

  // ── 가상판 ±Tolerance 이내 같은 레벨의 후보 노드 강조 ──────────────────
  // 평판(활성 그룹 첫 노드 Z)에서 |Δz| ≤ Tolerance 인 같은 레벨 노드를 후보로 강조해
  // 사용자가 그 후보 중에서 권상점을 고르도록 돕는다. Tolerance 는 사용자 지정값(hoistToleranceMm)
  // 우선, 없으면 모델 높이 기반 자동값. 평판과 같은 dep/조건 + Tolerance 변경 시 갱신된다.
  // (X·Y 무관 Z 단면 — 과거 전역 위/아래 레벨 방식의 구역 의존 버그를 제거.)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (candidateNodesRef.current) {
      scene.remove(candidateNodesRef.current)
      disposeScene(candidateNodesRef.current)
      candidateNodesRef.current = null
    }
    const activeNodes = hoistGroups?.[activeHoistGroupId] ?? []
    if (!stageData || !isEditTargetStage || activeNodes.length === 0) {
      requestRender()
      return
    }
    const candidates = buildHoistCandidateNodes(hoistGroups, stageData, activeHoistGroupId, hoistToleranceMm)
    if (candidates.children.length > 0) {
      scene.add(candidates)
      candidateNodesRef.current = candidates
    }
    requestRender()
  }, [hoistGroups, activeHoistGroupId, hoistToleranceMm, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

  // ── 권상 그룹 도형의 무게중심 마커 (>=2 노드일 때 등장) ────────────────
  // 모델 전체 무게중심과 그룹별 무게중심의 배치를 비교할 수 있게 한다.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (groupCogRef.current) {
      scene.remove(groupCogRef.current)
      disposeScene(groupCogRef.current)
      groupCogRef.current = null
    }
    const hasShape = Object.values(hoistGroups ?? {}).some(nodes => (nodes?.length ?? 0) >= 2)
    if (!stageData || !isEditTargetStage || !hasShape) {
      requestRender()
      return
    }
    const cogs = buildHoistGroupCog(hoistGroups, stageData)
    if (cogs.children.length > 0) {
      scene.add(cogs)
      groupCogRef.current = cogs
    }
    requestRender()
  }, [hoistGroups, isEditTargetStage, stageData, renderMode, colorMode, requestRender])

  // ── 배관 외경 비교 overlay (사용자 입력 임계값 기준) ───────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (pipeDiamRef.current) {
      scene.remove(pipeDiamRef.current)
      disposeScene(pipeDiamRef.current)
      pipeDiamRef.current = null
    }
    if (!stageData || !pipeDiameterThreshold) {
      requestRender()
      return
    }
    const renderer = rendererRef.current
    const w = renderer?.domElement?.clientWidth  ?? 1
    const h = renderer?.domElement?.clientHeight ?? 1
    const overlay = buildPipeDiameterOverlay(stageData, pipeDiameterThreshold, { width: w, height: h })
    if (overlay.children.length > 0) {
      scene.add(overlay)
      pipeDiamRef.current = overlay
    }
    requestRender()
  }, [pipeDiameterThreshold, stageData, renderMode, colorMode, requestRender])

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
      if (sceneDataRef.current) applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask, hideNodeIds, displayStyle)
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
    if (sceneDataRef.current) applyFullVisibility(sceneDataRef.current, layers, groupFilters, stageData, isolateSelection, selectedElementIdsRef.current, freeNodeFilters, deleteMask, hideNodeIds, displayStyle)
    requestRender()
  }, [selectedEntity, stageData, layers, isolateSelection, displayStyle, requestRender]) // eslint-disable-line react-hooks/exhaustive-deps

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

function applyFullVisibility(sceneData, layerState, groupFilters, stageData, isolateSelection, selectedElementIds, freeNodeFilters, deleteMask, hideNodeIds, displayStyle = 'shaded') {
  if (!sceneData) return
  applyLayers(sceneData.layers, layerState)
  applyDisplayStyle(sceneData.layers, displayStyle)
  applyGroupFilters(sceneData.pickables, groupFilters, stageData)
  // NodePoints 는 매번 freeNodeFilters 로 복원해야 — applyDeleteMask 가 hide 한 노드를
  // 마스크 해제 시 (편집 모드 OFF 등) 다시 보이게 하려면 이 단계가 필수.
  if (freeNodeFilters) applyFreeNodeFilters(sceneData.pickables?.nodes, freeNodeFilters, hideNodeIds)
  applyElementIsolation(sceneData.layers.structure, isolateSelection, selectedElementIds)
  applyElementIsolation(sceneData.layers.pipe, isolateSelection, selectedElementIds)
  // 편집 모드 deleteMask 는 항상 마지막에 적용 — 위 단계가 originalMatrices 로 인스턴스를 복원하기 때문
  if (deleteMask) applyDeleteMask(sceneData, deleteMask)
}

function getPickTargets(pickables, pickFilters, forceNodesOnly = false) {
  if (!pickables) return []
  const { structure, pipe, nodes, beams, masses, rigidLines = [] } = pickables
  if (forceNodesOnly) return [nodes].filter(Boolean)

  const allowNode = pickFilters?.node !== false
  const allowElement = pickFilters?.element !== false
  const allowRigid = pickFilters?.rigid !== false
  const allowMass = pickFilters?.mass !== false

  const targets = []
  if (allowElement) {
    if (beams) targets.push(...beams)
    else targets.push(structure, pipe)
  }
  if (allowNode) targets.push(nodes)
  if (allowMass) targets.push(masses)
  if (allowRigid) targets.push(...rigidLines)
  return targets.filter(Boolean)
}

function applyLayers(threeLayerMap, layerState) {
  if (!layerState) return
  for (const key of LAYER_KEYS) {
    if (threeLayerMap[key]) threeLayerMap[key].visible = layerState[key] ?? true
  }
}

function applyDisplayStyle(threeLayerMap, style) {
  if (!threeLayerMap) return

  const editableLayers = [
    threeLayerMap.structure,
    threeLayerMap.pipe,
    threeLayerMap.nodes,
    threeLayerMap.masses,
  ].filter(Boolean)

  for (const root of editableLayers) {
    root.traverse?.(obj => {
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []
      for (const mat of mats) applyMaterialDisplayStyle(mat, style)
    })
  }

  if (style === 'nodeOnly') {
    for (const key of ['structure', 'pipe', 'rigids', 'masses', 'boundaries', 'uboltMarkers', 'uboltDof']) {
      if (threeLayerMap[key]) threeLayerMap[key].visible = false
    }
  }
}

function applyMaterialDisplayStyle(mat, style) {
  if (!mat) return
  if (!mat.userData.viewerOriginalDisplay) {
    mat.userData.viewerOriginalDisplay = {
      wireframe: !!mat.wireframe,
      transparent: !!mat.transparent,
      opacity: mat.opacity,
      depthWrite: mat.depthWrite,
      depthTest: mat.depthTest,
    }
  }

  const o = mat.userData.viewerOriginalDisplay
  mat.wireframe = o.wireframe
  mat.transparent = o.transparent
  mat.opacity = o.opacity
  mat.depthWrite = o.depthWrite
  mat.depthTest = o.depthTest

  if (style === 'wire') {
    mat.wireframe = true
    mat.transparent = false
    mat.opacity = 1
    mat.depthWrite = true
  } else if (style === 'xray') {
    mat.wireframe = false
    mat.transparent = true
    mat.opacity = 0.32
    mat.depthWrite = false
    mat.depthTest = true
  }
  mat.needsUpdate = true
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

function getCogMm(stageSummary, stabilityReport, stageData) {
  const fromSummary = stageSummary?.massProperties?.centerOfGravityMm
  if (isCog(fromSummary)) return fromSummary

  const fromStability = stabilityReport?.input?.centerOfGravityMm
  if (isCog(fromStability)) return fromStability

  const fromPosture = stabilityReport?.model?.centerOfGravityMm
  if (isCog(fromPosture)) return fromPosture

  const fallback = computeStageCogFallback(stageData)
  return isCog(fallback) ? fallback : null
}

function isCog(v) {
  return v
    && Number.isFinite(v.x)
    && Number.isFinite(v.y)
    && Number.isFinite(v.z)
}

function computeStageCogFallback(stageData) {
  if (!stageData || !Array.isArray(stageData.pointMasses) || stageData.pointMasses.length === 0) return null
  let total = 0
  const acc = { x: 0, y: 0, z: 0 }
  for (const pm of stageData.pointMasses) {
    const n = stageData.nodeMap?.get(pm.nodeId)
    const mass = Number(pm.mass)
    if (!n || !Number.isFinite(mass) || mass <= 0) continue
    total += mass
    acc.x += n.x * mass
    acc.y += n.y * mass
    acc.z += n.z * mass
  }
  if (total <= 0) return null
  return { x: acc.x / total, y: acc.y / total, z: acc.z / total }
}

function hasStabilityIssueElements(report) {
  const warnings = report?.overall?.userSummary?.warnings
  if (Array.isArray(warnings) && warnings.some(w => Number.isInteger(Number(w?.metrics?.elementId)))) {
    return true
  }
  const stages = Array.isArray(report?.stages) ? report.stages : []
  return stages.some(s => Array.isArray(s?.conflicts) && s.conflicts.some(c => Number.isInteger(Number(c?.elementId))))
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
