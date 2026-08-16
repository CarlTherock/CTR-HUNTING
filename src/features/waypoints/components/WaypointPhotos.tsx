import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { addPhoto, deletePhoto, listPhotosForWaypoint } from '@/database/photosRepository'
import { useWaypointsStore } from '../state/waypointsStore'
import type { Photo } from '@/types'

type PhotoWithUrl = Photo & { url: string }

/** Photo grid + "add photo" button for the waypoint currently open in
 * `WaypointEditPanel`. A plain `<input type="file" capture="environment">`
 * delegates to the device's own camera/gallery picker — this is *not*
 * Phase 12's camera tool (live preview, zoom, filters); slice 2.4 only
 * needs to attach an existing photo to a waypoint. */
export function WaypointPhotos({
  waypointId,
  photoIds,
}: {
  waypointId: string
  photoIds: string[]
}) {
  const updateWaypoint = useWaypointsStore((state) => state.updateWaypoint)
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Object URLs are created alongside the data that needs them (this
  // load, or `handleFileChange` below) rather than via a second
  // effect+setState derived purely from `photos` — React's rules
  // discourage synchronous setState calls in an effect body outside a
  // subscription callback (this `.then()` counts as one; a bare
  // `setState` right in the effect body wouldn't).
  const photosRef = useRef<PhotoWithUrl[]>([])
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    let cancelled = false
    void listPhotosForWaypoint(waypointId).then((loaded) => {
      if (cancelled) return
      setPhotos(loaded.map((photo) => ({ ...photo, url: URL.createObjectURL(photo.blob) })))
    })
    return () => {
      cancelled = true
      // Covers both "switched to a different waypoint" and "unmounted
      // entirely" — `photosRef` always holds whatever's currently shown,
      // including photos added after the initial load.
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url)
    }
  }, [waypointId])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again immediately
    if (!file) return

    const photo = await addPhoto({ waypointId, blob: file })
    const url = URL.createObjectURL(photo.blob)
    setPhotos((prev) => [...prev, { ...photo, url }])
    void updateWaypoint(waypointId, { photoIds: [...photoIds, photo.id] })
  }

  async function handleDelete(photo: PhotoWithUrl) {
    await deletePhoto(photo.id)
    URL.revokeObjectURL(photo.url)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    void updateWaypoint(waypointId, { photoIds: photoIds.filter((id) => id !== photo.id) })
  }

  return (
    <div>
      <span className="text-ink-500 text-xs font-medium">Photos</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => void handleDelete(photo)}
              aria-label="Delete photo"
              className="bg-surface-950/80 text-status-danger absolute top-0.5 right-0.5 rounded-full p-1"
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add photo"
          className="border-surface-600 text-ink-500 hover:text-brand-400 hover:border-brand-400 flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors"
        >
          <Camera size={18} aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleFileChange(e)}
          className="hidden"
          aria-label="Choose a photo"
        />
      </div>
    </div>
  )
}
