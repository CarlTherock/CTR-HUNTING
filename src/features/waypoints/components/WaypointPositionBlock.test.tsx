import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useWaypointsStore } from '../state/waypointsStore'
import { WaypointEditPanel } from './WaypointEditPanel'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { Waypoint } from '@/types'

/**
 * Coordinate display, copy and share of a saved waypoint. Clipboard and
 * Web Share are SIMULATED (jsdom stubs): this proves the app's logic, not
 * behaviour on iOS Safari or in a real share sheet.
 */
const WAYPOINT: Waypoint = {
  id: 'w1',
  name: 'Mirador nord',
  coordinate: { lat: 46.813894, lng: -71.208 },
  category: 'stand_blind',
  notes: 'NOTE-PRIVEE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function setNav(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true, writable: true })
}

function openSavedWaypoint() {
  useWaypointsStore.setState({ waypoints: [WAYPOINT], editingId: 'w1', draft: null })
}

async function setup(gpsReading?: GeolocationReading, stubs: { share?: unknown } = {}) {
  // userEvent.setup() installs its own clipboard stub: tests override it afterwards.
  const user = userEvent.setup()
  if (stubs.share) setNav('share', stubs.share)
  openSavedWaypoint()
  render(<WaypointEditPanel gpsReading={gpsReading} />)
  return user
}

beforeEach(() => {
  setNav('share', undefined)
  setNav('canShare', undefined)
})

afterEach(() => {
  setNav('clipboard', undefined)
  setNav('share', undefined)
  useWaypointsStore.setState({ waypoints: [], editingId: null, draft: null })
})

describe('saved waypoint sheet — coordinates', () => {
  it('shows the name and big, labelled, French-formatted coordinates', async () => {
    await setup()

    const block = screen.getByRole('region', { name: 'Position du waypoint' })
    expect(within(block).getByText('Position du waypoint')).toBeVisible()
    expect(within(block).getByTestId('waypoint-name')).toHaveTextContent('Mirador nord')
    expect(within(block).getByText('Latitude')).toBeVisible()
    expect(within(block).getByText('Longitude')).toBeVisible()
    const lat = within(block).getByTestId('waypoint-latitude')
    const lng = within(block).getByTestId('waypoint-longitude')
    expect(lat).toHaveTextContent('46,81389° N')
    expect(lng).toHaveTextContent('71,20800° O')
    for (const el of [lat, lng, within(block).getByTestId('waypoint-name')]) {
      expect(el.className).toContain('text-2xl')
      expect(el.style.userSelect).toBe('text')
    }
    expect(lat.className).toContain('tabular-nums')
    expect(
      within(block).getByText(
        'Les décimales affichées ne mesurent pas la précision du GPS.',
      ),
    ).toBeVisible()
  })

  it('stays locked: no coordinate field, and the stored value is not rounded', async () => {
    await setup()
    expect(screen.getByText(/Position verrouillée/)).toBeVisible()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(useWaypointsStore.getState().waypoints[0].coordinate.lat).toBe(46.813894)
  })

  it('copies signed decimals and confirms only after the copy really succeeded', async () => {
    const user = await setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNav('clipboard', { writeText })

    expect(screen.queryByText('Coordonnées copiées')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Copier les coordonnées' }))

    expect(writeText).toHaveBeenCalledWith('46.81389, -71.20800')
    expect(await screen.findByText('Coordonnées copiées')).toBeVisible()
  })

  it('shows an alert and NO confirmation when the clipboard refuses', async () => {
    const user = await setup()
    setNav('clipboard', {
      writeText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    })

    await user.click(screen.getByRole('button', { name: 'Copier les coordonnées' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Copie impossible — sélectionnez et copiez le texte manuellement.',
    )
    expect(screen.queryByText('Coordonnées copiées')).toBeNull()
  })
})

describe('saved waypoint sheet — sharing a point', () => {
  it('shares through the native sheet and says so', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const user = await setup(undefined, { share })

    await user.click(screen.getByRole('button', { name: 'Partager ce point' }))

    expect(share).toHaveBeenCalledTimes(1)
    const data = share.mock.calls[0][0] as { title: string; text: string; url: string }
    expect(data.title).toBe('Mirador nord')
    expect(data.text).toContain('46,81389° N')
    expect(data.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=46.813894%2C-71.208',
    )
    expect(JSON.stringify(data)).not.toContain('NOTE-PRIVEE')
    expect(await screen.findByText('Partage effectué.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Copier le texte / lien' })).toBeNull()
  })

  it('a cancelled share (AbortError) shows nothing alarming', async () => {
    const user = await setup(undefined, {
      share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')),
    })

    await user.click(screen.getByRole('button', { name: 'Partager ce point' }))

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Partager ce point' })).toBeEnabled(),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copier le texte / lien' })).toBeNull()
  })

  it('without Web Share the fallback copy is visible at once, and confirms on success', async () => {
    const user = await setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNav('clipboard', { writeText })

    expect(screen.queryByRole('button', { name: 'Partager ce point' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Copier le texte / lien' }))

    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('Mirador nord')
    expect(copied).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(copied).toContain('CTR Hunting : ')
    expect(await screen.findByText('Texte et lien copiés.')).toBeVisible()
  })

  it('a failing native share offers the copy fallback', async () => {
    const user = await setup(undefined, {
      share: vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError')),
    })
    setNav('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) })

    await user.click(screen.getByRole('button', { name: 'Partager ce point' }))
    const fallback = await screen.findByRole('button', { name: 'Copier le texte / lien' })
    await user.click(fallback)

    expect(await screen.findByText('Texte et lien copiés.')).toBeVisible()
  })

  it('does not confirm a failed fallback copy and shows the text to copy by hand', async () => {
    const user = await setup()
    setNav('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('no')) })

    await user.click(screen.getByRole('button', { name: 'Copier le texte / lien' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Copie impossible')
    expect(screen.queryByText('Texte et lien copiés.')).toBeNull()
    expect(screen.getByTestId('waypoint-manual-text')).toHaveTextContent('Mirador nord')
  })

  it('never shares anything on its own', async () => {
    const share = vi.fn()
    await setup(undefined, { share })
    expect(share).not.toHaveBeenCalled()
  })
})

describe('saved waypoint sheet — "Ma position" block', () => {
  const NOW = Date.now()
  const fix = (ageMs: number): GeolocationReading => ({
    status: 'available',
    value: { lat: 46.5, lng: -71.25, accuracyMeters: 7.4, timestampMs: NOW - ageMs },
    confidence: 'measured',
    source: 'browser-geolocation',
  })

  it('is separate from the waypoint block and absent without a GPS source', async () => {
    await setup()
    expect(screen.queryByTestId('my-position')).toBeNull()
  })

  it('says it is searching, without any coordinates, when there is no fix yet', async () => {
    await setup({
      status: 'unavailable',
      kind: 'searching',
      reason: 'En attente d’un signal GPS.',
    })
    const block = screen.getByTestId('my-position')
    expect(within(block).getByTestId('gps-state')).toHaveTextContent('Recherche…')
    expect(within(block).getByTestId('gps-reason')).toHaveTextContent('En attente')
    expect(within(block).queryByText(/°/)).toBeNull()
    expect(
      within(block).queryByRole('button', { name: 'Partager ma position' }),
    ).toBeNull()
  })

  it('says Refusé with the reason when permission is denied', async () => {
    await setup({
      status: 'unavailable',
      kind: 'denied',
      reason: 'Autorisation de localisation refusée.',
    })
    const block = screen.getByTestId('my-position')
    expect(within(block).getByTestId('gps-state')).toHaveTextContent('Refusé')
    expect(within(block).getByTestId('gps-reason')).toHaveTextContent('refusée')
  })

  it('shows accuracy and age of a recent fix, and offers the snapshot share', async () => {
    await setup(fix(4000))
    const block = screen.getByTestId('my-position')
    expect(within(block).getByTestId('gps-state')).toHaveTextContent('Disponible')
    expect(within(block).getByTestId('gps-accuracy-age')).toHaveTextContent(
      /Précision ±7 m · relevé il y a \d+ s/,
    )
    expect(within(block).getByTestId('snapshot-explanation')).toHaveTextContent(
      'Instantané de ma position — pas un suivi en direct.',
    )
    expect(
      within(block).getByRole('button', { name: 'Copier le texte / lien' }),
    ).toBeVisible()
  })

  it('labels an old (but not stale) fix Ancien with a warning', async () => {
    await setup(fix(60_000))
    expect(screen.getByTestId('gps-state')).toHaveTextContent('Ancien')
    expect(screen.getByTestId('gps-warning')).toHaveTextContent('plus récent')
  })

  it('does not offer sharing for a stale fix', async () => {
    await setup(fix(10 * 60_000))
    expect(screen.getByTestId('gps-state')).toHaveTextContent('Ancien')
    expect(screen.getByTestId('gps-warning')).toHaveTextContent('trop ancien')
    expect(screen.queryByTestId('snapshot-explanation')).toBeNull()
    expect(screen.queryByTestId('position-share')).toBeNull()
  })

  it('shares only a snapshot of the position (not the waypoint) when asked', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const user = await setup(fix(2000), { share })
    // The waypoint's own share button and the position's both exist now.
    const positionShare = within(screen.getByTestId('position-share'))
    await user.click(positionShare.getByRole('button', { name: 'Partager ma position' }))

    const data = share.mock.calls[0][0] as { title: string; text: string }
    expect(data.title).toBe('Ma position (instantané)')
    expect(data.text).toContain('Précision : ±7 m')
    expect(data.text).toContain('Instantané de ma position — pas un suivi en direct.')
    expect(data.text).not.toContain('Mirador nord')
  })
})
