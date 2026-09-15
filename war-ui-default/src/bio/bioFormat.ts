// Pure text-insertion logic behind BioEditor's toolbar: given the
// textarea's current value and selection, returns the new value and the
// selection to apply afterward. Kept free of any DOM/React dependency so
// it's unit-testable on its own (the spec's constrained bio
// markdown subset — bold, italic, lists, links, headings — not full
// markdown).

export interface TextSelection {
  start: number
  end: number
}

export type BioFormatMarker =
  | 'bold'
  | 'italic'
  | 'bulletList'
  | 'numberedList'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'

export interface FormatResult {
  text: string
  selection: TextSelection
}

interface WrapTemplate {
  prefix: string
  suffix: string
  placeholder: string
}

const WRAP_TEMPLATES: Record<'bold' | 'italic', WrapTemplate> = {
  bold: { prefix: '**', suffix: '**', placeholder: 'bold text' },
  italic: { prefix: '*', suffix: '*', placeholder: 'italic text' },
}

// One handler per marker, looked up rather than branched on — adding a
// future marker means adding a map entry, not another decision point in
// this function (cyclomatic complexity stays 1; a `switch` over all five
// markers measured 6, over CLAUDE.md's report threshold of 5).
const FORMATTERS: Record<BioFormatMarker, (text: string, selection: TextSelection) => FormatResult> = {
  bold: (text, selection) => wrapSelection(text, selection, WRAP_TEMPLATES.bold),
  italic: (text, selection) => wrapSelection(text, selection, WRAP_TEMPLATES.italic),
  link: insertLink,
  bulletList: (text, selection) => prefixLines(text, selection, () => '- '),
  numberedList: (text, selection) => prefixLines(text, selection, (lineIndex) => `${lineIndex + 1}. `),
  heading1: (text, selection) => prefixLines(text, selection, () => '# '),
  heading2: (text, selection) => prefixLines(text, selection, () => '## '),
  heading3: (text, selection) => prefixLines(text, selection, () => '### '),
}

export function applyBioFormat(text: string, selection: TextSelection, marker: BioFormatMarker): FormatResult {
  return FORMATTERS[marker](text, selection)
}

// Wraps the selection (or, if empty, a placeholder) in the marker's
// prefix/suffix and selects the wrapped word(s) — not the markers — so
// typing immediately replaces them.
function wrapSelection(text: string, selection: TextSelection, template: WrapTemplate): FormatResult {
  const { start, end } = selection
  const selected = text.slice(start, end) || template.placeholder
  const before = text.slice(0, start)
  const after = text.slice(end)
  const selectionStart = before.length + template.prefix.length
  const selectionEnd = selectionStart + selected.length
  return {
    text: `${before}${template.prefix}${selected}${template.suffix}${after}`,
    selection: { start: selectionStart, end: selectionEnd },
  }
}

// A link needs two edits in sequence — link text, then the destination —
// so this selects the url placeholder rather than the link text: the
// destination is the field a caller almost always needs to fill in next.
function insertLink(text: string, selection: TextSelection): FormatResult {
  const { start, end } = selection
  const linkText = text.slice(start, end) || 'link text'
  const before = text.slice(0, start)
  const after = text.slice(end)
  const urlPlaceholder = 'url'
  const urlStart = before.length + 1 /* [ */ + linkText.length + 2 /* ]( */
  const urlEnd = urlStart + urlPlaceholder.length
  return {
    text: `${before}[${linkText}](${urlPlaceholder})${after}`,
    selection: { start: urlStart, end: urlEnd },
  }
}

// List markers operate per-line, not per-character — every line the
// selection touches (or, with no selection, one empty line at the cursor)
// gets its own prefix. The cursor lands after the inserted block, collapsed,
// since a wrapped-word selection (as bold/italic use) makes no sense for a
// multi-line insertion.
function prefixLines(text: string, selection: TextSelection, prefixFor: (lineIndex: number) => string): FormatResult {
  const { start, end } = selection
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)
  const lines = selected.length > 0 ? selected.split('\n') : ['']
  const prefixed = lines.map((line, index) => `${prefixFor(index)}${line}`).join('\n')
  const cursor = before.length + prefixed.length
  return { text: `${before}${prefixed}${after}`, selection: { start: cursor, end: cursor } }
}
