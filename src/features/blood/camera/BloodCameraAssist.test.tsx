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
  it('always shows the compact caution; the full text and the label are one tap away', async () => {
    const user = userEvent.setup()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    expect(screen.getByTestId('camera-warning')).toHaveTextContent(
      'Aide visuelle — sang non confirmé',
    )
    expect(screen.getByRole('dialog', { name: /expérimental/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Aide et informations' }))
    const help = screen.getByTestId('camera-help')
    expect(screen.getByTestId('camera-help-warning')).toHaveTextContent(
      'Aide visuelle : les zones surlignées ne sont pas du sang confirmé. Des feuilles, baies, sols et objets peuvent être surlignés. L’absence de surbrillance ne prouve pas l’absence de sang.',
    )
    // The three points of caution are all there.
    expect(help).toHaveTextContent(/faux positifs/i)
    expect(help).toHaveTextContent(/surbrillance.*pas.*sang confirmé/i)
    expect(help).toHaveTextContent(/absence de surbrillance.*pas.*absence de sang/i)
    expect(screen.getByText(/Fonction expérimentale/)).toBeInTheDocument()
    // Closing the help leaves the camera running.
    await user.click(
      screen.getByRole('button', { name: /Fermer : Aide et informations/ }),
    )
    expect(screen.queryByTestId('camera-help')).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Fermer la caméra' })).toBeVisible()
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

  it('torch: always reachable; unavailable is said honestly, never faked', async () => {
    const user = userEvent.setup()
    const view = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
    const unavailable = screen.getByRole('button', { name: /Lampe indisponible/ })
    expect(unavailable).toHaveAttribute('aria-disabled', 'true')
    expect(unavailable).not.toHaveAttribute('aria-pressed')
    await user.click(unavailable)
    expect(await screen.findByTestId('camera-notice')).toHaveTextContent(
      /Lampe indisponible sur cet appareil/,
    )
    expect(applyConstraints).not.toHaveBeenCalled()
    view.unmount()

    capabilities = { torch: true }
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    const torch = await screen.findByRole('button', { name: 'Allumer la lampe' })
    expect(torch).toHaveAttribute('aria-pressed', 'false')
    await user.click(torch)
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    expect(
      await screen.findByRole('button', { name: 'Éteindre la lampe' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('torch: a refused command never shows the lamp as on', async () => {
    const user = userEvent.setup()
    capabilities = { torch: true }
    applyConstraints.mockRejectedValueOnce(new Error('refused'))
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Allumer la lampe' }))
    expect(await screen.findByTestId('camera-notice')).toHaveTextContent(
      /n’a pas pu être allumée/,
    )
    expect(screen.getByRole('button', { name: 'Allumer la lampe' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('the torch stays reachable while the settings sheet is open', async () => {
    const user = userEvent.setup()
    capabilities = { torch: true }
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'Allumer la lampe' })
    await user.click(screen.getByRole('button', { name: 'Paramètres' }))
    expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Allumer la lampe' }))
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  })

  it('vibration: unavailable is said, available is throttled', async () => {
    const user = userEvent.setup()
    redPatch = true
    const view = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await screen.findByTestId('candidate-alert')
    await user.click(screen.getByRole('button', { name: 'Paramètres' }))
    expect(screen.getByRole('checkbox', { name: 'Vibration' })).toBeDisabled()
    expect(screen.getByText(/Vibration non prise en charge/)).toBeInTheDocument()
    view.unmount()

    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }))
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
    await user.click(screen.getByRole('button', { name: 'Paramètres' }))
    await user.click(screen.getByRole('button', { name: /Pause de l’analyse/ }))
    expect(screen.getByTestId('camera-status')).toHaveTextContent('Analyse en pause')
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

  it('shows ONE large filtered view by default; original and comparison are one tap away', async () => {
    const user = userEvent.setup()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    const canvas = screen.getByLabelText('Image avec surbrillance des zones candidates')
    const video = screen.getByLabelText('Image originale de la caméra')
    expect(screen.getByRole('button', { name: 'Filtrée' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Both layers fill the same surface with the same crop (object-cover).
    expect(canvas).toHaveClass('object-cover', 'h-full', 'w-full')
    expect(video).toHaveClass('object-cover', 'h-full', 'w-full')
    expect(canvas).toHaveStyle({ visibility: 'visible' })
    expect(screen.queryByTestId('camera-divider')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Originale' }))
    expect(screen.getByRole('button', { name: 'Originale' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(canvas).toHaveStyle({ visibility: 'hidden' })

    await user.click(screen.getByRole('button', { name: 'Comparaison' }))
    const divider = screen.getByRole('slider', { name: 'Séparateur de comparaison' })
    expect(divider).toHaveAttribute('aria-valuenow', '50')
    expect(canvas).toHaveStyle({ clipPath: 'inset(0 50% 0 0)' })
    // The divider also moves with the keyboard.
    divider.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(divider).toHaveAttribute('aria-valuenow', '54')
    expect(canvas).toHaveStyle({ clipPath: 'inset(0 46% 0 0)' })
  })

  it('remembers the settings between two openings and can reset them', async () => {
    const user = userEvent.setup()
    window.localStorage.removeItem('ctr.bloodCamera.prefs.v1')
    const first = render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Paramètres' }))
    await user.click(screen.getByRole('button', { name: 'Bleu' }))
    await user.click(screen.getByRole('button', { name: 'Comparaison' }))
    first.unmount()

    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Comparaison' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Paramètres' }))
    expect(screen.getByRole('button', { name: 'Bleu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: /Réinitialiser les réglages/ }))
    expect(screen.getByRole('button', { name: 'Jaune' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    window.localStorage.removeItem('ctr.bloodCamera.prefs.v1')
  })

  it.each(['Jaune', 'Cyan', 'Bleu', 'Rouge'])(
    'colour %s changes the display only, not which zones are flagged',
    async (label) => {
      const user = userEvent.setup()
      redPatch = true
      window.localStorage.removeItem('ctr.bloodCamera.prefs.v1')
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      const alert = await screen.findByTestId('candidate-alert')
      const before = alert.textContent
      await user.click(screen.getByRole('button', { name: 'Paramètres' }))
      await user.click(screen.getByRole('button', { name: label }))
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      putImageData.mockClear()
      await waitFor(() => expect(putImageData).toHaveBeenCalled())
      expect(screen.getByTestId('candidate-alert').textContent).toBe(before)
      window.localStorage.removeItem('ctr.bloodCamera.prefs.v1')
    },
  )

  it('capture then « Confirmer un indice » creates ONE Sang point with photo and note, via the normal flow', async () => {
    const user = userEvent.setup()
    redPatch = true
    await openSession()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Capturer/ })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: /Capturer/ }))

    expect(await screen.findByAltText('Photo avec surbrillance')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Originale \(intacte\)/ }))
    expect(screen.getByAltText('Photo originale')).toBeInTheDocument()
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
    // The camera steps aside (paused) but its video element is still the same one.
    expect(screen.getByTestId('camera-placing')).toHaveTextContent(/Caméra en pause/)
    expect(screen.getByLabelText('Image originale de la caméra')).toBeInTheDocument()
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

  describe('without an open search (the camera never needs one to open)', () => {
    async function captureThenConfirm(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: /Capturer/ }))
      await user.click(await screen.findByRole('button', { name: /Confirmer un indice/ }))
    }

    it('opens and captures with no search, creates nothing until the user chooses', async () => {
      const user = userEvent.setup()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await captureThenConfirm(user)

      const gate = await screen.findByTestId('clue-gate')
      expect(gate).toHaveTextContent(/démarre aussi l’enregistrement de votre trace/)
      expect(await db.waypoints.count()).toBe(0)
      expect(await db.bloodSessions.count()).toBe(0)
      expect(useTracksStore.getState().status).toBe('idle')

      await user.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(screen.queryByTestId('clue-gate')).not.toBeInTheDocument()
      expect(await db.waypoints.count()).toBe(0)
      expect(await db.bloodSessions.count()).toBe(0)
    })

    it('creating the search from the gate saves exactly ONE clue attached to it', async () => {
      const user = userEvent.setup()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await captureThenConfirm(user)
      await user.click(
        await screen.findByRole('button', {
          name: /Créer une recherche et démarrer ma trace/,
        }),
      )
      await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
      expect(await db.bloodSessions.count()).toBe(1)
      const [clue] = await db.waypoints.toArray()
      const [session] = await db.bloodSessions.toArray()
      expect(clue.sessionId).toBe(session.id)
      expect(clue.bloodKind).toBe('blood')
      expect(await db.photos.count()).toBe(1)
    })

    it('with a search open, shows which one the clue will join', async () => {
      const user = userEvent.setup()
      await openSession()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: /Capturer/ }))
      expect(await screen.findByTestId('clue-target')).toHaveTextContent(/rattaché/)
    })
  })

  it('permission refused: stays usable, offers a retry and a photo import, stops nothing silently', async () => {
    const user = userEvent.setup()
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    const getUserMedia = vi.fn().mockRejectedValue(denied)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    const onClose = vi.fn()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={onClose} />)
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /Importer une photo/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Réessayer la caméra/ }))
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    // The close button is still there: the screen is never a dead end.
    await user.click(screen.getByRole('button', { name: 'Fermer la caméra' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closing (the host unmounts the dialog) releases every video track', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { unmount } = render(
      <BloodCameraAssist gpsReading={goodFix()} onClose={onClose} />,
    )
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
    expect(trackStop).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Fermer la caméra' }))
    expect(onClose).toHaveBeenCalled()
    unmount()
    expect(trackStop).toHaveBeenCalled()
  })

  it('asks for a fresh stream when coming back from the background with a cut stream', async () => {
    const liveTrack = {
      stop: vi.fn(),
      readyState: 'live' as string,
      getSettings: () => ({}),
    }
    const stream = { getTracks: () => [liveTrack], getVideoTracks: () => [liveTrack] }
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    // Still live: coming back changes nothing.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    // iOS cut the camera in the background.
    liveTrack.readyState = 'ended'
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
  })

  it('no camera support (insecure context / absent): says so and offers the photo import', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    })
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/pas pris en charge/)
    expect(screen.getByRole('button', { name: /Importer une photo/ })).toBeVisible()
  })

  it('an imported photo is labelled as such (not the live view) and goes through the same confirmation', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() }),
    )
    await openSession()
    render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
    const input = screen.getByLabelText('Choisir une photo à analyser')
    await user.upload(input, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
    expect(
      await screen.findByText(/Photo importée : ce n’est pas le flux en direct/),
    ).toBeVisible()
    expect(await db.waypoints.count()).toBe(0)
    await user.click(screen.getByRole('button', { name: /Confirmer un indice/ }))
    await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
  })

  describe('« + Repère » from the camera', () => {
    const oldFix = (): GeolocationReading => ({
      status: 'available',
      confidence: 'measured',
      source: 'browser-geolocation',
      value: {
        lat: 46.8,
        lng: -71.2,
        accuracyMeters: 5,
        timestampMs: Date.now() - 3 * 60_000,
      },
    })

    async function openMark(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: /\+ Repère/ }))
      return screen.getByTestId('camera-mark')
    }

    it('shows the phone position with accuracy and age, never the image centre', async () => {
      const user = userEvent.setup()
      await openSession()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      const sheet = await openMark(user)
      expect(screen.getByTestId('mark-gps')).toHaveTextContent(
        /Position du téléphone : ±5 m/,
      )
      expect(sheet).toHaveTextContent(/la caméra ne localise pas ce qu’elle montre/)
      expect(screen.getByTestId('mark-target')).toHaveTextContent(/rattaché/)
    })

    it('Sang / indice: ONE point at the GPS position, attached to the open search, then back to the camera', async () => {
      const user = userEvent.setup()
      await openSession()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await openMark(user)
      const save = screen.getByTestId('mark-save')
      // A double tap must not create two points.
      await user.dblClick(save)
      await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
      const [clue] = await db.waypoints.toArray()
      expect(clue).toMatchObject({
        category: 'blood',
        bloodKind: 'blood',
        origin: 'gps',
        coordinate: { lat: 46.8, lng: -71.2 },
      })
      expect(await db.photos.count()).toBe(0)
      expect(await screen.findByTestId('camera-notice')).toHaveTextContent(/enregistré/)
      expect(screen.queryByTestId('camera-mark')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Capturer/ })).toBeEnabled()
      expect(await db.waypoints.count()).toBe(1)
    })

    it('Repère normal: an ordinary waypoint, not a blood clue, and no trace is started', async () => {
      const user = userEvent.setup()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await openMark(user)
      await user.click(screen.getByRole('button', { name: 'Repère normal' }))
      await user.click(screen.getByTestId('mark-save'))
      await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
      const [waypoint] = await db.waypoints.toArray()
      expect(waypoint.category).toBe('general')
      expect(waypoint.bloodKind).toBeUndefined()
      expect(waypoint.coordinate).toMatchObject({ lat: 46.8, lng: -71.2 })
      expect(useTracksStore.getState().status).toBe('idle')
      expect(await db.bloodSessions.count()).toBe(0)
    })

    it('no search open: nothing is created or started until the user chooses', async () => {
      const user = userEvent.setup()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await openMark(user)
      await user.click(screen.getByTestId('mark-save'))
      expect(await screen.findByTestId('clue-gate')).toBeInTheDocument()
      expect(await db.waypoints.count()).toBe(0)
      expect(await db.bloodSessions.count()).toBe(0)
      expect(useTracksStore.getState().status).toBe('idle')

      await user.click(
        screen.getByRole('button', { name: /Créer une recherche et démarrer ma trace/ }),
      )
      await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
      expect(await db.bloodSessions.count()).toBe(1)
    })

    it.each([
      ['absent', NO_GPS, /Position GPS indisponible/],
      ['too old', oldFix(), /dernière position trop ancienne/],
    ])(
      'GPS %s: no save at the phone position; the user places it on the map',
      async (_n, reading, text) => {
        const user = userEvent.setup()
        await openSession()
        render(<BloodCameraAssist gpsReading={reading} onClose={vi.fn()} />)
        await openMark(user)
        expect(screen.getByTestId('mark-gps')).toHaveTextContent(text)
        expect(screen.getByTestId('mark-save')).toBeDisabled()
        expect(await db.waypoints.count()).toBe(0)

        await user.click(screen.getByRole('button', { name: /Placer sur la carte/ }))
        const placing = await screen.findByTestId('camera-placing')
        expect(placing).toHaveTextContent(/pas à la position du téléphone/)
        const save = screen.getByRole('button', { name: /Enregistrer l’indice ici/ })
        expect(save).toBeDisabled()
        act(() => useBloodStore.getState().setManualCoordinate({ lat: 46.9, lng: -71.3 }))
        await waitFor(() => expect(save).toBeEnabled())
        await user.click(save)
        await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
        const [clue] = await db.waypoints.toArray()
        expect(clue).toMatchObject({
          origin: 'manual',
          coordinate: { lat: 46.9, lng: -71.3 },
        })
        expect(await screen.findByTestId('camera-notice')).toBeInTheDocument()
        expect(screen.queryByTestId('camera-placing')).not.toBeInTheDocument()
      },
    )

    it('a kept capture is attached ONLY when asked, never automatically', async () => {
      const user = userEvent.setup()
      await openSession()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: /Capturer/ }))
      await user.click(
        await screen.findByRole('button', { name: /Garder et revenir à la caméra/ }),
      )
      expect(await db.waypoints.count()).toBe(0)
      expect(screen.queryByTestId('capture-review')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /\+ Repère/ }))
      const attach = screen.getByRole('checkbox', {
        name: /Joindre la capture que je viens de prendre/,
      })
      expect(attach).not.toBeChecked()
      await user.click(screen.getByTestId('mark-save'))
      await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
      expect(await db.photos.count()).toBe(0)

      // Once a point is saved, the kept capture is released: it is not offered again.
      await user.click(screen.getByRole('button', { name: /\+ Repère/ }))
      expect(
        screen.queryByRole('checkbox', { name: /Joindre la capture/ }),
      ).not.toBeInTheDocument()
    })

    it('a kept capture joined on request is saved with the clue', async () => {
      const user = userEvent.setup()
      await openSession()
      render(<BloodCameraAssist gpsReading={goodFix()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText(/Capturer/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: /Capturer/ }))
      await user.click(
        await screen.findByRole('button', { name: /Garder et revenir à la caméra/ }),
      )
      await user.click(screen.getByRole('button', { name: /\+ Repère/ }))
      await user.click(screen.getByRole('checkbox', { name: /Joindre la capture/ }))
      await user.click(screen.getByTestId('mark-save'))
      await waitFor(async () => expect(await db.photos.count()).toBe(1))
      const [clue] = await db.waypoints.toArray()
      const [photo] = await db.photos.toArray()
      expect(photo.waypointId).toBe(clue.id)
      expect(photo.originalBlob).toBeDefined()
    })
  })
})
