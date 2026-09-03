const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export const escapeHtml = ({ value }) =>
  String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])

export const slug = ({ value }) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Diagram and chart text is drawn in a monospace stack, so an advance width of
// 0.62em per glyph holds on every mono face this document can land on (Menlo
// 0.602, SF Mono 0.600, Consolas 0.550, DejaVu Sans Mono 0.602). Widths are
// therefore never under-estimated, which is what would clip a label.
const MONO_ADVANCE_RATIO = 0.62

export const measureMono = ({ text, fontSize }) => text.length * fontSize * MONO_ADVANCE_RATIO

export const widestLine = ({ lines, fontSize }) =>
  lines.reduce((widest, line) => Math.max(widest, measureMono({ text: line, fontSize })), 0)

// SVG geometry is emitted at a fixed precision so two runs of the generator
// cannot differ by a floating-point tail.
const COORDINATE_DECIMALS = 2

export const round = ({ value }) => Number(value.toFixed(COORDINATE_DECIMALS))

export const splitTableRow = ({ row }) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())

// Wrapped prose joins with a space, except where the author wrapped a compound
// word at its hyphen ("Exit-\ncriterion"): joining those with a space would put
// a space inside a word that has none in the source.
export const joinWrapped = ({ lines }) =>
  lines
    .reduce(
      (joined, line) =>
        joined === ''
          ? line.trim()
          : `${joined}${/[A-Za-z]-$/.test(joined) ? '' : ' '}${line.trim()}`,
      '',
    )
    .trim()
