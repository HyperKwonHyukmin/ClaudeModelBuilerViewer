import * as THREE from 'three'

const DEFAULTS = { mode: 'sphere', px: 6, minWorld: 0, geoRadius: 1, bias: 0, biasK: 0, rim: false }

const VERT_PARS = /* glsl */`
uniform float uPxToWorld;
uniform float uPx;
uniform float uMinWorld;
uniform float uGeoRadius;
uniform float uBias;
uniform float uBiasK;
uniform float uOrthographic;
float ssScaleFactor(vec3 axisLocal) {
  vec4 p = vec4(axisLocal, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vec4 v = modelViewMatrix * p;
  float depth = max(-v.z, 1e-4);
  float worldPerPixel = mix(depth * uPxToWorld, uPxToWorld, uOrthographic);
  float rWant = max(0.5 * uPx * worldPerPixel, uMinWorld);
  return rWant / uGeoRadius;
}
`

const BEGIN_SPHERE = /* glsl */`
vec3 transformed = position * ssScaleFactor(vec3(0.0));
#ifdef USE_ALPHAHASH
  vPosition = vec3(position);
#endif
`

const PROJECT_BIASED = /* glsl */`
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
{
  float ssBias = uBias + uBiasK * max(-mvPosition.z, 0.0);
  if (ssBias > 0.0) {
    vec4 ssBiased = projectionMatrix * vec4(mvPosition.xy, mvPosition.z + ssBias, 1.0);
    gl_Position.z = ssBiased.z * (gl_Position.w / ssBiased.w);
  }
}
`

const RIM_FRAG = /* glsl */`
{
  float ssNdv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  diffuseColor.rgb *= mix(0.10, 1.0, smoothstep(0.28, 0.58, ssNdv));
}
`

/** Side Passage Studio와 같은 화면 고정 크기·깊이 바이어스 재질. */
export function makeScreenSpaceMaterial(base, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  const uniforms = {
    uPxToWorld: { value: 0.001 },
    uPx: { value: o.px },
    uMinWorld: { value: o.minWorld },
    uGeoRadius: { value: o.geoRadius > 0 ? o.geoRadius : 1 },
    uBias: { value: o.bias },
    uBiasK: { value: o.biasK },
    uOrthographic: { value: 0 },
  }
  base.userData.ss = { uniforms, mode: o.mode, rim: o.rim }
  base.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', BEGIN_SPHERE)
      .replace('#include <project_vertex>', PROJECT_BIASED)
    if (o.rim) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${RIM_FRAG}`,
      )
    }
  }
  base.customProgramCacheKey = () => `ss:${o.mode}:${o.rim ? 'rim' : 'flat'}`
  return base
}

export function setScreenSpacePx(material, px) {
  const ss = material?.userData?.ss
  if (ss && Number.isFinite(px)) ss.uniforms.uPx.value = px
}

export function pxToWorldFactor(camera, heightCssPx) {
  if (camera?.isOrthographicCamera) {
    return (camera.top - camera.bottom) / (Math.max(camera.zoom, 1e-6) * Math.max(1, heightCssPx || 1))
  }
  const fov = THREE.MathUtils.degToRad(camera?.fov ?? 45)
  return 2 * Math.tan(fov / 2) / Math.max(1, heightCssPx || 1)
}

export function updateScreenSpaceUniforms(root, camera, heightCssPx) {
  if (!root?.traverse) return 0
  const factor = pxToWorldFactor(camera, heightCssPx)
  let updated = 0
  root.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      const ss = material?.userData?.ss
      if (!ss) continue
      ss.uniforms.uPxToWorld.value = factor
      ss.uniforms.uOrthographic.value = camera?.isOrthographicCamera ? 1 : 0
      updated++
    }
  })
  return updated
}
