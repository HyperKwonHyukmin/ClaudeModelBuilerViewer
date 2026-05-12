import * as THREE from 'three'

/**
 * 모델 무게중심을 시각화하는 3D 마커.
 *
 * 구성:
 *   - 중심 sphere (반투명 노란색)
 *   - X/Y/Z 축 십자선 (LineSegments) — 어느 방향에서 봐도 위치 식별 용이
 *   - "G" 라벨 sprite — 위쪽에 살짝 띄움
 *
 * 좌표계 변환은 호출자가 stageData.center 기준으로 처리해서 (mm → m, centered) 넘긴다.
 *
 * @param {{ x: number, y: number, z: number }} positionScene  scene-space (m)
 * @param {number} bboxSizeM  모델 bbox 의 최대변 길이 (m). 마커 크기 결정에 사용.
 * @returns {THREE.Group}
 */
export function buildCenterOfGravityMarker(positionScene, bboxSizeM) {
  const group = new THREE.Group()
  group.name = 'CenterOfGravityMarker'
  group.position.set(positionScene.x, positionScene.y, positionScene.z)

  // 마커 크기는 모델 크기의 1.5% 로 잡되, 최소/최대 한계를 둔다.
  const sphereR = THREE.MathUtils.clamp(bboxSizeM * 0.015, 0.15, 1.2)
  const crossLen = sphereR * 4   // 십자선 한쪽 길이

  // ── 중심 sphere ────────────────────────────────────────────────────────
  const sphereGeo = new THREE.SphereGeometry(sphereR, 24, 16)
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0xFFD700,
    transparent: true,
    opacity: 0.85,
    depthTest: true,
  })
  const sphere = new THREE.Mesh(sphereGeo, sphereMat)
  sphere.renderOrder = 999
  group.add(sphere)

  // 외곽 글로우 — 약간 큰 반투명 sphere
  const glowGeo = new THREE.SphereGeometry(sphereR * 1.7, 16, 12)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xFFD700,
    transparent: true,
    opacity: 0.18,
    depthTest: false,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.renderOrder = 998
  group.add(glow)

  // ── X/Y/Z 십자선 ──────────────────────────────────────────────────────
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xFFD700,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  })
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-crossLen, 0, 0), new THREE.Vector3(crossLen, 0, 0),
    new THREE.Vector3(0, -crossLen, 0), new THREE.Vector3(0, crossLen, 0),
    new THREE.Vector3(0, 0, -crossLen), new THREE.Vector3(0, 0, crossLen),
  ])
  const cross = new THREE.LineSegments(lineGeo, lineMat)
  cross.renderOrder = 1000
  group.add(cross)

  return group
}
