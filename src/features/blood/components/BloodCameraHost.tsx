import { Suspense, lazy, useEffect } from 'react'
import { Camera } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useBloodStore } from '../state/bloodStore'

const BloodCameraAssist = lazy(() =>
  import('../camera/BloodCameraAssist').then((module) => ({
    default: module.BloodCameraAssist,
  })),
)

/**
 * The single place where the blood camera is mounted. It opens from the map's
 * « + Repère » panel, from Outils, from the search panel and from the searches
 * page — never only from an open search: looking through the camera needs
 * nothing, and only « Confirmer un indice » asks for a search to attach to.
 */
export function BloodCameraHost({ gpsReading }: { gpsReading: GeolocationReading }) {
  const open = useBloodStore((state) => state.cameraOpen)
  const close = useBloodStore((state) => state.closeCamera)
  const loaded = useBloodStore((state) => state.loaded)
  const load = useBloodStore((state) => state.load)
  const openCamera = useBloodStore((state) => state.openCamera)

  useEffect(() => {
    if (!loaded) void load().catch(() => undefined)
  }, [loaded, load])

  // Leaving the map closes the camera (tracks stop with the component); it must
  // not silently reopen on the next visit.
  useEffect(() => () => useBloodStore.getState().closeCamera(), [])

  return (
    <>
      <ToolTrigger
        label="Caméra sang"
        title="Caméra sang : aide visuelle expérimentale"
        icon={<Camera size={18} aria-hidden="true" />}
        onClick={openCamera}
        order={12}
      />
      {open && (
        <Suspense fallback={null}>
          <BloodCameraAssist gpsReading={gpsReading} onClose={close} />
        </Suspense>
      )}
    </>
  )
}
