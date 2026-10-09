import type { AnatomySource } from '../types'

const RETRIEVED = '2026-10-08'

/** Pages actually read on RETRIEVED (through a summarising reader, not as raw
 * text). The DeerCast pages describe the product, not anatomy: they are not
 * cited by any sheet. */
export const ANATOMY_SOURCES: readonly AnatomySource[] = [
  {
    id: 'adfg-shot',
    title: 'Big Game Shot Placement',
    publisher: 'Alaska Department of Fish and Game',
    kind: 'officielle',
    url: 'https://www.adfg.alaska.gov/index.cfm?adfg=hunting.shot',
    retrievedOn: RETRIEVED,
    scope:
      'Gros gibier d’Alaska, dont l’orignal. Localise la zone cœur-poumons et signale les os d’épaule ; ne décrit ni foie, ni panse, ni intestins, ni conduite après le tir.',
  },
  {
    id: 'tpwd-after-shot',
    title: 'After the Shot',
    publisher: 'Texas Parks and Wildlife Department',
    kind: 'officielle',
    url: 'https://tpwd.texas.gov/education/hunter-education/online-course/hunting-skills-1/after-the-shot',
    retrievedOn: RETRIEVED,
    scope: 'Cerf (Texas). Repères avant le tir, observation, attente, recherche.',
  },
  {
    id: 'hunter-ed-blood',
    title: 'Blood sign',
    publisher: 'Hunter-Ed (Nouvelle-Galles du Sud)',
    kind: 'éducation',
    url: 'https://www.hunter-ed.com/newsouthwales/studyGuide/Blood-sign/20160101_257090/',
    retrievedOn: RETRIEVED,
    scope:
      'Indices de sang, sans espèce précisée. Présentés comme des possibilités, pas des certitudes.',
  },
  {
    id: 'hunter-ed-trailing',
    title: 'Trailing Wounded Game',
    publisher: 'Hunter-Ed (États-Unis)',
    kind: 'éducation',
    url: 'https://www.hunter-ed.com/national/studyGuide/Trailing-Wounded-Game/201099_92937/',
    retrievedOn: RETRIEVED,
    scope:
      'Organisation de la recherche, centrée sur le cerf. Ne dit pas quand faire appel à de l’aide.',
  },
  {
    id: 'huntstand-deer',
    title: 'How to Blood Trail and Recover Wounded Deer',
    publisher: 'HuntStand',
    kind: 'commerciale',
    url: 'https://www.huntstand.com/fieldnotes/deer/how-to-blood-trail-and-recover-wounded-deer/',
    retrievedOn: RETRIEVED,
    scope: 'Cerf. Conseils de pisteur, avec délais chiffrés propres à la source.',
  },
  {
    id: 'meateater-track',
    title: 'How to Blood Trail and Track Game Animals',
    publisher: 'MeatEater',
    kind: 'média',
    url: 'https://www.themeateater.com/hunt/big-game/how-to-blood-trail-and-track-game-animals',
    retrievedOn: RETRIEVED,
    scope:
      'Gibier en général, exemples surtout de cerf. Réactions, indices et mises en garde, avec délais chiffrés propres à la source.',
  },
]

export function sourceById(id: string): AnatomySource | undefined {
  return ANATOMY_SOURCES.find((s) => s.id === id)
}
