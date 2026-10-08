import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GuideSection } from './apresTir.content'
import { AfterShotGuide } from './AfterShotGuide'

const SOURCED: GuideSection = {
  id: 'essai',
  title: 'Section d’essai',
  body: ['Texte d’essai.'],
  source: {
    title: 'Document d’essai',
    publisher: 'Éditeur d’essai',
    retrievedOn: '2026-10-08',
  },
}

describe('AfterShotGuide', () => {
  it('affiche « Contenu à venir » pour chaque section livrée', () => {
    render(<AfterShotGuide />)
    const pending = screen.getAllByTestId('guide-pending')
    expect(pending.length).toBeGreaterThan(0)
    for (const node of pending) {
      expect(node).toHaveTextContent('Contenu à venir — sources en vérification')
    }
  })

  it('n’affiche le texte d’une section que si elle a une source valide, et cite cette source', () => {
    render(
      <AfterShotGuide
        sections={[
          SOURCED,
          { ...SOURCED, id: 'sans-source', title: 'Sans source', source: null },
        ]}
      />,
    )
    expect(screen.getAllByText('Texte d’essai.')).toHaveLength(1)
    expect(screen.getByText(/Source : Document d’essai, Éditeur d’essai/)).toBeVisible()
    expect(screen.getAllByTestId('guide-pending')).toHaveLength(1)
  })
})
