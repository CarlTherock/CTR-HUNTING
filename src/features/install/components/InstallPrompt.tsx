import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { isIosDevice, isStandalonePwa } from '@/utils/pwa'
import { useInstallStore } from '../state/installStore'

/** The iPhone/iPad procedure, shared with the help page. */
export function IosInstallSteps() {
  return (
    <ol className="text-ink-300 list-decimal space-y-1 pl-5 text-sm">
      <li>Ouvrez cette page dans Safari.</li>
      <li>Touchez le bouton Partager (le carré avec une flèche vers le haut).</li>
      <li>Choisissez « Sur l’écran d’accueil », puis « Ajouter ».</li>
    </ol>
  )
}

/**
 * Honest install invitation. It appears ONLY when:
 *  - the browser really fired `beforeinstallprompt` (Android/desktop Chromium),
 *    in which case a button opens the browser's own install dialog; or
 *  - this is an iPhone/iPad where the app is not installed yet, in which case
 *    the manual steps are shown (iOS has no install event).
 * It never appears once installed (standalone), and a refusal is remembered.
 */
export function InstallPrompt() {
  const deferredPrompt = useInstallStore((s) => s.deferredPrompt)
  const dismissed = useInstallStore((s) => s.dismissed)
  const loaded = useInstallStore((s) => s.loaded)
  const load = useInstallStore((s) => s.load)
  const listen = useInstallStore((s) => s.listen)
  const install = useInstallStore((s) => s.install)
  const dismiss = useInstallStore((s) => s.dismiss)

  useEffect(() => {
    listen()
    void load()
  }, [listen, load])

  if (!loaded || dismissed || isStandalonePwa()) return null
  const ios = isIosDevice()
  if (!deferredPrompt && !ios) return null

  return (
    <section
      aria-label="Installer l’application"
      className="border-surface-700 bg-surface-900 flex items-start gap-3 rounded-lg border p-3"
    >
      <Download size={18} className="text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-ink-100 text-sm font-medium">
          Installer l’application sur l’écran d’accueil
        </p>
        {deferredPrompt ? (
          <>
            <p className="text-ink-300 text-sm">
              L’application s’ouvre alors en plein écran, comme une application ordinaire.
            </p>
            <Button size="sm" onClick={() => void install()}>
              Installer
            </Button>
          </>
        ) : (
          <>
            <IosInstallSteps />
            <p className="text-ink-500 text-xs">
              L’installation ne permet pas pour autant d’enregistrer en arrière-plan :
              voir{' '}
              <Link to="/help#limites-gps" className="underline">
                l’aide
              </Link>
              .
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer l’invitation à installer"
        className="text-ink-500 hover:text-ink-100 flex size-8 shrink-0 items-center justify-center pointer-coarse:size-11"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </section>
  )
}
