import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { analyzeSpatial, defaultSpatialParams } from '../spatial/analyzeSpatial'
import { makeProjection } from '../spatial/geo'
import { useHuntStore } from '../state/huntStore'
import { DEFAULT_INPUTS } from '../state/compose'
import { RutLocationPanel } from '@/features/rut/RutLocationPanel'

const initial = useHuntStore.getState()
afterEach(() => { cleanup(); useHuntStore.setState(initial, true) })

describe('Balayage et rut intégrés', () => {
  it('dessine les milieux même sans secteur ni point recommandé, strictement dans le cercle', () => {
    const params = defaultSpatialParams({ lat: 45.87762, lng: -71.82639 }, 300)
    const p = makeProjection(params.extent.center)
    const ring = [[-600, -600], [600, -600], [600, 600], [-600, 600], [-600, -600]].map(([x, y]) => p.toCoordinate(x, y))
    const a = analyzeSpatial(params, { polygons: [{ id: 'wet', landClass: 'wetland', rings: [ring] }], source: 'gabarit de test', fetchedAt: '2026-11-08T12:00:00Z' })
    expect(a.sectors).toHaveLength(0)
    expect(a.candidates).toHaveLength(0)
    expect(a.survey?.features.length).toBeGreaterThan(0)
    for (const f of a.survey?.features ?? []) {
      expect(f.properties.landClass).toBe('wetland')
      for (const [lng, lat] of f.geometry.coordinates[0]) { const q = p.toMeters({ lat, lng }); expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(300.01) }
    }
  })

  it('ne suppose aucune localisation', () => {
    useHuntStore.setState({ result: null, inputs: { ...DEFAULT_INPUTS } })
    render(<MemoryRouter><RutLocationPanel dateKey="2026-11-08"/></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Choisir sur la carte' })).toBeVisible()
    expect(screen.queryByTestId('rut-location-plan')).toBeNull()
    expect(screen.queryByText('11–17 novembre 2026')).toBeNull()
  })

  it('lie la période au point et à la date choisis sans inventer de pic biologique', () => {
    useHuntStore.setState({ result: null, inputs: { ...DEFAULT_INPUTS, coordinate: { lat: 45.87762, lng: -71.82639 } } })
    render(<MemoryRouter><RutLocationPanel dateKey="2026-11-08"/></MemoryRouter>)
    const panel = screen.getByTestId('rut-location-plan')
    expect(panel).toHaveAttribute('data-lat', '45.87762')
    expect(panel).toHaveAttribute('data-lng', '-71.82639')
    expect(screen.getByText('08/11/2026 — 14/11/2026')).toBeVisible()
    expect(screen.getByText('Novembre et décembre')).toBeVisible()
    expect(screen.getByText(/Aucun pic local calculé/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Analyser ces sept jours et ce territoire' })).toBeVisible()
    expect(screen.queryByText('11–17 novembre 2026')).toBeNull()
    expect(screen.queryByText('Mi-novembre')).toBeNull()
  })

  it('actualise la période affichée quand la date change, même au changement d’année', () => {
    useHuntStore.setState({ result: null, inputs: { ...DEFAULT_INPUTS, coordinate: { lat: 45.87762, lng: -71.82639 } } })
    const { rerender } = render(<MemoryRouter><RutLocationPanel dateKey="2026-11-08"/></MemoryRouter>)
    expect(screen.getByText('08/11/2026 — 14/11/2026')).toBeVisible()
    rerender(<MemoryRouter><RutLocationPanel dateKey="2026-12-29"/></MemoryRouter>)
    expect(screen.getByText('29/12/2026 — 04/01/2027')).toBeVisible()
    expect(screen.queryByText('08/11/2026 — 14/11/2026')).toBeNull()
    expect(screen.getByTestId('rut-location-plan')).toHaveAttribute('data-lat', '45.87762')
  })

  it('n’applique pas le calendrier continental québécois en Ontario', () => {
    useHuntStore.setState({ result: null, inputs: { ...DEFAULT_INPUTS, coordinate: { lat: 44, lng: -80.5 } } })
    render(<MemoryRouter><RutLocationPanel dateKey="2026-11-08"/></MemoryRouter>)
    expect(screen.getByText('Territoire non couvert')).toBeVisible()
    expect(screen.getByText(/Le contexte du Québec continental n’est pas extrapolé à ce point/)).toBeVisible()
    expect(screen.queryByText('Novembre et décembre')).toBeNull()
    expect(screen.queryByText('11–17 novembre 2026')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Analyser ces sept jours et ce territoire' })).toBeNull()
  })
})
