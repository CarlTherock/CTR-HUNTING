import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('renders its label and responds to clicks', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Save waypoint</Button>)

    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Save waypoint</Button>)
    expect(screen.getByRole('button', { name: 'Save waypoint' })).toBeDisabled()
  })
})
