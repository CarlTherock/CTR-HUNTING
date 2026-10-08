export function scoreLabel(score: number): string {
  if (score >= 75) return 'Favorable'
  if (score >= 55) return 'Plutôt favorable'
  if (score >= 45) return 'Neutre'
  if (score >= 25) return 'Plutôt défavorable'
  return 'Défavorable'
}

/** « +0,4 » / « −0,3 » / « 0,0 » (virgule décimale française). */
export function formatContribution(value: number): string {
  const text = Math.abs(value).toFixed(1).replace('.', ',')
  if (value > 0) return `+${text}`
  if (value < 0) return `−${text}`
  return text
}

/** Date/heure d'une donnée, lisible : un ISO en UTC (`…Z`) est converti à
 * l'heure locale de l'appareil ; une heure locale de fournisseur
 * (`YYYY-MM-DDTHH:mm`) est affichée telle quelle. */
export function formatDataTime(value: string): string {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('fr-CA', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(value)
  return m ? `${m[2]}/${m[1]} ${m[3]}` : value
}
