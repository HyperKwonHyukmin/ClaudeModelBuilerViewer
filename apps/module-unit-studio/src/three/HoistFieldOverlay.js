import * as THREE from 'three'

/** Advisory XY projection, always visible through members and never pickable. */
export function buildHoistFieldOverlay(guide, center) {
  const root = new THREE.Group()
  root.name = 'HoistFieldGuide'
  if (!guide?.available) return root
  const toScene = (p, z = p.z) => new THREE.Vector3((p.x - center.x) / 1000, (p.y - center.y) / 1000, (z - center.z) / 1000)
  const plane = guide.planeZ
  const hull = guide.hull.map(p => toScene(p, plane))
  const line = (points, color, dashed = false) => {
    const opts = { color, transparent: true, opacity: .9, depthTest: false, depthWrite: false }
    const mat = dashed ? new THREE.LineDashedMaterial({ ...opts, dashSize: .18, gapSize: .12 }) : new THREE.LineBasicMaterial(opts)
    const obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat)
    obj.renderOrder = 81
    if (dashed) obj.computeLineDistances()
    root.add(obj)
  }
  if (hull.length > 1) line(hull.length > 2 ? [...hull, hull[0]] : hull, 0x39cbd8)
  if (hull.length > 2) {
    const vertices = []
    for (let i = 1; i < hull.length - 1; i++) for (const p of [hull[0], hull[i], hull[i + 1]]) vertices.push(p.x, p.y, p.z)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x39cbd8, side: THREE.DoubleSide, transparent: true, opacity: .09, depthTest: false, depthWrite: false }))
    fill.renderOrder = 79
    root.add(fill)
  }
  for (const p of guide.apexes) line([toScene(p), toScene(p, plane)], 0x39cbd8, true)
  if (guide.corners.length) {
    const c = guide.corners
    line([c[0], c[1], c[3], c[2], c[0]].map(p => toScene(p, plane)), 0xffc447, true)
  }
  const cog = new THREE.Points(new THREE.BufferGeometry().setFromPoints([toScene(guide.cog)]), new THREE.PointsMaterial({ color: 0xffe04b, size: 14, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false }))
  cog.name = 'FieldCog'
  cog.renderOrder = 85
  root.add(cog)
  const a = toScene(guide.worst.nearest, plane), b = toScene(guide.worst.cog, plane)
  if (a.distanceTo(b) > .001) {
    if (guide.worst.deviationMm > 1) {
      const length = a.distanceTo(b)
      const arrow = new THREE.ArrowHelper(b.clone().sub(a).normalize(), a, length, 0xffac50, Math.min(.4, length * .3), Math.min(.2, length * .15))
      root.add(arrow)
    } else line([a, b], 0xffc447, true)
  }
  root.traverse(obj => {
    obj.raycast = () => {} // guidance must not steal node/member selection
    if (obj.material) {
      obj.material.depthTest = false
      obj.material.depthWrite = false
      obj.material.transparent = true
      if (!obj.renderOrder) obj.renderOrder = 82
    }
  })
  return root
}
