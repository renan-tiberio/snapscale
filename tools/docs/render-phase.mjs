import {
  renderPhaseClosing,
  renderPhaseMeasurement,
  renderPhaseStory,
  storyChapterOf,
} from '../lib/phase-story.mjs'

import { renderMarkdown } from './markdown.mjs'
import { escapeHtml } from './text.mjs'

// The pane of one phase. The story it tells — the problem, the change, what that
// bought and cost, the measurement, the lesson — comes from ../lib/phase-story.mjs;
// what stays here is the pane's own furniture and the numbers read off the
// evidence files on disk.
//
// What used to be here and is gone: the per-phase commit chart, the commit log and
// the commit/author/diffstat rows. This page tracks the problem and the solution,
// and how many commits a branch carries is neither.

const MISSING = '—'
// The phase report is titled with h3 and each of its sections with h4, so a
// heading written inside one of those sections starts one level below again.
const NARRATIVE_HEADING_LEVEL = 5

const emptyNote = ({ text }) => `<p class="empty-note">${escapeHtml({ value: text })}</p>`

const sourceLabel = ({ path, detail }) =>
  `<code>${escapeHtml({ value: path })}</code>${detail === undefined ? '' : ` ${escapeHtml({ value: detail })}`}`

const measuredRow = ({ metric, value, provenance }) =>
  `<tr><th scope="row">${escapeHtml({ value: metric })}</th><td class="num">${value}</td><td class="muted">${provenance}</td></tr>`

const lowestLines = ({ packages }) => {
  const withLines = packages.filter((entry) => typeof entry.lines === 'number')
  if (withLines.length === 0) return null
  return withLines.reduce(
    (lowest, entry) => (entry.lines < lowest.lines ? entry : lowest),
    withLines[0],
  )
}

const evidenceRows = ({ evidence }) => {
  if (!evidence.exists) {
    return [
      measuredRow({
        metric: 'Tests',
        value: MISSING,
        provenance: `no <code>${escapeHtml({ value: evidence.directory })}/</code> directory`,
      }),
    ]
  }
  const coverage = evidence.coverage
  const verification = evidence.verification
  const lowest =
    coverage === null || coverage.missing !== null
      ? null
      : lowestLines({ packages: coverage.packages })
  return [
    measuredRow({
      metric: 'Tests',
      value:
        coverage?.total?.tests === undefined || coverage?.total?.tests === null
          ? MISSING
          : `${coverage.total.tests} <span class="muted">in ${coverage.total.testFiles ?? MISSING} files</span>`,
      provenance:
        coverage === null
          ? 'no <code>coverage-summary.md</code> in the evidence directory'
          : coverage.missing !== null
            ? `${sourceLabel({ path: coverage.path })} — ${escapeHtml({ value: coverage.missing })}`
            : sourceLabel({ path: coverage.path, detail: `§ ${coverage.heading}` }),
    }),
    measuredRow({
      metric: 'Lowest lines % across packages',
      value:
        lowest === null
          ? MISSING
          : `${lowest.lines} <span class="muted">(${escapeHtml({ value: lowest.name })})</span>`,
      provenance:
        coverage === null || coverage.missing !== null
          ? 'not extractable'
          : sourceLabel({ path: coverage.path, detail: `§ ${coverage.heading}` }),
    }),
    measuredRow({
      metric: 'Gate checks',
      value:
        verification === null || verification.checkCount === 0
          ? MISSING
          : `${verification.passCount} PASS / ${verification.failCount} FAIL <span class="muted">of ${verification.checkCount}</span>`,
      provenance:
        verification === null
          ? 'no <code>verification.md</code> in the evidence directory'
          : verification.missing !== null
            ? `${sourceLabel({ path: verification.path })} — ${escapeHtml({ value: verification.missing })}`
            : sourceLabel({ path: verification.path, detail: '§ Summary' }),
    }),
  ]
}

const measuredTable = ({ phase }) =>
  [
    '<div class="table-wrap"><table><thead><tr><th>Metric</th><th class="num">Value</th><th>Where it comes from</th></tr></thead><tbody>',
    ...evidenceRows({ evidence: phase.evidence }),
    '</tbody></table></div>',
  ].join('')

const dataTableFromRows = ({ header, rows }) =>
  [
    '<div class="table-wrap"><table><thead><tr>',
    header.map((cell) => `<th>${escapeHtml({ value: cell })}</th>`).join(''),
    '</tr></thead><tbody>',
    rows
      .map(
        (row) => `<tr>${row.map((cell) => `<td>${renderInlineCell({ cell })}</td>`).join('')}</tr>`,
      )
      .join(''),
    '</tbody></table></div>',
  ].join('')

const renderInlineCell = ({ cell }) => {
  const html = renderMarkdown({ source: cell })
  return html.replace(/^<p>/, '').replace(/<\/p>$/, '')
}

const narrativeSections = ({ phase, narrativePath }) => {
  if (phase.narrative === null) {
    return emptyNote({
      text: `No phase report at ${narrativePath}. Per the contract in docs/phases/README.md this phase reads as pending, and what the plan and the architecture declare above is all that is known about it.`,
    })
  }
  return phase.narrative.sections
    .map(
      (section) =>
        `<h4>${escapeHtml({ value: section.heading })}</h4>${section.body === '' ? emptyNote({ text: 'Section present but empty in the source file.' }) : renderMarkdown({ source: section.body, minHeadingLevel: NARRATIVE_HEADING_LEVEL })}`,
    )
    .join('')
}

const evidenceBlock = ({ phase }) => {
  const evidence = phase.evidence
  if (!evidence.exists) {
    return emptyNote({
      text: `No ${evidence.directory}/ directory, so this phase has no committed exit-criterion evidence.`,
    })
  }
  const files = dataTableFromRows({
    header: ['File', 'Lines', 'Bytes'],
    rows: evidence.files.map((file) => [
      `\`${file.name}\``,
      String(file.lines ?? MISSING),
      String(file.bytes ?? MISSING),
    ]),
  })
  const header =
    evidence.verification === null || evidence.verification.header.length === 0
      ? ''
      : dataTableFromRows({
          header: ['Recorded in verification.md', 'Value'],
          rows: evidence.verification.header.map((entry) => [entry.key, entry.value]),
        })
  const summary =
    evidence.verification?.summary === null || evidence.verification === null
      ? emptyNote({
          text: `No machine-readable "## Summary" table in ${evidence.verification?.path ?? 'verification.md'}, so no gate table is reproduced here.`,
        })
      : dataTableFromRows({
          header: evidence.verification.summary.header,
          rows: evidence.verification.summary.rows,
        })
  const findings = evidence.hasFindings
    ? ''
    : emptyNote({
        text: `The Definition of Done asks for a findings.md in ${evidence.directory}/; there is none.`,
      })
  return [files, header, summary, findings].join('')
}

const decisionList = ({ phase, decisionsPath }) => {
  if (phase.decisions.length === 0) {
    return emptyNote({
      text: `No entry in ${decisionsPath} is tagged "(phase ${phase.number})". Untagged entries bind from the start of the project and are listed once, under Decisions.`,
    })
  }
  return `<ul>${phase.decisions
    .map(
      (decision) =>
        `<li><strong>#${decision.number}</strong> ${renderInlineCell({ cell: decision.picked })}${decision.over === null ? '' : ` <span class="muted">— over ${renderInlineCell({ cell: decision.over })}</span>`}</li>`,
    )
    .join('')}</ul>`
}

// The order is the story: what was wrong, what changed, what that bought and
// cost, what was thrown away, how it gets proved, what actually happened, what it
// teaches — then the handover into the next phase.
export const renderPhase = ({ phase, paths, evolution, metrics }) => {
  const isEmpty = phase.narrative === null && !phase.history.exists && !phase.evidence.exists
  const chapter = storyChapterOf({ evolution, number: phase.number })
  return [
    `<article class="phase${isEmpty ? ' is-empty' : ''}" id="phase-${phase.number}">`,
    '<div class="phase-head">',
    `<h2>Phase ${phase.number} — ${escapeHtml({ value: phase.name })}</h2>`,
    `<span class="pill pill-${phase.status === 'done' ? 'done' : 'pending'}">${escapeHtml({ value: phase.status })}</span>`,
    `<span class="branch">${escapeHtml({ value: phase.branch ?? 'no branch declared' })}</span>`,
    '</div>',
    '<dl class="kv">',
    `<dt>status</dt><dd>${renderInlineCell({ cell: phase.statusSource })}</dd>`,
    `<dt>branch</dt><dd><code>${escapeHtml({ value: phase.branch ?? MISSING })}</code> — ${phase.history.exists ? 'exists in this repository' : 'not created yet'}</dd>`,
    phase.qualifier === ''
      ? ''
      : `<dt>plan note</dt><dd>${escapeHtml({ value: phase.qualifier })}</dd>`,
    '</dl>',
    renderPhaseStory({ ...chapter, paths }),
    renderPhaseMeasurement({ story: chapter.story, metrics, paths }),
    "<h4>Measured on this phase's own evidence</h4>",
    measuredTable({ phase }),
    `<h4>Evidence <span class="muted">· ${escapeHtml({ value: phase.evidence.directory })}/</span></h4>`,
    evidenceBlock({ phase }),
    `<h3>What actually happened <span class="muted">· ${escapeHtml({ value: phase.narrativePath })}</span></h3>`,
    narrativeSections({ phase, narrativePath: phase.narrativePath }),
    renderPhaseClosing({ story: chapter.story, next: chapter.next, paths }),
    `<h3>Decisions tagged to this phase <span class="muted">· ${escapeHtml({ value: paths.decisions })}</span></h3>`,
    decisionList({ phase, decisionsPath: paths.decisions }),
    '</article>',
  ].join('')
}
