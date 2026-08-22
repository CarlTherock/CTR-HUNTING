import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JournalPhotos } from './JournalPhotos'
import { db } from '@/database/db'
import { useJournalStore } from '../state/journalStore'
import type { CapturedPhoto } from '@/features/camera/components/CameraCapture'

let cameraSaveHandler: ((photo: CapturedPhoto) => void) | null = null
vi.mock('@/features/camera/components/CameraCapture', () => ({
  CameraCapture: ({ onSave }: { onSave: (photo: CapturedPhoto) => void }) => {
    cameraSaveHandler = onSave
    return <div data-testid="camera-capture-stub" />
  },
}))

const update = vi.fn()

beforeEach(() => {
  useJournalStore.setState({ update })
})

afterEach(async () => {
  vi.clearAllMocks()
  cameraSaveHandler = null
  await db.photos.clear()
  useJournalStore.setState({ update })
})

describe('JournalPhotos', () => {
  it('opens the in-app camera and, on save, persists both blobs plus real GPS, keyed by observationId', async () => {
    const user = userEvent.setup()
    render(<JournalPhotos observationId="o1" photoIds={[]} />)

    await user.click(screen.getByRole('button', { name: 'Open camera' }))
    const coordinate = { lat: 46.8, lng: -71.2 }

    await vi.waitFor(() => expect(cameraSaveHandler).not.toBeNull())
    await act(async () => {
      cameraSaveHandler?.({
        originalBlob: new Blob(['original']),
        editedBlob: new Blob(['edited']),
        coordinate,
      })
    })

    await vi.waitFor(async () => {
      const [photo] = await db.photos.toArray()
      expect(photo.observationId).toBe('o1')
      expect(photo.coordinate).toEqual(coordinate)
    })
    expect(update).toHaveBeenCalledWith('o1', { photoIds: [expect.any(String)] })
  })

  it('still supports choosing a photo from the file input', async () => {
    const user = userEvent.setup()
    render(<JournalPhotos observationId="o1" photoIds={[]} />)

    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a photo') as HTMLInputElement
    await user.upload(input, file)

    await vi.waitFor(async () => {
      const [photo] = await db.photos.toArray()
      expect(photo.observationId).toBe('o1')
    })
  })
})
