/**
 * Every outside service the app contacts, as it appears on the privacy page.
 *
 * `hosts` uses the exact strings of `PROVIDER_HOSTS` in `build/csp.ts` (the
 * Content-Security-Policy allow-list, which is also what the browser enforces
 * at run time): a test fails if a host allowed there is missing here, so the
 * page cannot silently fall behind the code. Each description was written from
 * the provider adapters in `src/services/` — update them together.
 */
export interface NetworkProvider {
  id: string
  name: string
  /** CSP entries covered by this provider (scheme included, wildcards kept). */
  hosts: readonly string[]
  /** What the app uses it for. */
  purpose: string
  /** What is sent to it, besides the IP address which every request reveals. */
  sent: string
  /** When the request happens. */
  when: string
  /** Credit / licence line, as far as the code and docs establish it. */
  credit: string
}

export const NETWORK_PROVIDERS: readonly NetworkProvider[] = [
  {
    id: 'maptiler',
    name: 'MapTiler',
    hosts: ['https://api.maptiler.com'],
    purpose: 'Fonds de carte « Plein air » et « Satellite » (style, tuiles, polices).',
    sent: 'La clé d’accès de l’application et les coordonnées des tuiles demandées, donc la zone et le niveau de zoom affichés.',
    when: 'Quand ce fond de carte est affiché ou téléchargé pour le hors ligne.',
    credit:
      'Données © MapTiler et © contributeurs OpenStreetMap, selon les conditions de MapTiler.',
  },
  {
    id: 'esri',
    name: 'Esri (ArcGIS)',
    hosts: ['https://*.arcgis.com', 'https://*.arcgisonline.com'],
    purpose:
      'Fonds de carte Esri : topographique, imagerie, terrain, relief, gris clair/foncé, navigation.',
    sent: 'La clé d’accès de l’application et les coordonnées des tuiles demandées (zone et zoom affichés).',
    when: 'Quand un fond Esri est affiché ou téléchargé pour le hors ligne.',
    credit:
      'Données et imagerie © Esri et leurs fournisseurs, selon les conditions d’Esri.',
  },
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    hosts: ['https://api.open-meteo.com'],
    purpose: 'Météo (page Météo, accueil) et vent (couche vent, comparaison de vent).',
    sent: 'Météo : la latitude et la longitude du lieu, sans arrondi (votre position GPS si elle est connue, sinon le centre de la carte). Vent et couches météo : une grille de points sur la zone visible, à 4 décimales.',
    when: 'À l’ouverture de la page Météo, à l’activation de la couche vent, ou sur demande (bouton « Charger la météo »).',
    credit: 'Données météo Open-Meteo.com (licence CC BY 4.0).',
  },
  {
    id: 'overpass',
    name: 'Overpass API (OpenStreetMap)',
    hosts: ['https://overpass-api.de'],
    purpose:
      'Couverture du sol (forêt, milieux humides, cultures…) pour l’analyse du terrain.',
    sent: 'Un point et un rayon, ou les limites de la zone visible, en coordonnées complètes.',
    when: 'Quand une analyse de terrain ou une comparaison a besoin de la couverture du sol.',
    credit: 'Données © contributeurs OpenStreetMap (licence ODbL).',
  },
  {
    id: 'aws-terrain',
    name: 'Tuiles d’élévation (AWS Open Data « Terrain Tiles »)',
    hosts: ['https://s3.amazonaws.com'],
    purpose: 'Relief : altitude, pente, profil d’élévation et vue 3D.',
    sent: 'Seulement les numéros de tuile (zoom, colonne, rangée) de la zone affichée.',
    when: 'Dès que la carte est affichée (le relief est toujours chargé, même en vue 2D).',
    credit:
      'Jeu de données public « Terrain Tiles » (AWS Open Data) ; ses sources d’élévation sont décrites par le registre AWS Open Data.',
  },
  {
    id: 'geomet',
    name: 'Environnement et Changement climatique Canada (GeoMet)',
    hosts: ['https://geo.weather.gc.ca'],
    purpose: 'Couches météo sur la carte (radar, etc.).',
    sent: 'Le nom de la couche, l’heure et l’emprise des images demandées ; pour une valeur ponctuelle, le point touché.',
    when: 'Quand une couche météo de la carte est activée.',
    credit:
      'Données d’Environnement et Changement climatique Canada, Service météorologique du Canada.',
  },
  {
    id: 'qc-msp',
    name: 'Gouvernement du Québec — Forêt ouverte (MRNF)',
    hosts: ['https://geoegl.msp.gouv.qc.ca'],
    purpose: 'Couches forestières, relief ombré LiDAR et année d’acquisition du LiDAR.',
    sent: 'L’emprise de la carte et le nom de la couche, pour chaque image demandée.',
    when: 'Quand une de ces couches est activée.',
    credit: '© Gouvernement du Québec, licence CC-BY 4.0.',
  },
  {
    id: 'qc-env',
    name: 'Gouvernement du Québec — MELCCFP',
    hosts: ['https://geo.environnement.gouv.qc.ca'],
    purpose: 'Cadastre (lots) et registre des aires protégées.',
    sent: 'L’emprise de la carte et le numéro de couche, pour chaque image demandée.',
    when: 'Quand une de ces couches est activée.',
    credit: '© Gouvernement du Québec, licence CC-BY 4.0.',
  },
  {
    id: 'qc-mrnf',
    name: 'Gouvernement du Québec — Territoires récréatifs (MRNF)',
    hosts: ['https://servicescarto.mrnf.gouv.qc.ca'],
    purpose: 'Territoires fauniques, parcs et réserves (TRQ).',
    sent: 'L’emprise de la carte et les numéros de couche, pour chaque image demandée.',
    when: 'Quand une de ces couches est activée.',
    credit: '© Gouvernement du Québec, licence CC-BY 4.0.',
  },
]

/** « api.maptiler.com », « *.arcgis.com » : the host as people read it. */
export function displayHost(cspEntry: string): string {
  return cspEntry.replace(/^https:\/\//, '')
}
