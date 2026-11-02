import { useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Visual « which element can paint down to the real screen edge » test.
 *
 * Each marker is a fixed element anchored at the top whose HEIGHT comes from a
 * different rule; a coloured block with its letter is drawn at the very
 * bottom of that element, in its own horizontal slot. The letters you can see
 * at the bottom of the screen are the rules that reach the visible edge. It
 * changes nothing in the app and disappears with « Fermer les repères ».
 */
interface Marker {
  letter: string
  rule: string
  height: string
  color: string
}

const MARKERS: Marker[] = [
  { letter: 'A', rule: 'ancré en bas (bottom : 0)', height: '', color: '#ef4444' },
  { letter: 'B', rule: '100vh', height: '100vh', color: '#f97316' },
  { letter: 'C', rule: '100lvh', height: '100lvh', color: '#eab308' },
  { letter: 'D', rule: '100dvh', height: '100dvh', color: '#22c55e' },
  {
    letter: 'E',
    rule: 'screen.height (mesuré par script)',
    height: `${typeof window === 'undefined' ? 0 : window.screen.height}px`,
    color: '#06b6d4',
  },
]

export function EdgePaintTest() {
  const [on, setOn] = useState(false)
  const [screenHeight] = useState(() => window.screen.height)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOn(true)}
        className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 self-start rounded-md border px-4 text-sm font-medium"
      >
        Afficher les repères de bord (essai visuel)
      </button>
      <p className="text-ink-400 text-xs">
        Affiche 5 repères lettrés tout en bas de l’écran. Notez ceux que vous voyez (ou
        faites une capture d’écran). Rien n’est modifié dans l’application.
      </p>
      {on &&
        createPortal(
          <div
            data-testid="edge-paint-test"
            className="pointer-events-none fixed inset-0 z-[200]"
          >
            {MARKERS.map((m, i) => (
              <div
                key={m.letter}
                data-marker={m.letter}
                className="pointer-events-none fixed left-0 w-full"
                style={
                  m.letter === 'A'
                    ? { bottom: 0, height: 0 }
                    : { top: 0, height: m.height === '' ? undefined : m.height }
                }
              >
                <div
                  className="absolute bottom-0 flex h-6 items-center justify-center text-sm font-bold text-black"
                  style={{
                    left: `${i * 20}%`,
                    width: '20%',
                    backgroundColor: m.color,
                  }}
                >
                  {m.letter}
                </div>
              </div>
            ))}
            <div
              className="pointer-events-auto fixed inset-x-0 flex justify-center"
              style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
            >
              <div className="rounded-lg border border-white/30 bg-black/85 p-3 text-xs text-white">
                <p className="mb-2 max-w-xs">
                  Repères au bas de l’écran : A = bas ancré · B = 100vh · C = 100lvh · D =
                  100dvh · E = {screenHeight} px (écran). Notez les lettres visibles.
                </p>
                <button
                  type="button"
                  onClick={() => setOn(false)}
                  className="min-h-11 rounded-md bg-white px-4 text-sm font-semibold text-black"
                >
                  Fermer les repères
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
