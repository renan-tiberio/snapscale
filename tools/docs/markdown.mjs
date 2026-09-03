import { escapeHtml, joinWrapped, splitTableRow } from './text.mjs'

// A small block+inline markdown renderer: enough for the prose in docs/ and for
// the free-form bodies of the five phase-report sections (paragraphs, lists,
// tables, blockquotes, fenced code, headings, rules). It is deliberately not a
// full CommonMark implementation — anything it does not recognise is emitted as
// escaped text, never as raw HTML.

const ABSOLUTE_HREF = /^(https?:\/\/|mailto:|#)/

const inlineLink = ({ text, href }) => {
  if (ABSOLUTE_HREF.test(href)) {
    return `<a href="${escapeHtml({ value: href })}" rel="noopener">${text}</a>`
  }
  // A relative link inside a single generated file would point at nothing, so
  // the target is shown rather than linked — the reader still learns where the
  // source pointed.
  return `${text} <code class="muted">${escapeHtml({ value: href })}</code>`
}

const CODE_SPAN_PLACEHOLDER = '\u0000'

// Code spans are lifted out before the emphasis pass so `**` inside backticks
// survives verbatim.
export const renderInline = ({ source }) => {
  const codeSpans = []
  const lifted = source.replace(/`([^`]+)`/g, (_match, code) => {
    codeSpans.push(code)
    return `${CODE_SPAN_PLACEHOLDER}${codeSpans.length - 1}${CODE_SPAN_PLACEHOLDER}`
  })
  const escaped = escapeHtml({ value: lifted })
  const emphasised = escaped
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text, href) => inlineLink({ text, href }))
  return emphasised.replace(
    new RegExp(`${CODE_SPAN_PLACEHOLDER}(\\d+)${CODE_SPAN_PLACEHOLDER}`, 'g'),
    (_match, index) => `<code>${escapeHtml({ value: codeSpans[Number(index)] })}</code>`,
  )
}

const indentOf = ({ line }) => line.length - line.trimStart().length
const LIST_ITEM = /^([-*+]|\d+\.)\s+(.*)$/
const INDENT_STEP = 2

const renderListItems = ({ lines, headingOffset, minHeadingLevel }) => {
  const grouped = lines.reduce(
    (accumulator, line) => {
      const match = line.trimStart().match(LIST_ITEM)
      const isNewItem = match !== null && indentOf({ line }) <= accumulator.baseIndent
      if (isNewItem) {
        return {
          baseIndent: accumulator.items.length === 0 ? indentOf({ line }) : accumulator.baseIndent,
          items: [...accumulator.items, { text: match[2], rest: [] }],
        }
      }
      const previous = accumulator.items.at(-1)
      if (previous === undefined) return accumulator
      return {
        ...accumulator,
        items: [
          ...accumulator.items.slice(0, -1),
          {
            ...previous,
            rest: [...previous.rest, line.slice(accumulator.baseIndent + INDENT_STEP)],
          },
        ],
      }
    },
    { baseIndent: indentOf({ line: lines[0] }), items: [] },
  )
  return grouped.items
    .map((item) => {
      // A wrapped list item continues its own sentence: the plain lines that
      // follow belong to the item's text, not to a new block. Rendering them as
      // a separate paragraph would split an emphasis span across two blocks and
      // leave the `**` markers on the page.
      const blockStart = item.rest.findIndex(
        (line) => line.trimStart().match(LIST_ITEM) !== null || /^```/.test(line.trimStart()),
      )
      const lazy = blockStart === -1 ? item.rest : item.rest.slice(0, blockStart)
      const blocks = blockStart === -1 ? [] : item.rest.slice(blockStart)
      return `<li>${renderInline({ source: joinWrapped({ lines: [item.text, ...lazy] }) })}${renderBlocks({ lines: blocks, headingOffset, minHeadingLevel })}</li>`
    })
    .join('')
}

const renderTable = ({ rows }) => {
  const header = splitTableRow({ row: rows[0] })
  const body = rows.slice(2).map((row) => splitTableRow({ row }))
  const headerHtml = header.map((cell) => `<th>${renderInline({ source: cell })}</th>`).join('')
  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${renderInline({ source: cell })}</td>`).join('')}</tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
}

const isTableSeparator = ({ line }) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

const takeWhile = ({ lines, from, predicate }) => {
  const end = lines.slice(from).findIndex((line) => !predicate(line))
  return end === -1 ? lines.length : from + end
}

const HEADING = /^(#{1,6})\s+(.*)$/
const DEFAULT_MIN_HEADING_LEVEL = 4
const MAX_HEADING_LEVEL = 6

// h1-h3 belong to the page's own outline, so a block's own headings start at h4.
// The shallowest heading found in the block sets the offset, which keeps the
// outline contiguous instead of jumping from h3 straight to h6.
const headingOffsetOf = ({ lines, minHeadingLevel }) => {
  const levels = lines
    .map((line) => line.match(HEADING))
    .filter((match) => match !== null)
    .map((match) => match[1].length)
  return levels.length === 0 ? 0 : minHeadingLevel - Math.min(...levels)
}

const renderHeading = ({ match, headingOffset, minHeadingLevel }) => {
  const level = Math.min(
    Math.max(match[1].length + headingOffset, minHeadingLevel),
    MAX_HEADING_LEVEL,
  )
  return `<h${level}>${renderInline({ source: match[2] })}</h${level}>`
}

const renderBlocks = ({ lines, headingOffset, minHeadingLevel }) => {
  const walk = ({ index, html }) => {
    if (index >= lines.length) return html
    const line = lines[index]
    if (line.trim() === '') return walk({ index: index + 1, html })
    if (/^```/.test(line)) {
      const close = lines.slice(index + 1).findIndex((candidate) => /^```/.test(candidate))
      const end = close === -1 ? lines.length : index + 1 + close
      const code = lines.slice(index + 1, end).join('\n')
      return walk({
        index: end + 1,
        html: `${html}<pre><code>${escapeHtml({ value: code })}</code></pre>`,
      })
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim()))
      return walk({ index: index + 1, html: `${html}<hr/>` })
    const heading = line.match(HEADING)
    if (heading !== null) {
      return walk({
        index: index + 1,
        html: `${html}${renderHeading({ match: heading, headingOffset, minHeadingLevel })}`,
      })
    }
    if (line.trimStart().startsWith('> ') || line.trim() === '>') {
      const end = takeWhile({
        lines,
        from: index,
        predicate: (candidate) => candidate.trimStart().startsWith('>'),
      })
      const inner = lines
        .slice(index, end)
        .map((candidate) => candidate.trimStart().replace(/^>\s?/, ''))
      return walk({
        index: end,
        html: `${html}<blockquote>${renderBlocks({ lines: inner, headingOffset, minHeadingLevel })}</blockquote>`,
      })
    }
    if (line.includes('|') && isTableSeparator({ line: lines[index + 1] ?? '' })) {
      const end = takeWhile({
        lines,
        from: index,
        predicate: (candidate) => candidate.includes('|') && candidate.trim() !== '',
      })
      return walk({ index: end, html: `${html}${renderTable({ rows: lines.slice(index, end) })}` })
    }
    const listMatch = line.trimStart().match(LIST_ITEM)
    if (listMatch !== null) {
      const end = takeWhile({
        lines,
        from: index,
        predicate: (candidate) =>
          candidate.trim() !== '' &&
          (candidate.trimStart().match(LIST_ITEM) !== null ||
            indentOf({ line: candidate }) > indentOf({ line })),
      })
      const ordered = /^\d+\./.test(line.trimStart())
      const tag = ordered ? 'ol' : 'ul'
      return walk({
        index: end,
        html: `${html}<${tag}>${renderListItems({ lines: lines.slice(index, end), headingOffset, minHeadingLevel })}</${tag}>`,
      })
    }
    const end = takeWhile({
      lines,
      from: index,
      predicate: (candidate) =>
        candidate.trim() !== '' &&
        !/^```/.test(candidate) &&
        candidate.trimStart().match(LIST_ITEM) === null &&
        candidate.match(HEADING) === null &&
        !candidate.trimStart().startsWith('> '),
    })
    return walk({
      index: end,
      html: `${html}<p>${renderInline({ source: joinWrapped({ lines: lines.slice(index, end) }) })}</p>`,
    })
  }
  return walk({ index: 0, html: '' })
}

// `minHeadingLevel` is the shallowest heading the block may emit: the page owns
// h1-h3, a phase card's own section titles are h4, so a narrative body nested
// under one starts at h5.
export const renderMarkdown = ({ source, minHeadingLevel = DEFAULT_MIN_HEADING_LEVEL }) => {
  if (source === null || source.trim() === '') return ''
  const lines = source.split('\n')
  return renderBlocks({
    lines,
    minHeadingLevel,
    headingOffset: headingOffsetOf({ lines, minHeadingLevel }),
  })
}
