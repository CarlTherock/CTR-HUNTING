import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CameraCapture } from './CameraCapture'

const start = vi.fn()
const stop = vi.fn()
const setZoom = vi.fn()
let mockCameraState: {
  status: 'idle' | 'starting' | 'streaming' | 'error'
  errorReason: string | null
  stream: MediaStream | null
  zoomRange: { min: number; max: number; step: number } | null
  zoom: number | null
} = { status: 'streaming', errorReason: null, stream: null, zoomRange: null, zoom: null }

vi.mock('../useCameraStream', () => ({
  useCameraStream: () => ({ ...mockCameraState, start, stop, setZoom }),
}))

let mockGpsReading: { status: 'available' | 'unavailable'; value?: unknown; reason?: string } = {
  status: 'unavailable',
  reason: 'no fix',
}
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

afterEach(() => {
  vi.clearAllMocks()
  mockCameraState = { status: 'streaming', errorReason: null, stream: null, zoomRange: null, zoom: null }
  mockGpsReading = { status: 'unavailable', reason: 'no fix' }
})

describe('CameraCapture', () => {
  it('starts the real camera stream on mount and stops it on unmount', () => {
    const { unmount } = render(<CameraCapture onSave={vi.fn()} onClose={vi.fn()} />)
    expect(start).toHaveBeenCalledOnce()

    unmount()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('shows the real error reason when the camera is unavailable', () => {
    mockCameraState = { status: 'error', errorReason: 'Permission denied', stream: null, zoomRange: null, zoom: null }
    render(<CameraCapture onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Permission denied')).toBeInTheDocument()
  })

  it('labels the zoom slider as digital when the device reports no real hardware zoom', () => {
    render(<CameraCapture onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Zoom (digital)')).toBeInTheDocument()
  })

  it('labels the zoom slider as real zoom when the track reports a genuine capability', () => {
    mockCameraState = {
      status: 'streaming',
      errorReason: null,
      stream: null,
      zoomRange: { min: 1, max: 4, step: 0.1 },
      zoom: 1,
    }
    render(<CameraCapture onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Zoom')).toBeInTheDocument()
    expect(screen.queryByText('Zoom (digital)')).not.toBeInTheDocument()
  })

  it('disables the capture button until the stream is genuinely live', () => {
    mockCameraState = { status: 'starting', errorReason: null, stream: null, zoomRange: null, zoom: null }
    render(<CameraCapture onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeDisabled()
  })

  it('calls onClose when the close button is tapped', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CameraCapture onSave={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close camera' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
