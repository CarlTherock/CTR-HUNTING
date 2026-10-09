import { Suspense, lazy, useEffect } from 'react'
import { Camera, Droplets } from 'lucide-react'
import { ToolSlot, ToolTrigger } from '@/components/map-tools'
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
      {/* Shortcut on the rail, between « + Repère » (order -10) and 2D/3D (5). */}
      <ToolSlot placement="rail" order={0}>
        <button
          type="button"
          onClick={openCamera}
          aria-label="Raccourci : caméra de recherche"
          title="Caméra sang : aide visuelle expérimentale"
          data-testid="blood-camera-shortcut"
          className="border-surface-600 bg-surface-900/90 flex h-11 w-11 items-center justify-center rounded-lg border shadow-lg backdrop-blur-sm"
        >
          <Droplets size={22} className="text-red-500" aria-hidden="true" />
        </button>
      </ToolSlot>
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
