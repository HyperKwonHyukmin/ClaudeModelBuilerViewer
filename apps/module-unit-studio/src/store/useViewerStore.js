import { create } from 'zustand'

const DEFAULT_LAYERS = {
  structure:    true,
  pipe:         true,
  nodes:        true,
  rigids:       true,
  masses:       false,
  boundaries:   false,   // 기본 OFF — 경계조건 다이아몬드는 검증 단계에서만 켬
  uboltMarkers: false,   // 기본 OFF — U-bolt 위치 마커는 필요 시 켬
  uboltDof:     false,   // 기본 OFF — DOF 검증 필요할 때만 켜는 라벨 오버레이
  cog:          true,    // 기본 ON — 무게중심 마커 (00_StageSummary.json 이 없으면 ThreeViewport 가 자동으로 no-op)
  stabilityIssues: true, // 기본 ON — 자세안정성 결과의 wire 간섭 Element 자동 표시
}

const DEFAULT_VP_COLOR = {
  colorMode: 'category',
  freeNodeFilters: { normal: true, free: true, orphan: true },
  groupFilters: {},
}

// UnitStructuralResultDock 가 Sidebar/InspectorPanel 폭에 동적으로 맞춰 좌·우를 비우기 위해
// 두 패널이 자기 현재 폭을 여기에 publish 한다.
const DEFAULT_LAYOUT_BOUNDS = {
  sidebarWidth: 301,    // Sidebar.jsx DEFAULT_WIDTH 와 동일 (228 → +20% → +10% ≈ 301)
  inspectorWidth: 0,    // 우측 인스펙터는 뷰포트 위 floating 으로 전환 — 더 이상 dock 폭을 차지하지 않는다.
}

const DEFAULT_PICK_FILTERS = {
  node: true,
  element: true,
  rigid: true,
  mass: true,
}

let nextId = 1

// ── 고정 도크(우측 표시·정보 / 하단 결과·입력감사·메시지) — 열림·탭·높이를 localStorage 에 영속 ──
// open 은 세션마다 접힌 채로 시작한다(모델을 열기 전 도크가 펼쳐져 있으면 빈 패널만 보인다).
const RIGHT_DOCK_KEY = 'moduleunit.rightDock.v1'
const BOTTOM_DOCK_KEY = 'moduleunit.bottomDock.v1'
const DEFAULT_RIGHT_DOCK = { open: false, tab: 'display' }       // tab: 'display' | 'info'
const DEFAULT_BOTTOM_DOCK = { open: false, tab: 'result', height: 320, maximized: false }  // 'result' | 'audit' | 'messages'
export const BOTTOM_DOCK_MIN_H = 160
function loadDock(key, dflt) {
  try {
    const raw = localStorage.getItem(key)
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' ? { ...dflt, ...v, open: false, maximized: false } : { ...dflt }
  } catch { return { ...dflt } }
}
function persistDock(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* no-op */ }
}

export const useViewerStore = create((set, get) => ({
  // 뷰포트 — 기본 1개, 우측 도크의 "뷰 추가"로 최대 4분할.
  // (2026-06-23 `2f6281f` 에서 단일 뷰포트로 축소했다가, ModelBuilderStudio 와 구성을 맞추는
  //  2026-09-11 작업에서 되살렸다. 카메라 동기화는 hooks/useCameraSync.js — 직교 카메라라
  //  position/quaternion/up/target 뿐 아니라 camera.zoom 까지 맞춰야 배율이 같아진다.)
  viewports: [{ id: nextId++, stageIndex: 0, ...DEFAULT_VP_COLOR }],

  addViewport: () => {
    if (get().viewports.length >= 4) return
    set(s => ({ viewports: [...s.viewports, { id: nextId++, stageIndex: 0, ...DEFAULT_VP_COLOR }] }))
  },

  removeViewport: (id) => {
    set(s => {
      if (s.viewports.length <= 1) return s
      const viewports = s.viewports.filter(v => v.id !== id)
      const activeId = s.activeViewportId === id ? viewports[0]?.id : s.activeViewportId
      return { viewports, activeViewportId: activeId }
    })
  },

  // 여러 뷰포트의 카메라를 함께 움직인다.
  cameraLinked: false,
  toggleCameraLink: () => set(s => ({ cameraLinked: !s.cameraLinked })),

  // ── 우측 도크(표시·정보) ────────────────────────────────────────────────
  rightDock: loadDock(RIGHT_DOCK_KEY, DEFAULT_RIGHT_DOCK),
  setRightDock: (patch) => set(s => {
    const rightDock = { ...s.rightDock, ...patch }
    persistDock(RIGHT_DOCK_KEY, rightDock)
    return { rightDock }
  }),
  toggleRightDock: () => set(s => {
    const rightDock = { ...s.rightDock, open: !s.rightDock.open }
    persistDock(RIGHT_DOCK_KEY, rightDock)
    return { rightDock }
  }),
  // 같은 탭을 다시 누르면 접힌다.
  openRightDockTab: (tab) => set(s => {
    const same = s.rightDock.open && s.rightDock.tab === tab
    const rightDock = { ...s.rightDock, open: !same, tab }
    persistDock(RIGHT_DOCK_KEY, rightDock)
    return { rightDock }
  }),

  // ── 하단 도크(결과·입력 감사·메시지) ───────────────────────────────────
  bottomDock: loadDock(BOTTOM_DOCK_KEY, DEFAULT_BOTTOM_DOCK),
  setBottomDock: (patch) => set(s => {
    const next = { ...s.bottomDock, ...patch }
    if (patch && 'height' in patch) next.height = Math.max(BOTTOM_DOCK_MIN_H, Number(patch.height) || BOTTOM_DOCK_MIN_H)
    persistDock(BOTTOM_DOCK_KEY, next)
    return { bottomDock: next }
  }),
  toggleBottomDock: () => set(s => {
    const bottomDock = { ...s.bottomDock, open: !s.bottomDock.open }
    persistDock(BOTTOM_DOCK_KEY, bottomDock)
    return { bottomDock }
  }),
  openBottomDockTab: (tab) => set(s => {
    const same = s.bottomDock.open && s.bottomDock.tab === tab
    const bottomDock = { ...s.bottomDock, open: !same, tab }
    persistDock(BOTTOM_DOCK_KEY, bottomDock)
    return { bottomDock }
  }),
  toggleBottomDockMax: () => set(s => {
    const bottomDock = { ...s.bottomDock, open: true, maximized: !s.bottomDock.maximized }
    persistDock(BOTTOM_DOCK_KEY, bottomDock)
    return { bottomDock }
  }),
  // 결과 도착 등 자동 펼침 — 이미 더 크게 두었으면 높이는 그대로.
  openBottomDockAtLeast: (tab, minHeight) => set(s => {
    const height = Math.max(s.bottomDock.height, Number(minHeight) || 0)
    const bottomDock = { ...s.bottomDock, open: true, tab, height }
    persistDock(BOTTOM_DOCK_KEY, bottomDock)
    return { bottomDock }
  }),

  // ── 레이아웃 폭 동기화 (Sidebar / InspectorPanel → dock) ──
  layoutBounds: { ...DEFAULT_LAYOUT_BOUNDS },
  setSidebarWidth: (w) => set(s => ({ layoutBounds: { ...s.layoutBounds, sidebarWidth: Math.max(0, w | 0) } })),
  setInspectorWidth: (w) => set(s => ({ layoutBounds: { ...s.layoutBounds, inspectorWidth: Math.max(0, w | 0) } })),

  setViewportStage: (id, stageIndex) => {
    set(s => ({
      viewports: s.viewports.map(v => v.id === id ? { ...v, stageIndex } : v),
    }))
  },

  // Called when new stages are loaded — set all viewports to the given stage index (default 0)
  resetViewportStages: (stageIndex = 0) => {
    set(s => ({
      viewports: s.viewports.map(v => ({ ...v, stageIndex })),
    }))
  },

  // Per-viewport color mode
  setViewportColorMode: (id, mode) => {
    set(s => ({
      viewports: s.viewports.map(v => v.id === id ? { ...v, colorMode: mode, groupFilters: {} } : v),
    }))
  },

  // Per-viewport free node filter toggle
  toggleViewportFreeNodeFilter: (id, key) => {
    set(s => ({
      viewports: s.viewports.map(v =>
        v.id === id
          ? { ...v, freeNodeFilters: { ...v.freeNodeFilters, [key]: !v.freeNodeFilters[key] } }
          : v
      ),
    }))
  },

  // Per-viewport group filter toggle
  toggleViewportGroupFilter: (id, key) => {
    set(s => ({
      viewports: s.viewports.map(v =>
        v.id === id
          ? { ...v, groupFilters: { ...v.groupFilters, [key]: !(v.groupFilters[key] ?? true) } }
          : v
      ),
    }))
  },

  // Per-viewport set all group filters
  setAllViewportGroupFilters: (id, visible, groups, maxIndividual) => {
    const filters = {}
    const top = Math.min(groups.length, maxIndividual)
    for (let i = 0; i < top; i++) filters[i] = visible
    if (groups.length > maxIndividual) filters['others'] = visible
    set(s => ({
      viewports: s.viewports.map(v => v.id === id ? { ...v, groupFilters: filters } : v),
    }))
  },

  // 단독 뷰 — soloKey(개별 index 또는 'others') 그룹만 보이고 나머지는 모두 숨긴다.
  // Edit 모드 그룹 관리자의 "단독 뷰" 버튼에서 사용.
  soloViewportGroup: (id, soloKey, groups, maxIndividual) => {
    const filters = {}
    const top = Math.min(groups.length, maxIndividual)
    for (let i = 0; i < top; i++) filters[i] = (i === soloKey)
    if (groups.length > maxIndividual) filters['others'] = (soloKey === 'others')
    set(s => ({
      viewports: s.viewports.map(v => v.id === id ? { ...v, groupFilters: filters } : v),
    }))
  },

  // Active viewport (for inspector panel)
  activeViewportId: 1,
  setActiveViewport: (id) => set({ activeViewportId: id }),

  // Inspector panel tab
  inspectorTab: '메타',
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  // 상단 메뉴바 활성 모드 — 좌측 패널(LeftDock) 분기 결정. 'model'|'edit'|'analyze'
  activeMode: 'model',
  setActiveMode: (mode) => set({ activeMode: mode }),

  // Layer visibility
  layers: { ...DEFAULT_LAYERS },
  toggleLayer: (key) => {
    set(s => ({ layers: { ...s.layers, [key]: !s.layers[key] } }))
  },
  // 명시적 ON/OFF 설정 — 부재 종류(구조/배관) 단독 뷰처럼 값을 직접 지정해야 할 때 사용.
  setLayer: (key, on) => {
    set(s => ({ layers: { ...s.layers, [key]: !!on } }))
  },

  // CAE-style display and picking controls
  displayStyle: 'shaded', // 'shaded' | 'wire' | 'xray' | 'nodeOnly'
  setDisplayStyle: (style) => set({ displayStyle: style }),

  pickFilters: { ...DEFAULT_PICK_FILTERS },
  setPickTarget: (target) => set({ pickFilters: Object.fromEntries(
    Object.keys(DEFAULT_PICK_FILTERS).map(key => [key, target === 'all' || target === key]),
  ) }),
  togglePickFilter: (key) => {
    set(s => ({ pickFilters: { ...s.pickFilters, [key]: !s.pickFilters[key] } }))
  },

  // Picked entity from raycaster (null = nothing selected)
  pickedEntity: null,
  setPickedEntity: (entity) => set({ pickedEntity: entity }),
  clearPickedEntity: () => set({ pickedEntity: null }),

  isolateSelection: false,
  toggleIsolateSelection: () => set(s => ({ isolateSelection: !s.isolateSelection })),

  focusSelectionRequest: 0,
  focusPickedEntity: () => set(s => ({ focusSelectionRequest: s.focusSelectionRequest + 1 })),

  // Beam render mode (global — applies to all viewports)
  renderMode: 'cylinder',  // 'cylinder' | 'section3d'
  setRenderMode: (mode) => set({ renderMode: mode }),

  reset: () => {
    const id = nextId++
    set({
      viewports: [{ id, stageIndex: 0, ...DEFAULT_VP_COLOR }],
      activeViewportId: id,
      cameraLinked: false,
      inspectorTab: '메타',
      activeMode: 'model',
      layers: { ...DEFAULT_LAYERS },
      displayStyle: 'shaded',
      pickFilters: { ...DEFAULT_PICK_FILTERS },
      pickedEntity: null,
      renderMode: 'cylinder',
      isolateSelection: false,        // 모델 전환 시 격리 모드 잔류로 새 모델이 통째로 은폐되는 버그 방지
      focusSelectionRequest: 0,       // 포커스 요청 카운터도 새 모델 로드 시 초기화
    })
  },
}))
