import { APRES_TIR_SECTIONS, type GuideSection } from './apresTir.content'
import { GUIDE_PENDING_LABEL, isSectionPublished } from './guideLogic'

/** Texte et source d'une section, ou « contenu à venir » : jamais de conseil
 * affiché sans source vérifiable. */
function Section({ section }: { section: GuideSection }) {
  const published = isSectionPublished(section)
  return (
    <section
      aria-label={section.title}
      data-testid={`guide-section-${section.id}`}
      className="border-surface-700 rounded-lg border p-3"
    >
      <h3 className="text-ink-100 text-sm font-semibold">{section.title}</h3>
      {published && section.source ? (
        <>
          {section.body.map((paragraph, index) => (
            <p key={index} className="text-ink-300 mt-2 text-sm">
              {paragraph}
            </p>
          ))}
          <p className="text-ink-500 mt-2 text-xs">
            Source : {section.source.title}, {section.source.publisher} (consulté le{' '}
            {section.source.retrievedOn})
            {section.source.url && (
              <>
                {' '}
                —{' '}
                <a
                  href={section.source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-400 underline"
                >
                  lien
                </a>
              </>
            )}
          </p>
        </>
      ) : (
        <p data-testid="guide-pending" className="text-ink-500 mt-1 text-sm">
          {GUIDE_PENDING_LABEL}
        </p>
      )}
    </section>
  )
}

/** Guide « Après le tir » : structure prête, contenu à fournir avec sources. */
export function AfterShotGuide({
  sections = APRES_TIR_SECTIONS,
}: {
  sections?: readonly GuideSection[]
}) {
  return (
    <div data-testid="aftershot-guide" className="flex flex-col gap-2">
      <h2 className="text-ink-100 text-base font-semibold">Guide après le tir</h2>
      {sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </div>
  )
}
