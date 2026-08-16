import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Splash } from './Splash'

describe('Splash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the CTR Hunting brand mark and tagline', () => {
    render(<Splash onDone={vi.fn()} />)

    expect(screen.getByText('CTR HUNTING')).toBeInTheDocument()
    expect(screen.getByText('Field Terrain Intelligence')).toBeInTheDocument()
  })

  it('calls onDone once, after the visible period and fade-out have elapsed', () => {
    const onDone = vi.fn()
    render(<Splash onDone={onDone} />)

    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(450)
    })
    expect(onDone).toHaveBeenCalledOnce()
  })
})
