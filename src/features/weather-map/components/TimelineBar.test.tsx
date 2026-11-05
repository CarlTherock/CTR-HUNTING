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

  it('compact variant keeps only the scrub slider (no buttons, no readout)', () => {
    const onSeek = vi.fn()
    render(
      <TimelineBar
        compact
        frames={frames}
        frameIndex={0}
        playing={false}
        now={NOW}
        maxTicks={5}
        onPlayingChange={vi.fn()}
        onStep={vi.fn()}
        onSeek={onSeek}
      />,
    )
    const slider = screen.getByRole('slider', { name: 'Ligne du temps' })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('frame-readout')).toBeNull()
    fireEvent.change(slider, { target: { value: '7' } })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onSeek).toHaveBeenCalledWith(7)
  })

  it('radar timeline: three distinct products, source, validity and the extrapolation → model transition', () => {
    const at = (h: number, m: number) => new Date(2026, 10, 3, h, m).toISOString()
    const mixed = [
      { time: at(14, 0), kind: 'observed' },
      { time: at(14, 12), kind: 'forecast', extrapolated: true },
      { time: at(15, 0), kind: 'forecast', modelForecast: true },
    ] as unknown as WeatherMapFrame[]
    const { rerender } = render(
      <TimelineBar
        frames={mixed}
        frameIndex={1}
        playing={false}
        now={NOW}
        maxTicks={5}
        onPlayingChange={vi.fn()}
        onStep={vi.fn()}
        onSeek={vi.fn()}
      />,
    )
    expect(screen.getByTestId('frame-product')).toHaveTextContent(/Extrapolation ECCC/)
    expect(screen.getByTestId('frame-source')).toHaveTextContent(
      /calcul, pas une observation/,
    )
    expect(screen.getByTestId('product-strip').children).toHaveLength(3)
    const period = screen.getByTestId('period-line')
    expect(period).toHaveTextContent(/Extrapolation ECCC : 14 h 12/)
    expect(period).toHaveTextContent(/Modèle HRDPS : 15 h/)
    rerender(
      <TimelineBar
        frames={mixed}
        frameIndex={2}
        playing={false}
        now={NOW}
        maxTicks={5}
        onPlayingChange={vi.fn()}
        onStep={vi.fn()}
        onSeek={vi.fn()}
      />,
    )
    expect(screen.getByTestId('frame-product')).toHaveTextContent(/Modèle HRDPS/)
    expect(screen.getByTestId('frame-source')).toHaveTextContent(/pas le radar/)
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
