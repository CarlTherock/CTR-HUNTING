import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Compass, DatabaseBackup, ShieldCheck, LocateFixed } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import { useOnboardingStore } from '../state/onboardingStore'

interface Step {
  icon: LucideIcon
  title: string
  body: string[]
}

/**
 * Four short screens. They only EXPLAIN: this component never asks the
 * browser for the position, the compass or the camera (tests spy on all
 * three). Each permission is requested later, when the function that needs it
 * is used.
 */
export const ONBOARDING_STEPS: readonly Step[] = [
  {
    icon: Compass,
    title: 'À quoi sert CTR Hunting',
    body: [
      'Une carte de terrain pour préparer et vivre une sortie : points de repère, traces, guidage « Aller à », boussole, météo et vent, soleil et lune, analyse du terrain et journal.',
      'Elle est conçue pour continuer à fonctionner sans réseau, une fois les cartes téléchargées.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Vos données restent sur votre appareil',
    body: [
      'Vos points, traces, photos et notes sont enregistrés dans le stockage de cet appareil. Il n’y a ni compte, ni envoi de vos notes ou photos, ni statistiques d’usage.',
      'Le réseau sert seulement à charger les cartes, la météo et quelques couches de données : la page Confidentialité détaille ce qui est envoyé.',
    ],
  },
  {
    icon: DatabaseBackup,
    title: 'Pensez à sauvegarder',
    body: [
      'Comme tout est local, vider les données du site (ou une libération d’espace par le téléphone) efface vos données.',
      'Dans Réglages, « Données et sauvegarde » crée un fichier à garder ailleurs (iCloud, ordinateur…). Un rappel discret vous le suggère.',
    ],
  },
  {
    icon: LocateFixed,
    title: 'Les permissions : au moment utile',
    body: [
      'Rien n’est demandé maintenant. Votre navigateur vous demandera la position quand vous ouvrirez une page qui l’utilise (carte, météo…), la caméra quand vous l’ouvrirez, et la boussole (iPhone) quand vous toucherez le bouton prévu.',
      'Vous pouvez refuser : l’application reste utilisable, sans la fonction concernée. L’aide explique les limites du GPS sur iPhone.',
    ],
  },
]

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function OnboardingDialog() {
  const wanted = useOnboardingStore((s) => s.open)
  const origin = useOnboardingStore((s) => s.origin)
  const onHome = useLocation().pathname === '/'
  // A first-launch presentation waits for the home page; a replay shows now.
  // The screens are mounted only while open, so each opening starts at 1.
  if (!(wanted && (origin === 'manual' || onHome))) return null
  return <OnboardingScreens />
}

function OnboardingScreens() {
  const finish = useOnboardingStore((s) => s.finish)
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the title when a screen appears.
  useEffect(() => {
    titleRef.current?.focus()
  }, [index])

  const step = ONBOARDING_STEPS[index]
  const isLast = index === ONBOARDING_STEPS.length - 1
  const Icon = step.icon

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      finish()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    // Keep keyboard focus inside the dialog.
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      data-testid="onboarding"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onKeyDown={onKeyDown}
        className="border-surface-700 bg-surface-900 flex max-h-dvh w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-500 text-xs" aria-live="polite">
            Présentation · {index + 1} sur {ONBOARDING_STEPS.length}
          </p>
          <button
            type="button"
            onClick={finish}
            className="text-ink-300 hover:text-ink-100 min-h-11 px-2 text-sm underline"
          >
            Passer
          </button>
        </div>

        <Icon size={36} className="text-brand-400" aria-hidden="true" />
        <h2
          id="onboarding-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-ink-100 text-lg font-semibold outline-none"
        >
          {step.title}
        </h2>
        <div className="text-ink-300 flex flex-col gap-2 text-sm">
          {step.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s.title}
              className={cn(
                'size-2 rounded-full',
                i === index ? 'bg-brand-400' : 'bg-surface-600',
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            Précédent
          </Button>
          {isLast ? (
            <Button onClick={finish}>Terminer</Button>
          ) : (
            <Button onClick={() => setIndex((i) => i + 1)}>Suivant</Button>
          )}
        </div>
      </div>
    </div>
  )
}
