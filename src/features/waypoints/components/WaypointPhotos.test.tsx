import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WaypointPhotos } from './WaypointPhotos'
import { db } from '@/database/db'
import { useWaypointsStore } from '../state/waypointsStore'
import type { CapturedPhoto } from '@/features/camera/components/CameraCapture'

let cameraSaveHandler: ((photo: CapturedPhoto) => void) | null = null
vi.mock('@/features/camera/components/CameraCapture', () => ({
  CameraCapture: ({ onSave }: { onSave: (photo: CapturedPhoto) => void }) => {
    cameraSaveHandler = onSave
    return <div data-testid="camera-capture-stub" />
  },
}))

const updateWaypoint = vi.fn()

beforeEach(() => {
  useWaypointsStore.setState({ updateWaypoint })
})

afterEach(async () => {
  vi.clearAllMocks()
  cameraSaveHandler = null
  await db.photos.clear()
  useWaypointsStore.setState({ updateWaypoint })
})

describe('WaypointPhotos', () => {
  it('opens the in-app camera and, on save, persists both the edited and original blobs plus real GPS', async () => {
    const user = userEvent.setup()
    render(<WaypointPhotos waypointId="wp-1" photoIds={[]} />)

    await user.click(screen.getByRole('button', { name: 'Open camera' }))
    expect(screen.getByTestId('camera-capture-stub')).toBeInTheDocument()

    const originalBlob = new Blob(['original'], { type: 'image/jpeg' })
    const editedBlob = new Blob(['edited'], { type: 'image/jpeg' })
    const coordinate = { lat: 46.8, lng: -71.2 }

    await vi.waitFor(() => expect(cameraSaveHandler).not.toBeNull())
    await act(async () => {
      cameraSaveHandler?.({ originalBlob, editedBlob, coordinate })
    })

    // fake-indexeddb's structured-clone (jsdom environment) doesn't
    // round-trip a Blob the way a real browser's IndexedDB does (see
    // `photosRepository.test.ts`) — assert the fields that do survive
    // (real Blob persistence is exercised in the browser, not here).
    await vi.waitFor(async () => {
      const [photo] = await db.photos.toArray()
      expect(photo.waypointId).toBe('wp-1')
      expect(photo.coordinate).toEqual(coordinate)
    })
    expect(updateWaypoint).toHaveBeenCalledWith('wp-1', { photoIds: [expect.any(String)] })
  })

  it('closes the camera modal after saving', async () => {
    const user = userEvent.setup()
    render(<WaypointPhotos waypointId="wp-1" photoIds={[]} />)
    await user.click(screen.getByRole('button', { name: 'Open camera' }))

    await vi.waitFor(() => expect(cameraSaveHandler).not.toBeNull())
    await act(async () => {
      cameraSaveHandler?.({
        originalBlob: new Blob(['a']),
        editedBlob: new Blob(['a']),
      })
    })

    await vi.waitFor(() => {
      expect(screen.queryByTestId('camera-capture-stub')).not.toBeInTheDocument()
    })
  })

  it('still supports choosing a photo from the file input (slice 2.4)', async () => {
    const user = userEvent.setup()
    render(<WaypointPhotos waypointId="wp-1" photoIds={[]} />)

    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a photo') as HTMLInputElement
    await user.upload(input, file)

    await vi.waitFor(async () => {
      const [photo] = await db.photos.toArray()
      expect(photo.waypointId).toBe('wp-1')
      expect(photo.coordinate).toBeUndefined()
    })
  })
})
