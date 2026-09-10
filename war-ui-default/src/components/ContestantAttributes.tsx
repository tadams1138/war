// Renders the resolved `attributes` array from the API as a simple
// label/value list, in the order the array supplies (the spec). Used on
// the War detail page's contestant gallery only. It has no
// knowledge of what the fields mean — a pageant's Country/Age/Height and a
// primary's Party/State/Office render through the identical component.
// Fields the contestant omitted are simply absent from `attributes` — the
// API only resolves fields it has a value for, so there is nothing here to
// skip explicitly.
import type { ResolvedAttribute } from '../api/client'
import { isSafeHttpUrl } from '../utils/url'

interface ContestantAttributesProps {
  attributes: ResolvedAttribute[]
}

export function ContestantAttributes({ attributes }: ContestantAttributesProps) {
  if (attributes.length === 0) return null

  return (
    <dl>
      {attributes.map((attribute) => (
        <div key={attribute.key}>
          <dt>{attribute.label}</dt>
          <dd>{renderValue(attribute)}</dd>
        </div>
      ))}
    </dl>
  )
}

function renderValue(attribute: ResolvedAttribute) {
  const value = String(attribute.value)
  if (attribute.type === 'url' && isSafeHttpUrl(value)) {
    return (
      <a href={value} rel="noopener noreferrer" target="_blank">
        {value}
      </a>
    )
  }
  return value
}
