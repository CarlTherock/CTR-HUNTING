import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { WeatherMapFrame } from '@/types'
import { TimelineBar } from './TimelineBar'

const NOW = new Date(2026, 10, 3, 14, 0)
const frames = Array.from({ length: 24 }, (_, i) => ({
  time: new Date(2026, 10, 3, 14 + i, 0).toISOString(),
  kind: 'forecast',
})) as unknown as WeatherMapFrame[]

function setup(frameIndex = 0) {
  const onSeek = vi.fn()
  const onPlayingChange = vi.fn()
  const onStep = vi.fn()
  render(
    <TimelineBar
      frames={frames}
      frameIndex={frameIndex}
      playing
      now={NOW}
      maxTicks={5}
      onPlayingChange={onPlayingChange}
      onStep={onStep}
      onSeek={onSeek}
    />,
  )
  return { onSeek, onPlayingChange, onStep }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('TimelineBar', () => {
  it('shows day, hour and the observed/forecast distinction and the available period', () => {
    setup()
    expect(screen.getByTestId('frame-readout')).toHaveTextContent(/mardi 3 novembre/i)
    expect(screen.getByText(/^Prévu/)).toBeInTheDocument()
    expect(screen.getByText(/Période disponible/)).toHaveTextContent(/\(prévue\)/)
  })

  it('dragging moves the readout at once but commits to the map only when it rests', () => {
    const { onSeek, onPlayingChange } = setup()
    const slider = screen.getByRole('slider', { name: 'Ligne du temps' })
    fireEvent.change(slider, { target: { value: '5' } })
    fireEvent.change(slider, { target: { value: '9' } })
    fireEvent.change(slider, { target: { value: '12' } })
    expect(onPlayingChange).toHaveBeenCalledWith(false)
    expect(onSeek).not.toHaveBeenCalled()
    expect(screen.getByTestId('frame-readout')).toHaveTextContent(/2 h/)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(12)
  })

  it('releasing the slider commits immediately, once', () => {
    const { onSeek } = setup()
    const slider = screen.getByRole('slider', { name: 'Ligne du temps' })
    fireEvent.change(slider, { target: { value: '7' } })
    fireEvent.pointerUp(slider)
    expect(onSeek).toHaveBeenCalledWith(7)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onSeek).toHaveBeenCalledTimes(1)
  })

  it('previous / next / play use the store callbacks', () => {
    const { onStep, onPlayingChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Image précédente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Image suivante' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(onStep).toHaveBeenNthCalledWith(1, -1)
    expect(onStep).toHaveBeenNthCalledWith(2, 1)
    expect(onPlayingChange).toHaveBeenCalledWith(false)
  })
})
