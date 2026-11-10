import { execFileSync } from 'node:child_process'

export function normalizeCommitSha(value: unknown): string {
  if (typeof value !== 'string') return ''
  const sha = value.trim()
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : ''
}

/** HEAD du dépôt réellement utilisé pour compiler ; aucune requête réseau. */
export function readBuildCommit(cwd: string): string {
  try {
    return normalizeCommitSha(execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }))
  } catch {
    return ''
  }
}
