import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WindCompass } from './WindCompass'

describe('WindCompass', () => {
  it('renders a real compass dial with N/E/S/O labels', () => {
    render(<WindCompass directionDegrees={270} speedKmh={20} />)

    const svg = screen.getByRole('img', { name: 'Boussole du vent' })
    expect(svg).toBeInTheDocument()
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['N', 'E', 'S', 'O'])
  })

  it('draws a green optimal-direction wedge only when optimalDirections is provided', () => {
    const { container: withOptimal } = render(
      <WindCompass directionDegrees={270} speedKmh={20} optimalDirections={[270]} />,
    )
    expect(withOptimal.querySelector('.fill-status-success\\/20')).toBeTruthy()

    const { container: withoutOptimal } = render(
      <WindCompass directionDegrees={270} speedKmh={20} />,
    )
    expect(withoutOptimal.querySelector('.fill-status-success\\/20')).toBeNull()
  })

  it('the arrow points where the wind goes: wind from the south → toward the north', () => {
    render(<WindCompass directionDegrees={180} speedKmh={20} />)
    const svg = screen.getByRole('img', { name: 'Boussole du vent' })
    expect(svg).toHaveAttribute('data-flow-degrees', '0')
    expect(screen.getByTestId('wind-arrow')).toBeInTheDocument()
  })

  it('always draws the red NW–N–NE zone, and flags danger only when the flow enters it', () => {
    const { rerender } = render(<WindCompass directionDegrees={180} speedKmh={20} />)
    expect(screen.getByTestId('scent-danger-zone')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Boussole du vent' })).toHaveAttribute(
      'data-scent-danger',
      'true',
    )
    rerender(<WindCompass directionDegrees={270} speedKmh={20} />)
    expect(screen.getByTestId('scent-danger-zone')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Boussole du vent' })).toHaveAttribute(
      'data-scent-danger',
      'false',
    )
  })
})
