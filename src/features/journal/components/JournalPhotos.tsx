import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { CameraCapture } from '@/features/camera/components/CameraCapture'
import type { CapturedPhoto } from '@/features/camera/components/CameraCapture'
import { usePhotoGallery } from '@/features/camera/state/usePhotoGallery'
import { useJournalStore } from '../state/journalStore'

/** Photo grid for a journal entry — same pattern as
 * `features/waypoints/components/WaypointPhotos.tsx` (in-app camera +
 * file picker), just keyed by `observationId` instead of `waypointId`.
 * Data access and the object-URL lifecycle live in `usePhotoGallery`. */
export function JournalPhotos({ observationId, photoIds }: { observationId: string; photoIds: string[] }) {
  const update = useJournalStore((state) => state.update)
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { photos, error, addFile, addCaptured, remove } = usePhotoGallery(
    { kind: 'observation', id: observationId },
    photoIds,
    (ids) => void update(observationId, { photoIds: ids }),
  )

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await addFile(file)
  }

  async function handleCameraSave(captured: CapturedPhoto) {
    setCameraOpen(false)
    await addCaptured(captured)
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
              onClick={() => void remove(photo)}
              aria-label="Supprimer la photo"
              className="bg-surface-950/80 text-status-danger absolute top-0.5 right-0.5 rounded-full p-1 pointer-coarse:p-4"
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          aria-label="Ouvrir la caméra"
          title="Ouvrir la caméra"
          className="border-surface-600 text-ink-500 hover:text-brand-400 hover:border-brand-400 flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors"
        >
          <Camera size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Ajouter une photo"
          title="Choisir une photo"
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
          aria-label="Choisir une photo"
        />
      </div>
      {error && (
        <p role="alert" className="text-status-danger mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
