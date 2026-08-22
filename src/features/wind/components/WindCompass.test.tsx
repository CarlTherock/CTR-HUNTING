import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WindCompass } from './WindCompass'

describe('WindCompass', () => {
  it('renders a real compass dial with N/E/S/W labels', () => {
    render(<WindCompass directionDegrees={270} speedKmh={20} />)

    const svg = screen.getByRole('img', { name: 'Wind compass' })
    expect(svg).toBeInTheDocument()
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toEqual(['N', 'E', 'S', 'W'])
  })

  it('draws a green optimal-direction wedge only when optimalDirections is provided', () => {
    const { container: withOptimal } = render(
      <WindCompass directionDegrees={270} speedKmh={20} optimalDirections={[270]} />,
    )
    expect(withOptimal.querySelector('.fill-status-success\\/20')).toBeTruthy()

    const { container: withoutOptimal } = render(<WindCompass directionDegrees={270} speedKmh={20} />)
    expect(withoutOptimal.querySelector('.fill-status-success\\/20')).toBeNull()
  })
})
