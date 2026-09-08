import { worldUnitsPerPixel } from './screenPicking.js'

// Selection marks represent UI, not physical diameters. Keep them legible at
// both overview and close-up scales without altering instance-mask matrices.
export function sizeScreenMarker(mesh, baseRadius, pixels, cylinder = false) {
  const scale = { value: 1 }
  mesh.material.onBeforeCompile = shader => {
    shader.uniforms.markerScale = scale
    shader.vertexShader = 'uniform float markerScale;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', cylinder
      ? 'vec3 transformed = vec3(position.x * markerScale, position.y, position.z * markerScale);'
      : 'vec3 transformed = vec3(position) * markerScale;')
  }
  mesh.material.customProgramCacheKey = () => `screen-marker-${cylinder}`
  mesh.frustumCulled = false
  mesh.onBeforeRender = (renderer, scene, camera) => {
    scale.value = worldUnitsPerPixel(camera, renderer.domElement.clientHeight) * pixels / baseRadius
  }
  return mesh
}
