import { useEffect, useState } from 'react'
import { APP_BUILD_DATE } from './appInfo'
import { checkForServiceWorkerUpdate } from '@/features/about/swUpdate'
/** Identifie le code exécuté ; aucune suppression de cache ni de données locales. */
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
  return <details className="border-slate-600 bg-slate-950/95 fixed top-[max(env(safe-area-inset-top),0.25rem)] right-2 z-50 max-w-[85vw] rounded-lg border text-slate-100 shadow-lg print:hidden"><summary className="cursor-pointer px-2 py-1 text-[10px]">Interface B1 · {APP_BUILD_DATE.slice(0, 10)}</summary><div className="max-w-xs space-y-2 p-3 text-xs"><p>Code chargé : balayage-rut-local-1</p><p>Construction : {APP_BUILD_DATE || 'non renseignée'}</p><p>{remote}</p><button type="button" className="min-h-11 text-sky-300 underline" onClick={() => { void checkForServiceWorkerUpdate().then((r) => setRemote(r === 'update-found' ? 'Mise à jour détectée ; rechargez après avoir enregistré vos saisies.' : r === 'up-to-date' ? 'Aucun nouveau service worker détecté ; cela ne prouve pas que la page a été rechargée.' : `Vérification : ${r}`)) }}>Vérifier les mises à jour</button><p>Enregistrez vos saisies avant de recharger. Les données enregistrées ne sont pas effacées ; une saisie non enregistrée peut être perdue.</p><button type="button" className="min-h-11 rounded border border-slate-500 px-3" onClick={() => window.location.reload()}>Recharger l’interface</button></div></details>
}
