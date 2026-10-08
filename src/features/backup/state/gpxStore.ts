import { create } from 'zustand'
import { downloadBlob } from '../download'
import { GPX_MAX_BYTES } from '../gpx/gpxFormat'
import type { GpxParseResult } from '../gpx/gpxImport'
import type {
  ExportChoices,
  GpxExportScope,
  GpxImportPlan,
  GpxImportReport,
} from '../gpx/gpxService'
import { reloadDataStores } from './backupStore'

interface GpxState {
  choices: ExportChoices | null
  exportMessage: string | null
  exportError: string | null

  importStatus: 'idle' | 'reading' | 'preview' | 'importing' | 'done' | 'error'
  importFileName: string | null
  importError: string | null
  parsed: GpxParseResult | null
  plan: GpxImportPlan | null
  report: GpxImportReport | null

  loadChoices: () => Promise<void>
  exportScope: (scope: GpxExportScope) => Promise<void>
  chooseImportFile: (file: File) => Promise<void>
  confirmImport: () => Promise<void>
  resetImport: () => void
}

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

export const useGpxStore = create<GpxState>((set, get) => ({
  choices: null,
  exportMessage: null,
  exportError: null,
  importStatus: 'idle',
  importFileName: null,
  importError: null,
  parsed: null,
  plan: null,
  report: null,

  loadChoices: async () => {
    const { listExportChoices } = await import('../gpx/gpxService')
    set({ choices: await listExportChoices() })
  },

  exportScope: async (scope) => {
    set({ exportMessage: null, exportError: null })
    try {
      const { exportGpx } = await import('../gpx/gpxService')
      const result = await exportGpx(scope)
      if (result.waypointCount + result.trackCount === 0) {
        set({ exportMessage: 'Rien à exporter pour ce choix.' })
        return
      }
      downloadBlob(
        new Blob([result.xml], { type: 'application/gpx+xml;charset=utf-8' }),
        result.fileName,
      )
      set({
        exportMessage: `${result.fileName} : ${result.waypointCount} point(s) de repère et ${result.trackCount} trace(s).`,
      })
    } catch (error) {
      set({ exportError: describe(error) })
    }
  },

  chooseImportFile: async (file) => {
    set({
      importStatus: 'reading',
      importFileName: file.name,
      importError: null,
      parsed: null,
      plan: null,
      report: null,
    })
    try {
      if (file.size > GPX_MAX_BYTES) {
        throw new Error(
          `Ce fichier GPX est trop volumineux (limite : ${GPX_MAX_BYTES / (1024 * 1024)} Mo).`,
        )
      }
      const text = await file.text()
      const [{ parseGpx }, { planGpxImport }] = await Promise.all([
        import('../gpx/gpxImport'),
        import('../gpx/gpxService'),
      ])
      const parsed = parseGpx(text)
      const plan = await planGpxImport(parsed)
      set({ importStatus: 'preview', parsed, plan })
    } catch (error) {
      set({ importStatus: 'error', importError: describe(error) })
    }
  },

  confirmImport: async () => {
    const { plan } = get()
    if (!plan || get().importStatus !== 'preview') return
    set({ importStatus: 'importing' })
    try {
      const { commitGpxImport } = await import('../gpx/gpxService')
      const report = await commitGpxImport(plan)
      await reloadDataStores()
      set({ importStatus: 'done', report, plan: null })
    } catch (error) {
      set({
        importStatus: 'error',
        importError: `${describe(error)} — l’importation a été annulée, rien n’a été ajouté.`,
        plan: null,
      })
    }
  },

  resetImport: () =>
    set({
      importStatus: 'idle',
      importFileName: null,
      importError: null,
      parsed: null,
      plan: null,
      report: null,
    }),
}))
