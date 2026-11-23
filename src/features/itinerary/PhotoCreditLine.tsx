import type { PhotoCredit } from '@/shared/schemas'

/** "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons", as the licence asks. */
export function PhotoCreditLine({ credit, className = 'mt-1.5 px-1' }: { credit: PhotoCredit; className?: string }) {
  return (
    <figcaption className={`truncate text-xs text-muted-foreground ${className}`}>
      Photo:{' '}
      <a href={credit.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        {credit.author}
      </a>
      {' · '}
      {credit.licenseUrl ? (
        <a href={credit.licenseUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}
      {' · Wikimedia Commons'}
    </figcaption>
  )
}
