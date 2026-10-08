import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useBloodStore } from '../state/bloodStore'
import { BloodCameraAssist } from './BloodCameraAssist'

/* Camera, canvas and sensors are SIMULATED here (jsdom has none). These tests
 * check the component's logic and its guarantees (no automatic point,
 * original kept, cleanup, honest messages). They are not a validation on a
 * real phone camera. */

type Rgb = [number, number, number]
let frameColor: Rgb = [70, 90, 60]
let redPatch = false
const trackStop = vi.fn()
const applyConstraints = vi.fn().mockResolvedValue(undefined)
let capabilities: Record<string, unknown> = {}

function makeFrame(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inPatch =
        redPatch && x > width / 4 && x < width / 2 && y > height / 4 && y < height / 2
      const c: Rgb = inPatch ? [190, 25, 25] : frameColor
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return data
}

const putImageData = vi.fn()
let blobCounter = 0

beforeEach(async () => {
  frameColor = [70, 90, 60]
  redPatch = false
  capabilities = {}
  blobCounter = 0
  trackStop.mockClear()
  applyConstraints.mockClear()
  putImageData.mockClear()
  await Promise.all(db.tables.map((t) => t.clear()))
  useTracksStore.setState({
    tracks: [],
    status: 'idle',
    recordingId: null,
    recordingStartedAt: null,
    points: [],
    breaks: [],
    distanceMeters: 0,
  })
  useWaypointsStore.setState({ waypoints: [], loaded: true })
  useBloodStore.setState({
    sessions: [],
    loaded: true,
    lastAddedId: null,
    showLinks: false,
    manual: null,
  })

  class FakeImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
  vi.stubGlobal('ImageData', FakeImageData)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: makeFrame(w, h),
      }),
      putImageData,
    } as unknown as CanvasRenderingContext2D
  } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    callback: BlobCallback,
  ) {
    blobCounter++
    callback(new Blob(['x'.repeat(blobCounter)], { type: 'image/jpeg' }))
  } as never)
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => 640,
  })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => 480,
  })
  // requestAnimationFrame: run at a fake increasing clock so the throttle passes.
  let clock = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return window.setTimeout(() => {
      clock += 200
      cb(clock)
    }, 5)
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }),
  )

  const track = {
    stop: trackStop,
    getCapabilities: () => capabilities,
    getSettings: () => ({}),
    applyConstraints,
  }
  const fakeStream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const goodFix = (): GeolocationReading => ({
  status: 'available',
  confidence: 'measured',
  source: 'browser-geolocation',
  value: { lat: 46.8, lng: -71.2, accuracyMeters: 5, timestampMs: Date.now() },
})
const NO_GPS: GeolocationReading = {
  status: 'unavailable',
  kind: 'searching',
  reason: 'x',
}

async function openSession() {
  await useBloodStore.getState().startSession({ hasUsableFix: true })
}

describe('BloodCameraAssist', () => {
  it('always shows the mandatory warning and the experimental label', async () => {
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    expect(screen.getByTestId('camera-warning')).toHaveTextContent(
      'Aide visuelle : les zones surlignées ne sont pas du sang confirmé. Des feuilles, baies, sols et objets peuvent être surlignés. L’absence de surbrillance ne prouve pas l’absence de sang.',
    )
    expect(screen.getByText(/expérimental/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
  })

  it('reports a camera permission refusal and says tracking continues', async () => {
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(denied) },
    })
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/refusé/))
    expect(screen.getByRole('alert')).toHaveTextContent(
      /continuent de fonctionner sans la caméra/,
    )
    expect(screen.getByTestId('camera-warning')).toBeInTheDocument()
  })

  it('flags a red patch as a candidate zone (not blood) and creates NO point by itself', async () => {
    redPatch = true
    await openSession()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    const alert = await screen.findByTestId('candidate-alert')
    expect(alert).toHaveTextContent(/Zone candidate/)
    expect(alert).toHaveTextContent(/non confirmée/)
    expect(alert.textContent).not.toMatch(/%\s*(de )?(sang|probab|confiance)/i)
    expect(putImageData).toHaveBeenCalled()
    expect(await db.waypoints.count()).toBe(0)
    expect(await db.photos.count()).toBe(0)
  })

  it('says nothing is highlighted on a plain green scene, without claiming there is no blood', async () => {
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(putImageData).toHaveBeenCalled())
    expect(screen.getByText('Aucune zone candidate dans l’image.')).toBeInTheDocument()
    expect(screen.queryByTestId('candidate-alert')).not.toBeInTheDocument()
  })

  it('warns about low light and overexposure', async () => {
    frameColor = [8, 8, 8]
    const view = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Lumière faible/),
    )
    view.unmount()
    frameColor = [252, 252, 252]
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Surexposition/),
    )
  })

  it('torch: offered only when the camera reports it', async () => {
    const user = userEvent.setup()
    const view = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
    expect(screen.getByText(/Lampe de la caméra non disponible/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lampe/i })).not.toBeInTheDocument()
    view.unmount()

    capabilities = { torch: true }
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    const torch = await screen.findByRole('button', { name: /Allumer la lampe/ })
    await user.click(torch)
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  })

  it('vibration: unavailable is said, available is throttled', async () => {
    const user = userEvent.setup()
    redPatch = true
    const view = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await screen.findByTestId('candidate-alert')
    expect(screen.getByRole('checkbox', { name: 'Vibration' })).toBeDisabled()
    expect(screen.getByText(/Vibration non prise en charge/)).toBeInTheDocument()
    view.unmount()

    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('checkbox', { name: 'Vibration' }))
    await screen.findByTestId('candidate-alert')
    await waitFor(() => expect(vibrate).toHaveBeenCalled())
    const calls = vibrate.mock.calls.length
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    // Many frames passed, but alerts are throttled to one per interval.
    expect(vibrate.mock.calls.length).toBe(calls)
    // @ts-expect-error cleanup of the stub
    delete navigator.vibrate
  })

  it('pausing stops the analysis; resuming restarts it', async () => {
    const user = userEvent.setup()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(putImageData).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: /Pause de l’analyse/ }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    const frozen = putImageData.mock.calls.length
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(putImageData.mock.calls.length).toBe(frozen)
    await user.click(screen.getByRole('button', { name: /Reprendre l’analyse/ }))
    await waitFor(() => expect(putImageData.mock.calls.length).toBeGreaterThan(frozen))
  })

  it('switches between original, filtered and side-by-side', async () => {
    const user = userEvent.setup()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Côte à côte' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Originale' }))
    expect(screen.getByRole('button', { name: 'Originale' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Filtrée' }))
    expect(screen.getByRole('button', { name: 'Filtrée' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('capture then « Confirmer un indice » creates ONE Sang point with photo and note, via the normal flow', async () => {
    const user = userEvent.setup()
    redPatch = true
    await openSession()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Capturer/ })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: /Capturer/ }))

    expect(await screen.findByAltText('Photo originale')).toBeInTheDocument()
    expect(screen.getByAltText('Photo avec surbrillance')).toBeInTheDocument()
    expect(screen.getByText(/pas à l’endroit exact de la tache/)).toBeInTheDocument()
    // Still nothing saved: the capture alone is not a clue.
    expect(await db.waypoints.count()).toBe(0)

    await user.type(screen.getByLabelText(/Note/), 'goutte large')
    await user.click(screen.getByRole('button', { name: 'Confirmer un indice' }))

    await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [waypoint] = await db.waypoints.toArray()
    expect(waypoint).toMatchObject({
      name: 'Sang 01',
      category: 'blood',
      bloodKind: 'blood',
      origin: 'gps',
      notes: 'goutte large',
    })
    await waitFor(async () => expect(await db.photos.count()).toBe(1))
    const [photo] = await db.photos.toArray()
    expect(photo.waypointId).toBe(waypoint.id)
    expect(photo.originalBlob).toBeDefined()
    expect(photo.blob).toBeDefined()
    expect((await db.waypoints.get(waypoint.id))?.photoIds).toEqual([photo.id])
    await screen.findByText(/Sang 01 enregistré avec la photo/)
  })

  it('discarding a capture saves nothing', async () => {
    const user = userEvent.setup()
    await openSession()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Capturer/ })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: /Capturer/ }))
    await user.click(await screen.findByRole('button', { name: 'Écarter cette capture' }))
    expect(await db.waypoints.count()).toBe(0)
    expect(await db.photos.count()).toBe(0)
  })

  it('without a usable GPS position: place by hand, save only after choosing a point, then locked', async () => {
    const user = userEvent.setup()
    await openSession()
    render(<BloodCameraAssist gpsReading={NO_GPS} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Capturer/ })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: /Capturer/ }))
    await user.click(await screen.findByRole('button', { name: 'Confirmer un indice' }))
    expect(await db.waypoints.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Placer sur la carte' }))
    const save = screen.getByRole('button', { name: 'Enregistrer avec la photo' })
    expect(save).toBeDisabled()
    act(() => useBloodStore.getState().setManualCoordinate({ lat: 46.81, lng: -71.21 }))
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [waypoint] = await db.waypoints.toArray()
    expect(waypoint).toMatchObject({
      origin: 'manual',
      coordinate: { lat: 46.81, lng: -71.21 },
    })
    const { updateWaypoint } = await import('@/database/waypointsRepository')
    await expect(
      updateWaypoint(waypoint.id, { coordinate: { lat: 0, lng: 0 } } as never),
    ).rejects.toThrow()
  })

  it('stops the camera tracks and the analysis when closed', async () => {
    const view = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(putImageData).toHaveBeenCalled())
    view.unmount()
    expect(trackStop).toHaveBeenCalled()
    const calls = putImageData.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(putImageData.mock.calls.length).toBe(calls)
  })

  it('analyses at a reduced resolution, not at the camera resolution', async () => {
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(putImageData).toHaveBeenCalled())
    const image = putImageData.mock.calls[0][0] as { width: number; height: number }
    expect(image.width).toBeLessThanOrEqual(320)
    expect(image.width).toBeLessThan(640)
  })
})
