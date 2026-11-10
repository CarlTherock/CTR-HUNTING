import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BuildCommit } from './BuildCommit'
import { REPOSITORY_URL } from './docLinks'

afterEach(cleanup)

describe('SHA de la compilation chargée', () => {
  it('affiche les quarante caractères et lie le commit exact', () => {
    const sha = 'a'.repeat(40)
    render(<BuildCommit sha={sha}/>)
    expect(screen.getByTestId('build-commit-sha')).toHaveTextContent(sha)
    expect(screen.getByRole('link', { name: 'Voir ce commit sur GitHub' })).toHaveAttribute('href', `${REPOSITORY_URL}/commit/${sha}`)
    expect(screen.getByRole('region', { name: 'Commit de compilation' })).toBeVisible()
  })
  it('normalise un SHA hexadécimal en majuscules', () => {
    render(<BuildCommit sha={'B'.repeat(40)}/>)
    expect(screen.getByTestId('build-commit-sha')).toHaveTextContent('b'.repeat(40))
  })
  it('annonce une identité absente sans inventer un commit', () => {
    render(<BuildCommit sha=""/>)
    expect(screen.getByText('SHA indisponible pour cette compilation.')).toBeVisible()
    expect(screen.queryByTestId('build-commit-sha')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('refuse une valeur invalide et ne construit pas de lien dangereux', () => {
    render(<BuildCommit sha="javascript:alert(1)"/>)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('SHA indisponible pour cette compilation.')).toBeVisible()
  })
})
