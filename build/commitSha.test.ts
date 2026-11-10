import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runGit } = vi.hoisted(() => ({ runGit: vi.fn() }))
// Les deux formes doivent pointer vers la même doublure, sans exécution réelle.
vi.mock('node:child_process', () => ({
  execFileSync: runGit,
  default: { execFileSync: runGit },
}))
import childProcess, { execFileSync } from 'node:child_process'
import { normalizeCommitSha, readBuildCommit } from './commitSha.ts'

beforeEach(() => {
  runGit.mockReset()
})

describe('identité Git de compilation', () => {
  it('utilise la même doublure pour les exports nommé et par défaut', () => {
    expect(execFileSync).toBe(runGit)
    expect(childProcess.execFileSync).toBe(runGit)
  })
  it('lit HEAD dans le dépôt demandé avec une commande sans shell', () => {
    const sha = 'a'.repeat(40)
    runGit.mockReturnValue(`${sha}\n`)
    expect(readBuildCommit('/test/repository')).toBe(sha)
    expect(runGit).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: '/test/repository', encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
  })
  it('normalise les espaces et la casse d’un SHA complet', () => {
    expect(normalizeCommitSha(` ${'A'.repeat(40)}\n`)).toBe('a'.repeat(40))
  })
  it('refuse les valeurs absentes, tronquées et non hexadécimales', () => {
    for (const value of [undefined, null, 42, '', 'abc1234', 'g'.repeat(40), 'a'.repeat(41)]) expect(normalizeCommitSha(value)).toBe('')
  })
  it('ne fabrique pas un SHA lorsque Git échoue', () => {
    runGit.mockImplementation(() => { throw new Error('Git unavailable') })
    expect(readBuildCommit('/test/repository')).toBe('')
  })
  it('refuse aussi une sortie Git invalide', () => {
    runGit.mockReturnValue('not-a-commit')
    expect(readBuildCommit('/test/repository')).toBe('')
  })
})
