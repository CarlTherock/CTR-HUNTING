import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { addPhoto, deletePhoto, listPhotosForObservation } from '@/database/photosRepository'
import { CameraCapture } from '@/features/camera/components/CameraCapture'
import type { CapturedPhoto } from '@/features/camera/components/CameraCapture'
import { useJournalStore } from '../state/journalStore'
import type { Photo } from '@/types'

type PhotoWithUrl = Photo & { url: string }

/** Photo grid for a journal entry — same pattern as
 * `features/waypoints/components/WaypointPhotos.tsx` (in-app camera +
 * file picker, object-URL lifecycle tied to load/add/delete), just keyed
 * by `observationId` instead of `waypointId`. */
export function JournalPhotos({ observationId, photoIds }: { observationId: string; photoIds: string[] }) {
  const update = useJournalStore((state) => state.update)
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const photosRef = useRef<PhotoWithUrl[]>([])
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    let cancelled = false
    void listPhotosForObservation(observationId).then((loaded) => {
      if (cancelled) return
      setPhotos(loaded.map((photo) => ({ ...photo, url: URL.createObjectURL(photo.blob) })))
    })
    return () => {
      cancelled = true
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url)
    }
  }, [observationId])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const photo = await addPhoto({ observationId, blob: file })
    const url = URL.createObjectURL(photo.blob)
    setPhotos((prev) => [...prev, { ...photo, url }])
    void update(observationId, { photoIds: [...photoIds, photo.id] })
  }

  async function handleCameraSave(captured: CapturedPhoto) {
    setCameraOpen(false)
    const photo = await addPhoto({
      observationId,
      blob: captured.editedBlob,
      originalBlob: captured.originalBlob,
      coordinate: captured.coordinate,
    })
    const url = URL.createObjectURL(photo.blob)
    setPhotos((prev) => [...prev, { ...photo, url }])
    void update(observationId, { photoIds: [...photoIds, photo.id] })
  }

  async function handleDelete(photo: PhotoWithUrl) {
    await deletePhoto(photo.id)
    URL.revokeObjectURL(photo.url)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    void update(observationId, { photoIds: photoIds.filter((id) => id !== photo.id) })
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
          onClick={() => setCameraOpen(true)}
          aria-label="Open camera"
          title="Open camera"
          className="border-surface-600 text-ink-500 hover:text-brand-400 hover:border-brand-400 flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors"
        >
          <Camera size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add photo"
          title="Choose a photo"
          className="border-surface-600 text-ink-500 hover:text-brand-400 hover:border-brand-400 flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors"
        >
          <ImagePlus size={18} aria-hidden="true" />
        </button>
        {cameraOpen && (
          <CameraCapture onSave={(captured) => void handleCameraSave(captured)} onClose={() => setCameraOpen(false)} />
        )}
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
