import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NBSP, THIN_NBSP } from '@/utils/format'
import { useMeasureStore } from '../state/measureStore'
import { MeasurePanel, EPHEMERAL_NOTE } from './MeasurePanel'

// 0.01° x 0.01° box at 46.8°N: independent spherical reference 846 316,72 m²
// (R² · Δλ · (sin φ2 − sin φ1)), i.e. 84,63 ha, 209,13 acres.
const BOX = [
  { lat: 46.8, lng: -71.2 },
  { lat: 46.8, lng: -71.19 },
  { lat: 46.81, lng: -71.19 },
  { lat: 46.81, lng: -71.2 },
]

/** Testing Library collapses NBSP like any whitespace by default: keep the
 * exact characters so the French separators are really asserted. */
const RAW = { normalizer: (text: string) => text }

function tap(points: { lat: number; lng: number }[]) {
  act(() => {
    for (const p of points) useMeasureStore.getState().addPoint(p)
  })
}

afterEach(() => {
  cleanup()
  useMeasureStore.getState().close()
  useMeasureStore.setState({ collapsed: false })
})

describe('MeasurePanel', () => {
  it('renders nothing while no measurement is open', () => {
    const { container } = render(<MeasurePanel queryElevation={() => null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('distance: labels path, bird-flight and 3D separately; 3D is unavailable without elevation', () => {
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('distance'))
    expect(screen.getByText(/au moins 2 points/)).toBeInTheDocument()
    tap([BOX[0], BOX[1], BOX[2]])

    expect(screen.getByText(/Longueur du tracé/)).toBeInTheDocument()
    expect(screen.getByText(/Distance à vol d’oiseau/)).toBeInTheDocument()
    expect(screen.getByText(/Distance 3D/)).toBeInTheDocument()
    expect(screen.getByText('indisponible : élévation non chargée')).toBeInTheDocument()
    // 0.01° of longitude at 46.8°N ≈ 762 m, 0.01° of latitude ≈ 1 112 m: 1 874 m path.
    expect(
      screen.getByText(new RegExp(`^1${THIN_NBSP}87\\d,\\d${NBSP}m`), RAW),
    ).toBeInTheDocument()
  })

  it('distance: shows a 3D figure when every point has an elevation', () => {
    render(<MeasurePanel queryElevation={(c) => (c.lat === BOX[0].lat ? 100 : 200)} />)
    act(() => useMeasureStore.getState().start('distance'))
    tap([BOX[0], BOX[1]])
    expect(screen.queryByText(/élévation non chargée/)).not.toBeInTheDocument()
    expect(screen.getByText(/Distance 3D/).nextSibling).toHaveTextContent(/\d/)
  })

  it('distance: no 3D figure when a single point lacks elevation', () => {
    render(<MeasurePanel queryElevation={(c) => (c.lng === BOX[1].lng ? null : 120)} />)
    act(() => useMeasureStore.getState().start('distance'))
    tap([BOX[0], BOX[1], BOX[2]])
    expect(screen.getByText('indisponible : élévation non chargée')).toBeInTheDocument()
  })

  it('area: shows ha, m² and acres in French for the reference box', () => {
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('area'))
    tap(BOX)

    expect(screen.getByText(`84,63${NBSP}ha`, RAW)).toBeInTheDocument()
    expect(screen.getByText(`846${THIN_NBSP}317${NBSP}m²`, RAW)).toBeInTheDocument()
    expect(screen.getByText(`209,13${NBSP}acres`, RAW)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('area: warns about a crossed polygon', () => {
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('area'))
    tap([BOX[0], BOX[2], BOX[1], BOX[3]])
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Polygone croisé : l’aire peut ne pas représenter la zone.',
    )
  })

  it('area: asks for 3 points and keeps Terminer disabled until then', () => {
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('area'))
    tap(BOX.slice(0, 2))
    expect(screen.getByText(/au moins 3 points/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeDisabled()
  })

  it('undo, finish (locks) and clear work from the buttons', async () => {
    const user = userEvent.setup()
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('area'))
    tap(BOX)

    await user.click(screen.getByRole('button', { name: 'Annuler le dernier point' }))
    expect(useMeasureStore.getState().points).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Terminer' }))
    expect(screen.getByTestId('measure-status')).toHaveTextContent('Terminée')
    expect(
      screen.getByRole('button', { name: 'Annuler le dernier point' }),
    ).toBeDisabled()
    tap([{ lat: 1, lng: 1 }])
    expect(useMeasureStore.getState().points).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Effacer' }))
    expect(useMeasureStore.getState().points).toEqual([])
    expect(screen.getByTestId('measure-status')).toHaveTextContent('Mode actif')
  })

  it('states that the measurement is not saved, and lists the point coordinates', () => {
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('distance'))
    tap(BOX.slice(0, 2))
    expect(screen.getByText(EPHEMERAL_NOTE)).toBeInTheDocument()
    const list = screen.getByRole('list', { hidden: true })
    expect(within(list).getAllByRole('listitem', { hidden: true })).toHaveLength(2)
  })

  it('shows the paused state with a resume button, and quitting closes the panel', async () => {
    const user = userEvent.setup()
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('distance'))
    act(() => useMeasureStore.getState().pause())
    expect(screen.getByTestId('measure-status')).toHaveTextContent('En pause')
    await user.click(screen.getByRole('button', { name: 'Reprendre' }))
    expect(useMeasureStore.getState().active).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Quitter la mesure' }))
    expect(screen.queryByTestId('measure-panel')).not.toBeInTheDocument()
  })

  it('folds the results body but keeps the actions reachable', async () => {
    const user = userEvent.setup()
    render(<MeasurePanel queryElevation={() => null} />)
    act(() => useMeasureStore.getState().start('area'))
    tap(BOX)
    await user.click(screen.getByRole('button', { name: 'Réduire les résultats' }))
    expect(screen.queryByTestId('measure-body')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/84,63/)
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Agrandir les résultats' }))
    expect(screen.getByTestId('measure-body')).toBeInTheDocument()
  })
})
