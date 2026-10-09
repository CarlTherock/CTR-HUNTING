import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WindField } from '@/types'
import { localHourKey } from '@/utils/windField'
import { useWindStore } from '../state/windStore'
import { useWindAnalysisStore } from '../state/windAnalysisStore'
import { WindAnalysisPanel } from './WindAnalysisPanel'
import { WindPanel } from './WindPanel'

/**
 * La feuille « Analyse du vent » et le panneau « Vent » de la page Météo lisent
 * et écrivent le MÊME curseur horaire (`windStore.selectedHourOffset`) : jamais
 * deux heures contradictoires. Créneaux de test : vitesse = 3 + indice km/h,
 * direction = 7° × indice.
 */
const HERE = { lat: 46.8, lng: -71.2 }
const BOUNDS = () => ({ west: -71.3, south: 46.7, east: -71.1, north: 46.9 })

function fixture(): WindField {
  const today = localHourKey(new Date(), 'America/Toronto').slice(0, 10)
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const tomorrow = next.toISOString().slice(0, 10)
  const hourly = Array.from({ length: 48 }, (_, i) => ({
    time: `${i < 24 ? today : tomorrow}T${String(i % 24).padStart(2, '0')}:00`,
    directionDegrees: (i * 7) % 360,
    speedKmh: 3 + i,
    gustsKmh: 10 + i,
    temperatureCelsius: 10,
    precipitationMm: 0,
    cloudCoverPercent: 0,
  }))
  return { timezone: 'America/Toronto', samples: [{ coordinate: HERE, hourly }] }
}

beforeEach(() => {
  useWindStore.setState({
    field: fixture(),
    status: 'available',
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    enabled: true,
    selectedHourOffset: 10,
  })
  useWindAnalysisStore.setState({ open: true, expanded: true })
})

afterEach(() => {
  cleanup()
  useWindStore.setState({ field: null, status: 'idle', selectedHourOffset: 0 })
  useWindAnalysisStore.setState({ open: false, expanded: true })
})

describe('WindAnalysisPanel × panneau Vent de la page Météo', () => {
  it('déplacer la barre déplace aussi le panneau Vent', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WindAnalysisPanel viewCenter={HERE} getBounds={BOUNDS} />
        <WindPanel coordinate={HERE} />
      </>,
    )
    const bar = await screen.findByRole('slider', {
      name: 'Heure de la prévision de vent',
    })
    bar.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(useWindStore.getState().selectedHourOffset).toBe(13)
    // 3 + 13 = 16 km/h partout, une seule heure
    expect(screen.getByTestId('wind-readout')).toHaveTextContent('16 km/h')
    expect(screen.getByText(/Rafales 23 km\/h/)).toBeVisible()
  })

  it('choisir une heure dans le panneau Vent déplace la barre et la feuille', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WindAnalysisPanel viewCenter={HERE} getBounds={BOUNDS} />
        <WindPanel coordinate={HERE} />
      </>,
    )
    const hours = screen.getAllByRole('button', { name: /^\d\d:00/ })
    const target = hours.find((b) => b.textContent?.startsWith('12:00'))
    expect(target).toBeDefined()
    if (!target) return
    await user.click(target)
    expect(useWindStore.getState().selectedHourOffset).toBe(12)
    const bar = screen.getByRole('slider', { name: 'Heure de la prévision de vent' })
    expect(bar).toHaveAttribute('aria-valuenow', '12')
    expect(screen.getByTestId('wind-readout')).toHaveTextContent('15 km/h')
  })

  it('un changement fait ailleurs (graphique, Soleil et Lune) met la barre à jour', async () => {
    render(<WindAnalysisPanel viewCenter={HERE} getBounds={BOUNDS} />)
    act(() => useWindStore.getState().setSelectedHourOffset(30))
    const bar = await screen.findByRole('slider', {
      name: 'Heure de la prévision de vent',
    })
    expect(bar).toHaveAttribute('aria-valuenow', '30')
    // le jour affiché suit : 30 = demain 06:00
    expect(screen.getByRole('button', { name: 'Demain' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('wind-readout')).toHaveTextContent('33 km/h')
  })
})
