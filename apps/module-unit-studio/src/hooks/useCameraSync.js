import { useEffect, useRef } from 'react'

/**
 * Synchronizes OrbitControls across all registered viewports when cameraLinked=true.
 * Uses a guard flag to prevent infinite feedback loops.
 *
 * @param {React.MutableRefObject<Object>} viewportApiRefs  { [id]: { camera, controls, requestRender } }
 * @param {boolean} cameraLinked
 * @param {Array<{id}>} viewports  Used to detect viewport changes
 * @param {string} [projection]  투영 모드 토글 시 뷰포트 리마운트로 controls 가 교체되므로
 *                               리스너를 다시 바인딩하기 위한 의존성.
 */
export default function useCameraSync(viewportApiRefs, cameraLinked, viewports, projection) {
  const syncing = useRef(false)
  const listenersRef = useRef([])

  useEffect(() => {
    // Remove previous listeners
    listenersRef.current.forEach(({ controls, handler }) => {
      controls.removeEventListener('change', handler)
    })
    listenersRef.current = []

    if (!cameraLinked) return

    // Wait one tick for all ThreeViewports to register their APIs after mount/update
    const t = setTimeout(() => {
      const apis = Object.values(viewportApiRefs.current)
      if (apis.length < 2) return

      const listeners = apis.map((sourceApi) => {
        const handler = () => {
          if (syncing.current) return
          syncing.current = true

          const { camera: srcCam, controls: srcCtrl } = sourceApi
          for (const api of apis) {
            if (api === sourceApi) continue
            api.camera.position.copy(srcCam.position)
            api.camera.quaternion.copy(srcCam.quaternion)
            api.camera.up.copy(srcCam.up)   // TrackballControls modifies camera.up
            api.controls.target.copy(srcCtrl.target)
            // 직교 카메라는 확대율이 camera.zoom 에 있으므로 함께 동기화해야 링크된 뷰 배율이 맞는다.
            if (typeof srcCam.zoom === 'number' && api.camera.zoom !== srcCam.zoom) {
              api.camera.zoom = srcCam.zoom
              api.camera.updateProjectionMatrix()
            }
            api.updateClip?.()   // 동기화된 거리에 맞춰 near/far 재계산(깊은 줌에서 클리핑 방지)
            api.requestRender()
          }

          syncing.current = false
        }

        sourceApi.controls.addEventListener('change', handler)
        return { controls: sourceApi.controls, handler }
      })

      listenersRef.current = listeners
    }, 50)

    return () => {
      clearTimeout(t)
      listenersRef.current.forEach(({ controls, handler }) => {
        controls.removeEventListener('change', handler)
      })
      listenersRef.current = []
    }
  }, [cameraLinked, viewports, viewportApiRefs, projection])
}
