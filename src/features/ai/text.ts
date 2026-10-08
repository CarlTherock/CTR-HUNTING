/**
 * Les textes saisis par l'utilisateur (noms, notes de points de repère,
 * entrées de journal) sont des DONNÉES. Ces fonctions les nettoient pour
 * l'affichage et le contexte ; elles ne les interprètent jamais. Le rendu
 * React échappe déjà le HTML ; ici on retire en plus les caractères de
 * contrôle et on tronque, pour qu'une note énorme ou piégée reste inerte.
 */

export const NOTE_EXCERPT_MAX = 120
export const LABEL_MAX = 60

// Caractères de contrôle, séparateurs de ligne Unicode et marques de
// direction du texte (utilisées pour tromper l'affichage).
/* eslint-disable no-control-regex */
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g
/* eslint-enable no-control-regex */

/** Texte à plat : contrôles retirés, blancs réduits, tronqué avec « … ». */
export function cleanText(raw: string | undefined | null, max: number): string {
  if (!raw) return ''
  const flat = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  if (chars.length <= max) return flat
  // Ne coupe pas au milieu d'une paire de substitution Unicode.
  return `${chars.slice(0, max).join('').trimEnd()}…`
}

/** Donnée utilisateur présentée entre guillemets français : « … ». */
export function quoteData(raw: string | undefined | null, max = LABEL_MAX): string {
  const text = cleanText(raw, max)
  return text ? `« ${text} »` : '« (sans texte) »'
}

/** Début d'une note pour un lien ou un aperçu. */
export function noteExcerpt(notes: string | undefined | null): string | undefined {
  const text = cleanText(notes, NOTE_EXCERPT_MAX)
  return text || undefined
}

/** Normalisation pour la recherche : sans accents, sans casse. */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-CA')
}

/** « 1 point de repère » / « 3 points de repère ». */
export function plural(count: number, one: string, many?: string): string {
  return `${count} ${count === 1 ? one : (many ?? `${one}s`)}`
}

const dayFormat = new Intl.DateTimeFormat('fr-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Jour local lisible (`2026-10-03`), ou « date inconnue ». */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return 'date inconnue'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'date inconnue' : dayFormat.format(date)
}

/** Date et heure locales lisibles, ou « date inconnue ». */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'date inconnue'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  return `${dayFormat.format(date)} ${date.toLocaleTimeString('fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}
