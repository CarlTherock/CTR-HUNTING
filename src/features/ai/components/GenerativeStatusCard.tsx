import { Badge, Card } from '@/components/ui'
import { assistantProvider } from '../provider'

/**
 * « Assistant génératif : non activé ». Dit exactement ce qui manque et que
 * rien n'est envoyé. Ce n'est pas un écran d'IA : aucune zone de question,
 * aucune réponse simulée.
 */
export function GenerativeStatusCard() {
  const { available, reason, missing } = assistantProvider.availability
  return (
    <Card
      className="flex min-w-0 flex-col gap-2 p-3 sm:p-4"
      data-testid="generative-status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-ink-100 text-sm font-semibold">
          Assistant génératif : {available ? 'activé' : 'non activé'}
        </h2>
        <Badge variant={available ? 'success' : 'warning'}>
          {available ? 'Actif' : 'Non activé'}
        </Badge>
      </div>
      <p className="text-ink-300 text-sm break-words">{reason}</p>
      <details>
        <summary className="text-brand-400 flex min-h-11 cursor-pointer items-center text-sm">
          Ce qui manque pour l’activer
        </summary>
        <ul className="text-ink-300 flex list-disc flex-col gap-1 pb-2 pl-5 text-xs">
          {missing.map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      </details>
      <p className="text-ink-500 text-xs">
        Les cinq outils ci-dessous fonctionnent sans lui : ce sont des calculs et des
        résumés automatiques, faits sur l’appareil, sans réseau.
      </p>
    </Card>
  )
}
