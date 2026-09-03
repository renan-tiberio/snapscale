import { renderGroupedBars, renderStackedBars } from '../docs/charts.mjs'
import { renderMarkdown } from '../docs/markdown.mjs'
import { escapeHtml } from '../docs/text.mjs'

// The two comparative panes: the nine-phase overview and the cross-phase charts.
// Both live here and nowhere else — a comparison repeated inside every phase card
// is nine chances for the same number to disagree with itself.

const MISSING = '—'
const PERCENT_MAX = 100
const PERCENT_TICKS = 4
const TEST_TICK_STEP = 100
const TICK_COUNT = 5

const roundUp = ({ value, step }) => Math.max(step, Math.ceil(value / step) * step)

const unitsOf = ({ phase }) => phase.evidence.coverage?.packages ?? []

const unitOrder = ({ phases }) =>
  phases
    .flatMap((phase) => unitsOf({ phase }))
    .map((entry) => entry.name)
    .filter((name, index, all) => all.indexOf(name) === index)

const valueOf = ({ phase, name, field }) =>
  unitsOf({ phase }).find((entry) => entry.name === name)?.[field] ?? null

const phaseCategories = ({ phases, hasData }) =>
  phases.map((phase) => ({ label: `P${phase.number}`, empty: !hasData({ phase }) }))

const coverageChart = ({ phases, floorPercent, sourcePath }) => {
  const names = unitOrder({ phases })
  const values = phases.map((phase) =>
    names.map((name) => valueOf({ phase, name, field: 'lines' })),
  )
  const measured = values.filter((row) => row.some((value) => value !== null)).length
  return renderGroupedBars({
    id: 'coverage',
    title: 'Coverage — lines % per workspace unit, per phase',
    description: `Grouped bars, one group per phase, one bar per workspace unit. ${measured} of ${phases.length} phases have a coverage table; the rest are drawn as empty slots labelled "no data". Values: ${phases
      .map(
        (phase, index) =>
          `phase ${phase.number}: ${
            values[index].every((value) => value === null)
              ? 'no data'
              : names
                  .map((name, seriesIndex) => `${name} ${values[index][seriesIndex] ?? 'no data'}`)
                  .join(', ')
          }`,
      )
      .join('; ')}.`,
    footnote: `extracted from ${sourcePath}; the dashed line is the ${floorPercent ?? MISSING}% floor declared in the Definition of Done`,
    categories: phaseCategories({
      phases,
      hasData: ({ phase }) => values[phase.number - 1].some((value) => value !== null),
    }),
    series: names.map((name) => ({ label: name })),
    values,
    maximum: PERCENT_MAX,
    tickCount: PERCENT_TICKS,
    valueSuffix: '%',
    reference:
      floorPercent === null ? undefined : { value: floorPercent, label: `${floorPercent}% floor` },
  })
}

const testsChart = ({ phases, sourcePath }) => {
  const names = unitOrder({ phases })
  const values = phases.map((phase) =>
    names.map((name) => valueOf({ phase, name, field: 'tests' })),
  )
  const maximum = roundUp({
    value: Math.max(
      ...values.map((row) => row.reduce((total, value) => total + (value ?? 0), 0)),
      1,
    ),
    step: TEST_TICK_STEP,
  })
  return renderStackedBars({
    id: 'tests',
    title: 'Tests per phase, stacked by workspace unit',
    description: `Stacked bars, one column per phase. Values: ${phases
      .map(
        (phase, index) =>
          `phase ${phase.number}: ${
            values[index].every((value) => value === null)
              ? 'no data'
              : `${names.map((name, seriesIndex) => `${name} ${values[index][seriesIndex] ?? 'no data'}`).join(', ')}, total ${values[index].reduce((total, value) => total + (value ?? 0), 0)}`
          }`,
      )
      .join('; ')}.`,
    footnote: `extracted from ${sourcePath}`,
    categories: phaseCategories({
      phases,
      hasData: ({ phase }) => values[phase.number - 1].some((value) => value !== null),
    }),
    series: names.map((name) => ({ label: name })),
    values,
    maximum,
    tickCount: TICK_COUNT,
    valueSuffix: '',
  })
}

const lowestLines = ({ phase }) => {
  const withLines = unitsOf({ phase }).filter((entry) => typeof entry.lines === 'number')
  return withLines.length === 0 ? null : Math.min(...withLines.map((entry) => entry.lines))
}

const NUMERIC_COLUMNS = ['Tests', 'Lowest lines %']

const overviewTable = ({ phases }) =>
  [
    '<div class="table-wrap"><table><thead><tr>',
    ['Phase', 'Name', 'Branch', 'Status', 'Report', 'Evidence', ...NUMERIC_COLUMNS]
      .map((cell) => `<th${NUMERIC_COLUMNS.includes(cell) ? ' class="num"' : ''}>${cell}</th>`)
      .join(''),
    '</tr></thead><tbody>',
    phases
      .map((phase) => {
        const lowest = lowestLines({ phase })
        return [
          '<tr>',
          `<th scope="row"><a href="#phase-${phase.number}">${phase.number}</a></th>`,
          `<td><a href="#phase-${phase.number}">${escapeHtml({ value: phase.name })}</a></td>`,
          `<td class="mono">${escapeHtml({ value: phase.branch ?? MISSING })}</td>`,
          `<td><span class="pill pill-${phase.status === 'done' ? 'done' : 'pending'}">${escapeHtml({ value: phase.status })}</span></td>`,
          `<td>${phase.narrative === null ? '<span class="muted">none</span>' : 'yes'}</td>`,
          `<td>${phase.evidence.exists ? `${phase.evidence.files.length} files` : '<span class="muted">none</span>'}</td>`,
          `<td class="num">${phase.evidence.coverage?.total?.tests ?? MISSING}</td>`,
          `<td class="num">${lowest === null ? MISSING : lowest}</td>`,
          '</tr>',
        ].join('')
      })
      .join(''),
    '</tbody></table></div>',
  ].join('')

const phaseCards = ({ phases, isEmpty }) =>
  [
    '<ul class="card-grid">',
    phases
      .map((phase) =>
        [
          `<li class="card${isEmpty({ phase }) ? ' card-empty' : ''}">`,
          `<a href="#phase-${phase.number}">`,
          `<span class="card-num">Phase ${phase.number}</span>`,
          `<span class="card-name">${escapeHtml({ value: phase.name })}</span>`,
          `<span class="card-flag">${isEmpty({ phase }) ? 'no data yet' : `${phase.status} · has data`}</span>`,
          '</a></li>',
        ].join(''),
      )
      .join(''),
    '</ul>',
  ].join('')

const statCard = ({ label, value, source }) =>
  `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${escapeHtml({ value: label })}</div><div class="stat-source">${escapeHtml({ value: source })}</div></div>`

const headlines = ({ model }) =>
  [
    '<div class="stat-row">',
    statCard({
      label: 'phases declared',
      value: String(model.phases.length),
      source: model.paths.plan,
    }),
    statCard({
      label: 'phases with any data',
      value: `${model.populatedCount} <span class="stat-of">of ${model.phases.length}</span>`,
      source: 'branch, evidence or a written report',
    }),
    statCard({
      label: 'coverage floor',
      value: model.coverageFloorPercent === null ? MISSING : `${model.coverageFloorPercent}%`,
      source: 'Definition of Done',
    }),
    statCard({
      label: 'built from commit',
      value: `<span class="mono">${escapeHtml({ value: model.head.shortSha ?? MISSING })}</span>`,
      source: model.head.date === null ? 'unknown date' : model.head.date.slice(0, 10),
    }),
    '</div>',
  ].join('')

export const renderOverviewPane = ({ model }) => {
  const isEmpty = ({ phase }) =>
    phase.narrative === null && !phase.history.exists && !phase.evidence.exists
  return [
    '<section class="pane" id="overview">',
    '<h2>Overview</h2>',
    `<p class="lede">Nine phases, one branch each. This page is generated from the repository: the narrative per phase is hand-written markdown, every number is extracted at build time from a file or from git. ${model.populatedCount} of ${model.phases.length} phases have any data at all; the other ${model.phases.length - model.populatedCount} are declarations and nothing more, and they look it.</p>`,
    headlines({ model }),
    '<h3>How to read this page</h3>',
    renderMarkdown({
      source: [
        '- **One section at a time.** The list on the left is the whole page; picking an entry swaps the panel, it does not scroll you past the other fourteen. It is plain CSS, so it works with JavaScript switched off, and every panel has its own address: `#phase-3` opens phase 3 directly.',
        `- **${model.phases.length - model.populatedCount} of the ${model.phases.length} phases are empty, and are drawn empty.** No branch, no commits, no evidence, no report: their numbers read \`${MISSING}\` and their cards are dashed. Nothing is estimated to fill the gap.`,
        "- **A `pending` status is a measurement, not a mood.** It comes from the phase report's frontmatter, or from the absence of a report. Phase 1's code gate is green and its exit criterion is not met — both facts are on its panel, neither one hidden by the other.",
        '- **Topologies are not drawn by hand.** Each diagram is parsed out of the mermaid source in `docs/02-architecture.md` and laid out as inline SVG by the generator, with that source shown under it so a reader can check the picture against the truth.',
        '- **Charts carry their data.** Every chart has labelled axes, a title, a description a screen reader can read and a data table. A phase with no measurement is an empty slot labelled "no data", never a zero bar.',
      ].join('\n'),
    }),
    '<h3>The nine phases at a glance</h3>',
    overviewTable({ phases: model.phases }),
    `<p class="meta">Status from the phase reports in <code>docs/phases/</code>; the branch column is checked against this repository's refs; commits from <code>git log</code>; tests and coverage from the evidence files on disk.</p>`,
    '<h3>Open a phase</h3>',
    phaseCards({ phases: model.phases, isEmpty }),
    '</section>',
  ].join('')
}

export const renderChartsPane = ({ model, coverageSourcePath }) =>
  [
    '<section class="pane" id="charts">',
    '<h2>Across the phases</h2>',
    '<p class="lede">The two comparisons that only make sense side by side. They live here rather than inside each phase panel: a comparison repeated nine times is nine chances for the same number to disagree with itself.</p>',
    coverageChart({
      phases: model.phases,
      floorPercent: model.coverageFloorPercent,
      sourcePath: coverageSourcePath,
    }),
    testsChart({ phases: model.phases, sourcePath: coverageSourcePath }),
    '</section>',
  ].join('')
