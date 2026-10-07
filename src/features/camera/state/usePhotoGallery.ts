import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addPhoto,
  deletePhoto,
  listPhotosForObservation,
  listPhotosForWaypoint,
} from '@/database/photosRepository'
import type { CreatePhotoInput } from '@/database/photosRepository'
import type { Photo } from '@/types'
import type { CapturedPhoto } from '../components/CameraCapture'

export type PhotoWithUrl = Photo & { url: string }

export interface PhotoOwnerRef {
  kind: 'waypoint' | 'observation'
  id: string
}

function ownerInput(
  owner: PhotoOwnerRef,
): { waypointId: string } | { observationId: string } {
  return owner.kind === 'waypoint'
    ? { waypointId: owner.id }
    : { observationId: owner.id }
}

/**
 * Photo list + add/delete actions for one waypoint or journal entry —
 * the single place the photo UI touches the photos repository, so the
 * components (`WaypointPhotos`, `JournalPhotos`) stay free of data access.
 *
 * Object URLs are created alongside the data that needs them (the load, or
 * an add) and revoked when the owner changes, the component unmounts, or a
 * photo is deleted. `onPhotoIdsChange` receives the owner's new `photoIds`
 * after every successful add/delete, for the caller to persist on the
 * waypoint/entry itself.
 */
export function usePhotoGallery(
  owner: PhotoOwnerRef,
  photoIds: string[],
  onPhotoIdsChange: (photoIds: string[]) => void,
) {
  const { kind, id } = owner
  const ownerKey = `${kind}:${id}`
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([])
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(
    null,
  )

  // Always holds whatever's currently shown, including photos added after
  // the initial load, so cleanup can revoke every live object URL.
  const photosRef = useRef<PhotoWithUrl[]>([])
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  // The owner this hook is currently mounted for (`null` once unmounted):
  // an add/delete that finishes after the owner changed or the component
  // went away must not create object URLs nobody will ever revoke.
  const activeKey = useRef<string | null>(null)
  useEffect(() => {
    activeKey.current = ownerKey
    return () => {
      activeKey.current = null
    }
  }, [ownerKey])

  useEffect(() => {
    let cancelled = false
    const load =
      kind === 'waypoint' ? listPhotosForWaypoint(id) : listPhotosForObservation(id)
    load.then(
      (loaded) => {
        if (cancelled) return
        setPhotos(
          loaded.map((photo) => ({ ...photo, url: URL.createObjectURL(photo.blob) })),
        )
      },
      () => {
        if (cancelled) return
        setErrorState({
          key: `${kind}:${id}`,
          message: 'Impossible de charger les photos.',
        })
      },
    )
    return () => {
      cancelled = true
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url)
    }
  }, [kind, id])

  const fail = useCallback(
    (message: string) => {
      if (activeKey.current === ownerKey) setErrorState({ key: ownerKey, message })
    },
    [ownerKey],
  )

  async function save(input: Omit<CreatePhotoInput, 'waypointId' | 'observationId'>) {
    setErrorState(null)
    try {
      const photo = await addPhoto({ ...input, ...ownerInput(owner) } as CreatePhotoInput)
      if (activeKey.current === ownerKey) {
        const url = URL.createObjectURL(photo.blob)
        setPhotos((prev) => [...prev, { ...photo, url }])
      }
      onPhotoIdsChange([...photoIds, photo.id])
    } catch {
      fail('Impossible d’enregistrer la photo.')
    }
  }

  return {
    photos,
    error: errorState?.key === ownerKey ? errorState.message : null,
    /** A photo picked from the device's camera/gallery. */
    addFile: (file: Blob) => save({ blob: file }),
    /** A photo taken with the in-app camera (`CameraCapture`). */
    addCaptured: (captured: CapturedPhoto) =>
      save({
        blob: captured.editedBlob,
        originalBlob: captured.originalBlob,
        coordinate: captured.coordinate,
      }),
    remove: async (photo: PhotoWithUrl) => {
      setErrorState(null)
      try {
        await deletePhoto(photo.id)
      } catch {
        fail('Impossible de supprimer la photo.')
        return
      }
      URL.revokeObjectURL(photo.url)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
      onPhotoIdsChange(photoIds.filter((pid) => pid !== photo.id))
    },
  }
}
