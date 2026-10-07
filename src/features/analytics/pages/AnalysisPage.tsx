import { Activity, Compass, History, LayoutGrid, Sun, Wind } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@/components/ui'

const ANALYZERS = [
  {
    icon: Compass,
    label: 'Terrain',
    description:
      'Pente et exposition réelles, tirées des données d’élévation de la carte.',
  },
  {
    icon: Activity,
    label: 'Végétation',
    description: 'Étiquettes réelles d’occupation du sol d’OpenStreetMap près du point.',
  },
  {
    icon: Sun,
    label: 'Météo',
    description: 'Une prévision à jour, obtenue sur demande, pour cet endroit précis.',
  },
  {
    icon: Wind,
    label: 'Vent',
    description:
      'Une lecture ciblée pour cet endroit, comparée au vent optimal enregistré, le cas échéant.',
  },
  {
    icon: Sun,
    label: 'Moment',
    description:
      'Données de soleil, de lune et de période solunaire pour le moment présent.',
  },
  {
    icon: History,
    label: 'Historique',
    description: 'Vos propres points de repère à proximité et vos traces GPS passées.',
  },
]

/**
 * Phases 8 (Analytics Engine) and 9 (Analysis Map) are both complete —
 * this page is a landing/overview for them, since the actual tools live
 * on the Map page (they need a live `MapInstance` for real elevation
 * queries): "Analyze this spot" for one point, and the analysis heatmap
 * toggle for the whole visible area.
 */
export function AnalysisPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analyse du terrain"
        description="6 analyseurs indépendants et explicables — ouvrez la page Carte pour les utiliser."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-brand-400" aria-hidden="true" />
            Où les trouver
          </CardTitle>
          <CardDescription>
            Les deux outils se trouvent sur la page Carte, car ils ont besoin d’une
            requête d’élévation en direct au point touché.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-ink-300">
            <span className="text-ink-100 font-medium">Analyser cet endroit</span> —
            touchez l’icône d’activité, puis touchez la carte une fois, pour obtenir une
            analyse détaillée et explicable d’un point.
          </p>
          <p className="text-ink-300">
            <span className="text-ink-100 font-medium">Carte thermique d’analyse</span> —
            touchez l’icône de grille pour colorer toute la zone visible selon le
            pointage, en alternant entre le pointage combiné et celui d’un seul analyseur.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-ink-300 mb-3 text-sm font-semibold">Les 6 analyseurs</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ANALYZERS.map((analyzer) => (
            <Card key={analyzer.label} className="flex items-start gap-3 p-3">
              <analyzer.icon
                size={18}
                className="text-brand-400 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-ink-100 text-sm font-medium">{analyzer.label}</p>
                <p className="text-ink-500 text-xs">{analyzer.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-ink-500 text-xs">
        Chaque pointage est une estimation probabiliste fondée sur des données réelles,
        jamais présentée comme une certitude — déployez les facteurs d’un analyseur pour
        voir exactement ce qui l’a produit.
      </p>
    </div>
  )
}
