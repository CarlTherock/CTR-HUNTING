import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { NO_CONSENT } from '../provider'
import { useAssistantStore } from '../state/assistantStore'
import { sampleRecords } from '../testFixtures'
import { summarizeTerritory } from '../territorySummary'
import { ConsentPreview } from './ConsentPreview'

const result = summarizeTerritory({
  scope: { kind: 'territory', id: 'nord' },
  records: sampleRecords(),
  now: new Date('2026-10-07T12:00:00.000Z'),
})

function renderPreview() {
  return render(
    <MemoryRouter>
      <ConsentPreview result={result} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  useAssistantStore.setState({ consent: NO_CONSENT })
})

describe('ConsentPreview — aperçu de ce qui serait transmis', () => {
  it('dit que rien n’est envoyé et que tout est décoché par défaut', async () => {
    const user = userEvent.setup()
    renderPreview()
    await user.click(screen.getByText('Ce qui serait transmis à un assistant génératif'))
    expect(screen.getByRole('note')).toHaveTextContent('Rien n’est envoyé')
    for (const name of [/Coordonnées/, /Noms et notes/, /Photos/, /J’ai lu l’aperçu/]) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    }
  })

  it('l’aperçu par défaut ne contient ni nom, ni note, ni position, ni photo', () => {
    renderPreview()
    const payload = screen.getByTestId('payload-preview').textContent ?? ''
    for (const text of [
      'Poste du nord',
      'Bon poste',
      'Chevreuil',
      '"coordinate"',
      '"p1"',
    ]) {
      expect(payload).not.toContain(text)
    }
    expect(payload).toContain('"tool": "territory-summary"')
  })

  it('cocher une catégorie met à jour l’aperçu exact, et elle seule', async () => {
    const user = userEvent.setup()
    renderPreview()
    await user.click(screen.getByRole('checkbox', { name: /Coordonnées/ }))
    let payload = screen.getByTestId('payload-preview').textContent ?? ''
    expect(payload).toContain('"coordinate"')
    expect(payload).not.toContain('Poste du nord')

    await user.click(screen.getByRole('checkbox', { name: /Noms et notes/ }))
    payload = screen.getByTestId('payload-preview').textContent ?? ''
    expect(payload).toContain('Poste du nord')
    expect(payload).not.toContain('"photoIds"')

    await user.click(screen.getByRole('checkbox', { name: /Photos/ }))
    payload = screen.getByTestId('payload-preview').textContent ?? ''
    expect(payload).toContain('"p1"')
  })

  it('l’envoi est impossible : assistant non activé, même après autorisation', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderPreview()
    const send = screen.getByRole('button', {
      name: /Envoi impossible : assistant non activé/,
    })
    expect(send).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /J’ai lu l’aperçu/ }))
    expect(useAssistantStore.getState().consent.acknowledged).toBe(true)
    expect(send).toBeDisabled()
    await user.click(send)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('modifier une catégorie retire l’autorisation globale (il faut relire l’aperçu)', async () => {
    const user = userEvent.setup()
    renderPreview()
    await user.click(screen.getByRole('checkbox', { name: /J’ai lu l’aperçu/ }))
    await user.click(screen.getByRole('checkbox', { name: /Noms et notes/ }))
    expect(screen.getByRole('checkbox', { name: /J’ai lu l’aperçu/ })).not.toBeChecked()
  })

  it('les cases ont une cible tactile d’au moins 44 px (libellés cliquables)', () => {
    renderPreview()
    const labels = within(screen.getByTestId('consent-preview')).getAllByRole('checkbox')
    for (const box of labels)
      expect(box.closest('label')?.className).toContain('min-h-11')
  })
})
