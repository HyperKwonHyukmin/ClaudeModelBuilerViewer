import { useEffect, useRef } from 'react'

/**
 * Synchronizes OrbitControls across all registered viewports when cameraLinked=true.
 * Uses a guard flag to prevent infinite feedback loops.
 *
 * @param {React.MutableRefObject<Object>} viewportApiRefs  { [id]: { camera, controls, requestRender } }
 * @param {boolean} cameraLinked
 * @param {Array<{id}>} viewports  Used to detect viewport changes
 */
export default function useCameraSync(viewportApiRefs, cameraLinked, viewports) {
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
  }, [cameraLinked, viewports, viewportApiRefs])
}
