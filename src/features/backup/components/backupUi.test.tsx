import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { BackupReminder } from './BackupReminder'
import { DataBackupSection } from './DataBackupSection'
import { GpxImportView } from './GpxViews'
import { RestorePreview, RestoreReportView } from './RestoreViews'
import { useBackupStore } from '../state/backupStore'
import { useGpxStore } from '../state/gpxStore'
import type { RestorePlan } from '../engine/restorePlan'
import type { RestoreReport } from '../engine/restoreApply'
import { parseGpx } from '../gpx/gpxImport'
import { planGpxImport } from '../gpx/gpxService'

const HTML = '<img src=x onerror="alert(1)"><b>gras</b>'

function plan(overrides: Partial<RestorePlan> = {}): RestorePlan {
  return {
    manifest: {
      schemaVersion: 1,
      appVersion: '0.1.0',
      createdAt: '2026-10-07T17:42:00.000Z',
      databaseVersion: 40,
    },
    items: [
      { table: 'waypoints', id: 'a', label: 'Nouveau', status: 'new' },
      { table: 'waypoints', id: 'b', label: HTML, status: 'conflict' },
      {
        table: 'photos',
        id: 'c',
        label: 'Photo',
        status: 'invalid',
        reason: 'photo orpheline',
      },
    ],
    preview: {
      waypoints: {
        total: 2,
        new: 1,
        identical: 0,
        conflict: 1,
        invalid: 0,
        unsupported: 0,
      },
      photos: { total: 1, new: 0, identical: 0, conflict: 0, invalid: 1, unsupported: 0 },
    },
    totals: { total: 3, new: 1, identical: 0, conflict: 1, invalid: 1, unsupported: 0 },
    limitations: ['Zones hors ligne : seules les métadonnées sont sauvegardées.'],
    ...overrides,
  }
}

describe('RestorePreview', () => {
  it('shows counts, version, date, limits; defaults to keeping local versions', async () => {
    const onModeChange = vi.fn()
    const onConfirm = vi.fn()
    render(
      <RestorePreview
        plan={plan()}
        mode="keep-local"
        onModeChange={onModeChange}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument()
    expect(screen.getByText(/format 1/)).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Points de repère/ })
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1', '0', '1', '0'])
    expect(screen.getByText(/rien n’est supprimé/i)).toBeInTheDocument()
    expect(screen.getByText(/Zones hors ligne : seules/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Conserver mes versions locales/)).toBeChecked()

    await userEvent.click(screen.getByLabelText(/Ajouter aussi les versions/))
    expect(onModeChange).toHaveBeenCalledWith('keep-both')
    await userEvent.click(
      screen.getByRole('button', { name: /Restaurer \(ajouter 1 élément/ }),
    )
    expect(onConfirm).toHaveBeenCalled()
  })

  it('counts copies in the confirm label when keeping both, and lists invalid items', async () => {
    render(
      <RestorePreview
        plan={plan()}
        mode="keep-both"
        onModeChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /ajouter 2 élément/ })).toBeEnabled()
    expect(screen.getByText(/1 élément\(s\) invalide\(s\)/)).toBeInTheDocument()
  })

  it('disables confirmation when nothing would be added', () => {
    const empty = plan({
      items: [],
      preview: {},
      totals: { total: 0, new: 0, identical: 3, conflict: 0, invalid: 0, unsupported: 0 },
    })
    render(
      <RestorePreview
        plan={empty}
        mode="keep-local"
        onModeChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Rien à ajouter' })).toBeDisabled()
  })
})

describe('RestoreReportView', () => {
  const report: RestoreReport = {
    mode: 'keep-local',
    added: { waypoints: 2, photos: 1 },
    addedTotal: 3,
    identicalIgnored: 4,
    conflicts: [{ table: 'waypoints', id: 'b', label: HTML, resolution: 'kept-local' }],
    invalid: [{ table: 'photos', id: 'p', label: 'Photo', reason: 'photo orpheline' }],
    unsupported: 0,
    durationMs: 12,
  }

  it('reports added, ignored, invalid and conflicts, and renders imported text inertly', () => {
    const { container } = render(<RestoreReportView report={report} onClose={vi.fn()} />)
    expect(screen.getByText(/3 élément\(s\) ajouté\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/4 ignoré\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 conflit\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/photo orpheline/)).toBeInTheDocument()
    // The HTML-looking name is visible as literal text, never as elements.
    expect(container.textContent).toContain(HTML)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })
})

describe('GpxImportView', () => {
  it('previews an import and shows hostile names as plain text', async () => {
    const xml = `<gpx version="1.1"><wpt lat="46" lon="-71"><name>&lt;img src=x onerror=alert(1)&gt;</name></wpt>
      <wpt lat="500" lon="0"><name>mauvais</name></wpt></gpx>`
    const parsed = parseGpx(xml)
    const gpxPlan = await planGpxImport(parsed)
    const onConfirm = vi.fn()
    const { container } = render(
      <GpxImportView
        status="preview"
        fileName="x.gpx"
        error={null}
        parsed={parsed}
        plan={gpxPlan}
        report={null}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 nouveau\(x\) point\(s\) de repère/)).toBeInTheDocument()
    expect(screen.getByText(/1 invalide\(s\)/)).toBeInTheDocument()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(container.querySelector('img')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Importer' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})

describe('BackupReminder', () => {
  beforeEach(async () => {
    await db.waypoints.clear()
    await db.settings.clear()
    useBackupStore.setState({
      statusLoaded: false,
      lastBackupAt: null,
      dismissedUntil: null,
    })
  })
  afterEach(async () => {
    await db.waypoints.clear()
    await db.settings.clear()
  })

  async function addWaypoints(n: number) {
    await db.waypoints.bulkAdd(
      Array.from({ length: n }, (_, i) => ({
        id: `w${i}`,
        name: `P${i}`,
        coordinate: { lat: 46, lng: -71 },
        category: 'general' as const,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      })),
    )
  }

  it('shows when there are 10+ items and no backup, can be dismissed, and stays dismissed', async () => {
    await addWaypoints(10)
    render(
      <MemoryRouter>
        <BackupReminder />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/10 éléments/)
    expect(screen.getByRole('link', { name: /Sauvegarder maintenant/ })).toHaveAttribute(
      'href',
      '/settings#donnees-et-sauvegarde',
    )
    await userEvent.click(screen.getByRole('button', { name: /Fermer le rappel/ }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(await db.settings.get('backupReminderDismissedUntil')).toBeTruthy()
  })

  it('is absent with few items', async () => {
    await addWaypoints(3)
    render(
      <MemoryRouter>
        <BackupReminder />
      </MemoryRouter>,
    )
    await waitFor(() => expect(useBackupStore.getState().statusLoaded).toBe(true))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('Données et sauvegarde: backup then restore through the real UI store', () => {
  beforeEach(async () => {
    await db.waypoints.clear()
    await db.settings.clear()
    useBackupStore.getState().resetRestore()
    useBackupStore.setState({ backupStatus: 'idle', backupResult: null })
    useGpxStore.getState().resetImport()
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:fake'),
        revokeObjectURL: vi.fn(),
      }),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await db.waypoints.clear()
    await db.settings.clear()
  })

  it('saves a file, then restores it after the data was wiped, with preview and report', async () => {
    const coordinate = { lat: 46.12345678901234, lng: -71.98765432109876 }
    await db.waypoints.add({
      id: 'w-e2e',
      name: 'Mon poste',
      coordinate,
      category: 'stand_blind',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const user = userEvent.setup()
    render(<DataBackupSection />)
    expect(screen.getByText(/Stockage local/)).toBeInTheDocument()
    expect(screen.getByText(/Sauvegarde externe/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Sauvegarder maintenant/ }))
    await waitFor(() => expect(useBackupStore.getState().backupStatus).toBe('done'))
    const result = useBackupStore.getState().backupResult
    if (!result) throw new Error('pas de résultat de sauvegarde')
    expect(result.fileName).toMatch(
      /^ctr-hunting-sauvegarde-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/,
    )
    expect(await db.settings.get('lastBackupAt')).toBeTruthy()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /Télécharger/ })).toBeInTheDocument()

    await db.waypoints.clear() // « l’utilisateur vide les données du site »
    const input = screen.getByLabelText('Fichier de sauvegarde à restaurer')
    await user.upload(
      input,
      new File([result.blob], result.fileName, { type: 'application/zip' }),
    )
    const preview = await screen.findByRole('region', {
      name: /Aperçu de la restauration/,
    })
    expect(
      within(preview).getByRole('row', { name: /Points de repère/ }),
    ).toBeInTheDocument()
    expect(await db.waypoints.count()).toBe(0) // preview wrote nothing

    await user.click(screen.getByRole('button', { name: /Restaurer \(ajouter/ }))
    const report = await screen.findByRole('region', { name: /Rapport de restauration/ })
    expect(report).toHaveTextContent(/Restauration terminée/)
    expect((await db.waypoints.get('w-e2e'))?.coordinate).toEqual(coordinate)
  })

  it('refuses a corrupt file with a clear message and writes nothing', async () => {
    const user = userEvent.setup()
    render(<DataBackupSection />)
    await user.upload(
      screen.getByLabelText('Fichier de sauvegarde à restaurer'),
      new File([new Uint8Array(200).fill(7)], 'mauvais.zip', { type: 'application/zip' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Restauration refusée.*Aucune donnée n’a été modifiée/,
    )
    expect(await db.waypoints.count()).toBe(0)
  })
})
