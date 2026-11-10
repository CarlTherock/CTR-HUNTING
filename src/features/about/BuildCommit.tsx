import { APP_BUILD_SHA } from '@/app/appInfo'
import { REPOSITORY_URL } from './docLinks'

export function BuildCommit({ sha = APP_BUILD_SHA }: { sha?: string }) {
  const commit = /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : ''
  return (
    <section aria-label="Commit de compilation" className="min-w-0 space-y-2">
      <p className="text-ink-100 text-sm font-semibold">Commit de cette compilation</p>
      {commit ? (
        <>
          <code data-testid="build-commit-sha" className="text-ink-100 block select-text break-all font-mono text-xs">{commit}</code>
          <a href={`${REPOSITORY_URL}/commit/${commit}`} target="_blank" rel="noopener noreferrer" className="text-brand-400 inline-flex min-h-11 items-center text-sm underline">Voir ce commit sur GitHub</a>
        </>
      ) : <p className="text-ink-400 text-sm">SHA indisponible pour cette compilation.</p>}
      <p className="text-ink-500 text-xs">Identifie le code chargé dans cette application, pas nécessairement la dernière version publiée. Cette information reste lisible hors ligne.</p>
    </section>
  )
}
