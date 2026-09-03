import { fileStats, listDirectory, readTextFile } from './repo.mjs'
import { joinWrapped, splitTableRow } from './text.mjs'

// Everything here is read out of docs/evidence/phase-<N>/. Nothing is computed,
// nothing is defaulted: a heading the extractor cannot find comes back as a
// `missing` note that the page prints, so a reader can see which claim has no
// evidence behind it.

const EVIDENCE_ROOT = 'docs/evidence'
const VERIFICATION_FILE = 'verification.md'
const COVERAGE_FILE = 'coverage-summary.md'
const FINDINGS_FILE = 'findings.md'

const HEADER_KEYS = [
  'Date',
  'Branch',
  'Commit',
  'Commit verified',
  'Base branch',
  'Verifier',
  'Command',
  'Result',
]
const HEADER_SCAN_LINES = 20

const COVERAGE_COLUMNS = {
  Package: 'name',
  'Test Files': 'testFiles',
  Tests: 'tests',
  'Stmts %': 'statements',
  'Branch %': 'branches',
  'Funcs %': 'functions',
  'Lines %': 'lines',
}

const stripEmphasis = ({ value }) => value.replace(/\*\*/g, '').trim()

const asNumber = ({ value }) => {
  const match = stripEmphasis({ value }).match(/-?\d+(\.\d+)?/)
  return match === null ? null : Number(match[0])
}

const isSeparatorRow = ({ line }) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

const tableAfter = ({ source, headingPattern }) => {
  const lines = source.split('\n')
  const headingIndex = lines.findIndex((line) => headingPattern.test(line))
  if (headingIndex === -1) return null
  const start = lines.findIndex(
    (line, index) =>
      index > headingIndex &&
      line.includes('|') &&
      isSeparatorRow({ line: lines[index + 1] ?? '' }),
  )
  if (start === -1) return null
  const endOffset = lines.slice(start).findIndex((line) => !line.includes('|'))
  const end = endOffset === -1 ? lines.length : start + endOffset
  const rows = lines.slice(start, end).filter((line) => !isSeparatorRow({ line }))
  return {
    heading: lines[headingIndex].replace(/^#+\s*/, '').trim(),
    header: splitTableRow({ row: rows[0] }).map((cell) => stripEmphasis({ value: cell })),
    rows: rows.slice(1).map((row) => splitTableRow({ row })),
  }
}

const HEADER_LINE = /^([A-Z][A-Za-z ]{1,20}): (.+)$/

// The header of a verification file is `Key: value` lines that may wrap onto the
// following lines. Truncating at the first newline would cut a sentence in half,
// so a wrapped continuation is folded back into its key's value.
const readHeaderBlock = ({ source }) => {
  const lines = source.split('\n').slice(0, HEADER_SCAN_LINES)
  return lines
    .map((line, index) => ({ match: line.match(HEADER_LINE), index }))
    .filter((entry) => entry.match !== null && HEADER_KEYS.includes(entry.match[1]))
    .map((entry) => {
      const continuationEnd = lines.findIndex(
        (line, index) =>
          index > entry.index &&
          (line.trim() === '' || HEADER_LINE.test(line) || /^[#>-]/.test(line.trim())),
      )
      const rest = lines.slice(
        entry.index + 1,
        continuationEnd === -1 ? lines.length : continuationEnd,
      )
      return { key: entry.match[1], value: joinWrapped({ lines: [entry.match[2], ...rest] }) }
    })
}

const readVerification = ({ phaseNumber }) => {
  const relative = `${EVIDENCE_ROOT}/phase-${phaseNumber}/${VERIFICATION_FILE}`
  const source = readTextFile({ relative })
  if (source === null) return null
  const header = readHeaderBlock({ source })
  const summary = tableAfter({ source, headingPattern: /^##+\s+Summary\s*$/ })
  const resultColumn =
    summary === null ? -1 : summary.header.findIndex((cell) => /result/i.test(cell))
  const results =
    summary === null || resultColumn === -1
      ? []
      : summary.rows.map((row) => stripEmphasis({ value: row[resultColumn] ?? '' }))
  return {
    path: relative,
    header,
    summary,
    missing: summary === null ? 'no "## Summary" table found' : null,
    failCount: results.filter((result) => /FAIL/i.test(result)).length,
    passCount: results.filter((result) => /PASS/i.test(result)).length,
    checkCount: results.length,
  }
}

const readCoverage = ({ phaseNumber }) => {
  const relative = `${EVIDENCE_ROOT}/phase-${phaseNumber}/${COVERAGE_FILE}`
  const source = readTextFile({ relative })
  if (source === null) return null
  const table = tableAfter({ source, headingPattern: /^##+\s+Totals/ })
  if (table === null) {
    return { path: relative, missing: 'no "## Totals…" table found', packages: [], total: null }
  }
  const unknownColumns = table.header.filter((cell) => COVERAGE_COLUMNS[cell] === undefined)
  const rows = table.rows.map((row) =>
    table.header.reduce((accumulator, cell, index) => {
      const key = COVERAGE_COLUMNS[cell]
      if (key === undefined) return accumulator
      const raw = row[index] ?? ''
      return {
        ...accumulator,
        [key]: key === 'name' ? stripEmphasis({ value: raw }) : asNumber({ value: raw }),
      }
    }, {}),
  )
  const isTotalRow = (row) => /total/i.test(row.name ?? '')
  return {
    path: relative,
    heading: table.heading,
    missing: null,
    unknownColumns,
    packages: rows.filter((row) => !isTotalRow(row)),
    total: rows.find(isTotalRow) ?? null,
  }
}

export const readEvidence = ({ phaseNumber }) => {
  const directory = `${EVIDENCE_ROOT}/phase-${phaseNumber}`
  const names = listDirectory({ relative: directory })
  if (names === null) return { directory, exists: false }
  return {
    directory,
    exists: true,
    files: names.map((name) => ({
      name,
      path: `${directory}/${name}`,
      ...(fileStats({ relative: `${directory}/${name}` }) ?? { lines: null, bytes: null }),
    })),
    hasFindings: names.includes(FINDINGS_FILE),
    verification: readVerification({ phaseNumber }),
    coverage: readCoverage({ phaseNumber }),
  }
}
