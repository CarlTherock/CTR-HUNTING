import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import RutPage from './RutPage'

describe('RutPage', () => {
  it('shows two separate bands, the non-local caveat and an empty observation state', async () => {
    render(
      <MemoryRouter>
        <RutPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', {
        name: /Repères saisonniers du rut — contexte québécois/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('rut-band-quebec')).toBeInTheDocument()
    expect(screen.getByTestId('rut-band-wisconsin')).toBeInTheDocument()
    expect(
      screen.getByText(/Étude externe — non calibrée pour le Québec/),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/non calibrée pour votre territoire/).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/pas le calendrier biologique/)).toBeInTheDocument()
    expect(await screen.findByText(/Aucune observation de cerf/)).toBeInTheDocument()
    expect(screen.queryByText(/6 novembre au 17 décembre/)).toBeNull()
  })
})
