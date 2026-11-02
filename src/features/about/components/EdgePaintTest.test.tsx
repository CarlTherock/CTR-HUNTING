import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EdgePaintTest } from './EdgePaintTest'

describe('EdgePaintTest', () => {
  it('draws nothing until asked, then five lettered edge markers, and can be closed', async () => {
    const user = userEvent.setup()
    render(<EdgePaintTest />)
    expect(screen.queryByTestId('edge-paint-test')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Afficher les repères de bord/ }))
    const overlay = screen.getByTestId('edge-paint-test')
    expect(overlay.querySelectorAll('[data-marker]')).toHaveLength(5)
    expect(overlay).toHaveTextContent('A')
    expect(overlay).toHaveTextContent('E')

    await user.click(screen.getByRole('button', { name: 'Fermer les repères' }))
    expect(screen.queryByTestId('edge-paint-test')).toBeNull()
  })
})
