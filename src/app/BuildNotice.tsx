import { useEffect, useState } from 'react'
import { APP_BUILD_DATE } from './appInfo'
import { checkForServiceWorkerUpdate } from '@/features/about/swUpdate'

/** Diagnostic dans le contenu normal de À propos, jamais une surcouche globale. */
export function BuildNotice() {
  const [remote, setRemote] = useState('Vérification du build publié…')
  useEffect(() => {
    let active = true
    void fetch(`${import.meta.env.BASE_URL}interface-version.json`, { cache: 'no-store' }).then(async (r) => {
      if (!r.ok) throw new Error('Version publiée inaccessible')
      const value: unknown = await r.json()
      if (!value || typeof value !== 'object' || !('interface' in value) || typeof value.interface !== 'string') throw new Error('Version publiée non identifiée')
      if (active) setRemote(value.interface === 'balayage-rut-local-1' ? 'Identifiant publié concordant' : `Autre interface publiée : ${value.interface}`)
    }).catch(() => { if (active) setRemote('Version publiée non vérifiable actuellement') })
    return () => { active = false }
  }, [])
  return (
    <details data-testid="build-notice" className="border-surface-700 bg-surface-900 text-ink-100 min-w-0 rounded-lg border p-3 print:hidden">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Interface B1 · {APP_BUILD_DATE.slice(0, 10)}</summary>
      <div className="space-y-2 break-words pt-2 text-xs">
        <p>Code chargé : balayage-rut-local-1</p>
        <p>Construction : {APP_BUILD_DATE || 'non renseignée'}</p>
        <p role="status">{remote}</p>
        <button type="button" className="min-h-11 text-sky-300 underline" onClick={() => { void checkForServiceWorkerUpdate().then((r) => setRemote(r === 'update-found' ? 'Mise à jour détectée ; rechargez après avoir enregistré vos saisies.' : r === 'up-to-date' ? 'Aucun nouveau service worker détecté ; cela ne prouve pas que la page a été rechargée.' : `Vérification : ${r}`)) }}>Vérifier les mises à jour</button>
        <p>Enregistrez vos saisies avant de recharger. Les données enregistrées ne sont pas effacées ; une saisie non enregistrée peut être perdue.</p>
        <button type="button" className="border-surface-600 min-h-11 rounded border px-3" onClick={() => window.location.reload()}>Recharger l’interface</button>
      </div>
    </details>
  )
}
