import * as THREE from 'three'
import { buildBeamMesh } from './BeamMesh.js'
import { buildBeamMesh3D } from './BeamMesh3D.js'
import { buildNodePoints } from './NodePoints.js'
import { buildRigidMesh } from './RigidMesh.js'
import { buildMassMarkers } from './MassMarkers.js'
import { buildBoundaryMarkers } from './BoundaryMarkers.js'

/**
 * Builds a complete scene graph for one pipeline stage.
 *
 * Returns:
 *   root      — THREE.Group to add to scene
 *   layers    — named Object3D references for individual visibility toggling
 *   pickables — { structure, pipe, nodes } for raycaster (cylinder mode)
 *               { beams[], nodes } for raycaster (section3d mode)
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {'category'|'freeNode'} [colorMode='category']
 * @param {'cylinder'|'section3d'} [renderMode='cylinder']
 * @returns {{ root: THREE.Group, layers: object, pickables: object }}
 */
export function buildScene(stageData, colorMode = 'category', renderMode = 'cylinder') {
  const nodes      = buildNodePoints(stageData, colorMode)
  const rigids     = buildRigidMesh(stageData)
  const masses     = buildMassMarkers(stageData)
  const boundaries = buildBoundaryMarkers(stageData)
  if (renderMode === 'section3d') {
    const { structureGroup, pipeGroup, allBeamMeshes } = buildBeamMesh3D(stageData, colorMode)
    const root = new THREE.Group()
    root.add(structureGroup, pipeGroup, nodes, rigids, masses, boundaries)
    return {
      root,
      layers: { structure: structureGroup, pipe: pipeGroup, nodes, rigids, masses, boundaries },
      pickables: { beams: allBeamMeshes, nodes },
    }
  }

  // Default: cylinder mode
  const { structure, pipe } = buildBeamMesh(stageData, colorMode)
  const root = new THREE.Group()
  root.add(structure, pipe, nodes, rigids, masses, boundaries)

  return {
    root,
    layers: { structure, pipe, nodes, rigids, masses, boundaries },
    pickables: { structure, pipe, nodes },
  }
}

/**
 * Disposes all geometries and materials in a scene root group.
 * @param {THREE.Group} root
 */
export function disposeScene(root) {
  root.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach(m => {
        // Dispose any textures on the material (future-proof for textured stages)
        Object.values(m).forEach(v => {
          if (v && typeof v.dispose === 'function' && v.isTexture) v.dispose()
        })
        m.dispose()
      })
    }
  })
}
