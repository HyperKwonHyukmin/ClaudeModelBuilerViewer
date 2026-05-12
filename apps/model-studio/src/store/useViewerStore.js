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
  cog:          false,   // 기본 OFF — 무게중심 마커. 00_StageSummary.json 이 있을 때만 의미있음
}

const DEFAULT_VP_COLOR = {
  colorMode: 'category',
  freeNodeFilters: { normal: true, free: true, orphan: true },
  groupFilters: {},
}

let nextId = 1

export const useViewerStore = create((set, get) => ({
  // Viewports: start with one
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

  // Active viewport (for inspector panel)
  activeViewportId: 1,
  setActiveViewport: (id) => set({ activeViewportId: id }),

  // Inspector panel tab
  inspectorTab: '메타',
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  // Layer visibility
  layers: { ...DEFAULT_LAYERS },
  toggleLayer: (key) => {
    set(s => ({ layers: { ...s.layers, [key]: !s.layers[key] } }))
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
      layers: { ...DEFAULT_LAYERS },
      cameraLinked: false,
      pickedEntity: null,
      renderMode: 'cylinder',
    })
  },
}))
