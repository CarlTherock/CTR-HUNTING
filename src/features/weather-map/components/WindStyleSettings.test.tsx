import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within as rtlWithin } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { DEFAULT_WIND_STYLE } from '@/utils/windStyle'
import { useWindStyleStore } from '../state/windStyleStore'
import { WindStyleSettings } from './WindStyleSettings'

function Harness() {
  const style = useWindStyleStore((s) => s.style)
  const update = useWindStyleStore((s) => s.update)
  return <WindStyleSettings style={style} onChange={(p) => void update(p)} />
}

afterEach(async () => {
  await db.settings.clear()
  useWindStyleStore.setState({ style: DEFAULT_WIND_STYLE, loaded: false })
})

describe('WindStyleSettings', () => {
  it('size, thickness, density and contrast are independent and saved', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const size = screen.getByRole('radiogroup', { name: 'Taille du vent' })
    await user.click(within(size, 'Très grand'))
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Épaisseur' }), 'Épaisse'),
    )
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Densité' }), 'Faible'),
    )
    await user.click(screen.getByRole('switch', { name: /Contraste renforcé/ }))

    expect(useWindStyleStore.getState().style).toEqual({
      size: 'xlarge',
      thickness: 'thick',
      density: 'low',
      contrast: true,
    })
    await waitFor(async () =>
      expect((await db.settings.get('windStyle'))?.value).toEqual({
        size: 'xlarge',
        thickness: 'thick',
        density: 'low',
        contrast: true,
      }),
    )
  })

  it('changing the size leaves the density untouched', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Taille du vent' }), 'Grand'),
    )
    expect(useWindStyleStore.getState().style.density).toBe('normal')
    expect(useWindStyleStore.getState().style.size).toBe('large')
  })

  it('states that only the display changes, not the wind values', () => {
    render(<Harness />)
    expect(
      screen.getByText(/la vitesse et la direction du vent ne changent/i),
    ).toBeInTheDocument()
  })
})

function within(group: HTMLElement, name: string) {
  return rtlWithin(group).getByRole('radio', { name })
}
