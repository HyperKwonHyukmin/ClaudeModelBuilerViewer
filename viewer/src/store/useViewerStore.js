import { create } from 'zustand'

const DEFAULT_LAYERS = {
  structure:   true,
  pipe:        true,
  nodes:       true,
  rigids:      true,
  masses:      false,
  boundaries:  true,
  diagnostics: false,
}

let nextId = 1

export const useViewerStore = create((set, get) => ({
  // Viewports: start with one
  viewports: [{ id: nextId++, stageIndex: 0 }],

  addViewport: () => {
    if (get().viewports.length >= 4) return
    set(s => ({ viewports: [...s.viewports, { id: nextId++, stageIndex: 0 }] }))
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

  // Called when new stages are loaded — clamp all viewports to index 0
  resetViewportStages: () => {
    set(s => ({
      viewports: s.viewports.map(v => ({ ...v, stageIndex: 0 })),
    }))
  },

  // Active viewport (for inspector panel)
  activeViewportId: 1,
  setActiveViewport: (id) => set({ activeViewportId: id }),

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

  // Beam/node color mode
  colorMode: 'category',   // 'category' | 'freeNode'
  setColorMode: (mode) => set({ colorMode: mode }),

  // Free Node 필터 (colorMode === 'freeNode' 일 때 사용)
  freeNodeFilters: { normal: true, free: true, orphan: true },
  toggleFreeNodeFilter: (key) => {
    set(s => ({ freeNodeFilters: { ...s.freeNodeFilters, [key]: !s.freeNodeFilters[key] } }))
  },
}))
