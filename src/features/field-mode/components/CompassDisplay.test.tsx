import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from '@testing-library/react'
import { CompassDisplay } from './CompassDisplay'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CompassDisplay', () => {
  it('shows a real unavailable reason when there is no orientation support', () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    render(<CompassDisplay />)

    expect(screen.getByText(/not supported/)).toBeInTheDocument()
  })

  it('shows an enable button when the platform needs an explicit permission gesture', () => {
    const FakeDeviceOrientationEvent = () => undefined
    FakeDeviceOrientationEvent.requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('DeviceOrientationEvent', FakeDeviceOrientationEvent)
    render(<CompassDisplay />)

    expect(screen.getByRole('button', { name: 'Enable compass' })).toBeInTheDocument()
  })

  it('shows a real heading and compass label once a reading arrives', async () => {
    const user = userEvent.setup()
    const FakeDeviceOrientationEvent = () => undefined
    FakeDeviceOrientationEvent.requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('DeviceOrientationEvent', FakeDeviceOrientationEvent)
    render(<CompassDisplay />)

    await user.click(screen.getByRole('button', { name: 'Enable compass' }))
    act(() => {
      const event = new Event('deviceorientation') as Event & { webkitCompassHeading?: number }
      event.webkitCompassHeading = 90
      window.dispatchEvent(event)
    })

    expect(await screen.findByText('90°')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
  })
})
