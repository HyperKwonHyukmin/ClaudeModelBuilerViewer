import { create } from 'zustand'

const DEFAULT_LAYERS = {
  structure:  true,
  pipe:       true,
  nodes:      false,
  rigids:     true,
  masses:     true,
  boundaries: true,
  welds:      true,
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
}))
