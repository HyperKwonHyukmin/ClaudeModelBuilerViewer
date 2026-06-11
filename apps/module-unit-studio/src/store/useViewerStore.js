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
  sidebarWidth: 190,    // Sidebar.jsx DEFAULT_WIDTH 와 동일
  inspectorWidth: 20,   // InspectorPanel collapsed 폭 (펼치면 300+)
}

let nextId = 1

export const useViewerStore = create((set, get) => ({
  // Viewports: start with one
  viewports: [{ id: nextId++, stageIndex: 0, ...DEFAULT_VP_COLOR }],

  // ── 레이아웃 폭 동기화 (Sidebar / InspectorPanel → dock) ──
  layoutBounds: { ...DEFAULT_LAYOUT_BOUNDS },
  setSidebarWidth: (w) => set(s => ({ layoutBounds: { ...s.layoutBounds, sidebarWidth: Math.max(0, w | 0) } })),
  setInspectorWidth: (w) => set(s => ({ layoutBounds: { ...s.layoutBounds, inspectorWidth: Math.max(0, w | 0) } })),

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

  // Camera sync
  cameraLinked: false,
  toggleCameraLink: () => set(s => ({ cameraLinked: !s.cameraLinked })),

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
      inspectorTab: '메타',
      activeMode: 'model',
      layers: { ...DEFAULT_LAYERS },
      cameraLinked: false,
      pickedEntity: null,
      renderMode: 'cylinder',
    })
  },
}))
