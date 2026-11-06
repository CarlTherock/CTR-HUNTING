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

  it('draws a red zone centred on the arrow tip, so it moves with the flow', () => {
    const { rerender } = render(<WindCompass directionDegrees={180} speedKmh={20} />)
    const north = screen.getByTestId('scent-danger-zone').getAttribute('d')
    expect(north).toBeTruthy()
    rerender(<WindCompass directionDegrees={270} speedKmh={20} />)
    const east = screen.getByTestId('scent-danger-zone').getAttribute('d')
    expect(east).toBeTruthy()
    expect(east).not.toBe(north)
  })
})
