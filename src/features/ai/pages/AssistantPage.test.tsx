import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { NOW, makeWindField } from '@/features/analytics/testFixtures'
import { compareCaches } from '@/features/compare/compareCaches'
import { useCompareStore } from '@/features/compare/state/compareStore'
import type { CompareDataset } from '@/features/compare/compareData'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { assistantProvider } from '../provider'
import { useAssistantStore } from '../state/assistantStore'
import { sampleRecords } from '../testFixtures'
import { AssistantPage } from './AssistantPage'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assistant']}>
      <Where />
      <Routes>
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="*" element={<p>autre page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function seedStores() {
  const records = sampleRecords()
  useWaypointsStore.setState({ waypoints: [...records.waypoints], loaded: true })
  useTracksStore.setState({ tracks: [...records.tracks], loaded: true })
  useJournalStore.setState({ observations: [...records.observations], loaded: true })
  useTerritoriesStore.setState({
    territories: [...records.territories],
    loaded: true,
    filter: { kind: 'all' },
  })
}

beforeEach(() => {
  seedStores()
  useAssistantStore.setState({
    tool: 'territory-summary',
    summaryScope: { kind: 'all' },
  })
})

afterEach(() => {
  // Démonter d'abord : remettre les magasins à zéro ne doit pas relancer le
  // chargement d'une page encore affichée.
  cleanup()
  useWaypointsStore.setState({ waypoints: [], loaded: false, editingId: null })
  useTracksStore.setState({ tracks: [], loaded: false })
  useJournalStore.setState({ observations: [], loaded: false, editingId: null })
  useTerritoriesStore.setState({ territories: [], loaded: false })
  useCompareStore.setState({
    selectedIds: [],
    panelOpen: false,
    status: 'idle',
    dataset: null,
    loadedAt: null,
  })
})

describe('AssistantPage — honnête sur ce qui existe', () => {
  it('affiche « Assistant génératif : non activé » et ce qui manque', async () => {
    const user = userEvent.setup()
    renderPage()
    const card = within(screen.getByTestId('generative-status'))
    expect(
      card.getByRole('heading', { name: 'Assistant génératif : non activé' }),
    ).toBeInTheDocument()
    expect(card.getByText(/Rien n’est envoyé/)).toBeInTheDocument()
    await user.click(card.getByText('Ce qui manque pour l’activer'))
    for (const missing of assistantProvider.availability.missing) {
      expect(card.getByText(missing)).toBeInTheDocument()
    }
  })

  it('ne contient aucune zone de discussion ni réponse simulée', () => {
    renderPage()
    expect(
      screen.queryByRole('textbox', { name: /question|message|demander/i }),
    ).toBeNull()
    expect(
      screen.queryByText(/L’assistant répond|Réflexion en cours|Bonjour, je suis/i),
    ).toBeNull()
  })

  it('propose les cinq outils et change d’outil', async () => {
    const user = userEvent.setup()
    renderPage()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Résumer un territoire',
      'Rechercher l’historique',
      'Comparer des périodes',
      'Expliquer une analyse',
      'Comparer des caches',
    ])
    expect(screen.getByRole('tab', { name: 'Résumer un territoire' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('tab', { name: 'Comparer des périodes' }))
    expect(screen.getByRole('tab', { name: 'Comparer des périodes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Comparer les deux périodes' }),
    ).toBeInTheDocument()
  })
})

describe('AssistantPage — résumé de territoire', () => {
  it('résume tous les territoires puis un seul, avec des liens vers les éléments', async () => {
    const user = userEvent.setup()
    renderPage()
    const result = await screen.findByTestId('assistant-result')
    expect(within(result).getByText('Calcul / résumé automatique')).toBeInTheDocument()
    expect(
      within(result).getByText(/5 points de repère, par catégorie/),
    ).toBeInTheDocument()

    await user.selectOptions(
      screen.getByLabelText('Territoire à résumer'),
      'territory:nord',
    )
    await waitFor(() =>
      expect(
        within(screen.getByTestId('assistant-result')).getByText(
          /3 points de repère, par catégorie/,
        ),
      ).toBeInTheDocument(),
    )
    const journalLinks = within(screen.getByTestId('assistant-result')).getAllByRole(
      'button',
      { name: /Ouvrir l’entrée dans le journal/ },
    )
    expect(
      [...new Set(journalLinks.map((button) => button.getAttribute('data-ref')))].sort(),
    ).toEqual(['journal:j1', 'journal:j2'])
  })

  it('« Résumer » depuis un autre écran préremplit le territoire', async () => {
    useAssistantStore.getState().openTool('territory-summary', {
      summaryScope: { kind: 'territory', id: 'sud' },
    })
    renderPage()
    expect(await screen.findByText(/« Secteur sud »/)).toBeInTheDocument()
    expect(screen.getByLabelText('Territoire à résumer')).toHaveValue('territory:sud')
  })
})

describe('AssistantPage — recherche dans l’historique', () => {
  it('cherche un texte puis ouvre l’entrée trouvée', async () => {
    const user = userEvent.setup()
    useAssistantStore.getState().setTool('history-search')
    renderPage()
    await user.type(screen.getByLabelText('Texte dans le nom ou la note'), 'chevreuil')
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))
    const result = await screen.findByTestId('assistant-result')
    expect(within(result).getByText(/Résultats — 1/)).toBeInTheDocument()
    await user.click(
      within(result).getByRole('button', { name: /Ouvrir l’entrée dans le journal/ }),
    )
    expect(useJournalStore.getState().editingId).toBe('j1')
    expect(screen.getByTestId('where')).toHaveTextContent('/journal')
  })

  it('traite un texte hostile comme une simple chaîne à chercher', async () => {
    const user = userEvent.setup()
    useAssistantStore.getState().setTool('history-search')
    renderPage()
    await user.type(
      screen.getByLabelText('Texte dans le nom ou la note'),
      '<script>alert(1)</script>',
    )
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))
    const result = await screen.findByTestId('assistant-result')
    expect(
      within(result).getByText('Aucun élément ne correspond à ces critères.'),
    ).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('filtre par catégorie avec le vocabulaire de l’application', async () => {
    const user = userEvent.setup()
    useAssistantStore.getState().setTool('history-search')
    renderPage()
    await user.selectOptions(
      screen.getByLabelText('Catégorie (points de repère)'),
      'game_sign',
    )
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))
    const result = await screen.findByTestId('assistant-result')
    expect(within(result).getByText(/Résultats — 2/)).toBeInTheDocument()
  })
})

describe('AssistantPage — comparaison de périodes', () => {
  it('refuse de conclure quand les périodes n’ont pas assez de données', async () => {
    const user = userEvent.setup()
    useAssistantStore.getState().setTool('compare-periods')
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Comparer les deux périodes' }))
    const badge = await screen.findByTestId('periods-status')
    expect(badge).toHaveTextContent('Données insuffisantes : aucune comparaison')
    expect(
      await screen.findByText(/le seuil est de 3 éléments par période/),
    ).toBeInTheDocument()
  })

  it('compare deux périodes suffisamment fournies', async () => {
    const user = userEvent.setup()
    useAssistantStore.getState().setTool('compare-periods')
    renderPage()
    const a = screen.getByRole('group', { name: 'Période A' })
    const b = screen.getByRole('group', { name: 'Période B' })
    // Période A : août (2 éléments sud) étendue pour couvrir trois éléments ; B : octobre.
    await user.clear(within(a).getByLabelText('Du'))
    await user.type(within(a).getByLabelText('Du'), '2026-08-01')
    await user.clear(within(a).getByLabelText('Au (inclus)'))
    await user.type(within(a).getByLabelText('Au (inclus)'), '2026-08-31')
    await user.clear(within(b).getByLabelText('Du'))
    await user.type(within(b).getByLabelText('Du'), '2026-09-15')
    await user.clear(within(b).getByLabelText('Au (inclus)'))
    await user.type(within(b).getByLabelText('Au (inclus)'), '2026-10-31')
    await user.click(screen.getByRole('button', { name: 'Comparer les deux périodes' }))
    const badge = await screen.findByTestId('periods-status')
    expect(badge).toHaveTextContent('Données suffisantes : écarts calculés')
    expect(await screen.findByText(/ce n’est ni une tendance/)).toBeInTheDocument()
  })
})

describe('AssistantPage — expliquer une analyse', () => {
  it('sans analyse calculée, l’état vide explique quoi faire (rien n’est demandé au réseau)', () => {
    useAssistantStore.getState().setTool('explain')
    renderPage()
    expect(screen.getByText('Aucune analyse à expliquer')).toBeInTheDocument()
  })
})

describe('AssistantPage — comparer des caches (réutilise le comparateur)', () => {
  const dataset = (coords: { lat: number; lng: number }[]): CompareDataset => ({
    key: 'test',
    bounds: { south: 46.7, west: -71.3, north: 46.9, east: -71.1 },
    windField: makeWindField(coords),
    wind: { status: 'ok', fetchedAt: '2026-08-17T18:10:00.000Z' },
    windOrigin: 'network',
    windOriginLabel: null,
    vegetation: coords.map((coordinate) => ({
      coordinate,
      radiusMeters: 300,
      categoryCounts: { forest: 2 },
      source: 'openstreetmap' as const,
    })),
    vegetationState: { status: 'ok', fetchedAt: '2026-08-17T18:11:00.000Z' },
    vegetationOrigin: 'network',
  })

  it('demande de cocher au moins deux points', () => {
    useAssistantStore.getState().setTool('compare-caches')
    renderPage()
    expect(screen.getByText(/Cochez au moins 2 points/)).toBeInTheDocument()
  })

  it('met en forme le résultat de compareCaches, sans second moteur', async () => {
    const user = userEvent.setup()
    const waypoints = sampleRecords().waypoints.filter(
      (w) => w.id === 'w1' || w.id === 'w4',
    )
    const coords = waypoints.map((w) => w.coordinate)
    const loadMock = vi.fn(() => Promise.resolve())
    useCompareStore.setState({
      selectedIds: [],
      status: 'ready',
      dataset: dataset(coords),
      loadedAt: NOW.toISOString(),
      records: {
        waypoints: [...sampleRecords().waypoints],
        tracks: [],
        observations: [],
        readAt: NOW.toISOString(),
      },
      load: loadMock,
    })
    useAssistantStore.getState().setTool('compare-caches')
    renderPage()
    await user.click(screen.getByRole('checkbox', { name: /Poste du nord/ }))
    await user.click(screen.getByRole('checkbox', { name: /Cache sud/ }))

    const result = await screen.findByTestId('assistant-result')
    // Le même moteur, les mêmes entrées : le résumé de classement est celui de compareCaches.
    const expected = compareCaches({
      waypoints,
      hourKey: null,
      now: NOW,
      windField: dataset(coords).windField,
      wind: dataset(coords).wind,
      vegetation: dataset(coords).vegetation,
      vegetationState: dataset(coords).vegetationState,
      records: useCompareStore.getState().records,
      gps: null,
      nowMs: NOW.getTime(),
    })
    expect(within(result).getByText(expected.ranking.summary)).toBeInTheDocument()
    expect(within(result).getByText(expected.disclaimer)).toBeInTheDocument()
    expect(loadMock).toHaveBeenCalled()
    // Les points comparés sont des liens.
    expect(
      within(result).getAllByRole('button', {
        name: /Ouvrir la fiche du point de repère/,
      }).length,
    ).toBeGreaterThan(0)
  })
})
