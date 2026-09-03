import { renderInline } from '../docs/markdown.mjs'
import { escapeHtml, round } from '../docs/text.mjs'

import { evidenceLinks, STATE_PILL, STATE_WORD } from './measurement-labels.mjs'

// The opening pane: what this lab set out to measure, and how much of it has been
// measured. It renders `collectLabMetrics` output and nothing else.
//
// Why strips of slots and not plots: five of the seven questions have zero
// measured points today. A line through one dot and eight gaps would draw a
// trend that does not exist, so nothing here joins two slots — each phase is an
// independent slot stating its own condition, and a measured value stands alone.
// Every slot that is not measured carries the method that would fill it, quoted
// from the phase documents, because an empty slot showing its method is a
// roadmap while an empty slot showing nothing is a page that looks broken.

const MISSING = '—'
const BOOLEAN_UNIT = 'boolean'

const STATES = { measured: 'measured', declared: 'declared', notApplicable: 'not-applicable' }
const STATE_CLASS = { measured: 'tj-m', declared: 'tj-d', 'not-applicable': 'tj-n' }
const SCORE_PILL = { met: 'pill-done', partial: 'pill-pending', pending: 'pill-open' }

// Strip geometry. One row of slots, no axis: there is no scale to share between
// a boolean, a percentage and a pod count, so each slot is a state, not a height.
const STRIP_WIDTH = 780
const STRIP_HEIGHT = 72
const SLOT_GAP = 7
const BOX_TOP = 17
const BOX_HEIGHT = 46
const BOX_RADIUS = 5
const PHASE_LABEL_BASELINE = 11
const STATE_BASELINE_ALONE = 28
const STATE_BASELINE_STACKED = 19
const VALUE_BASELINE = 36

/** Backticks and asterisks are markup in HTML and literal glyphs in SVG text. */
const plainText = ({ value }) => value.replace(/[`*]/g, '')

const countOf = ({ points, state }) => points.filter((point) => point.state === state).length

const slotGeometry = ({ index, count }) => {
  const slot = STRIP_WIDTH / count
  const x = slot * index + SLOT_GAP / 2
  const width = slot - SLOT_GAP
  return {
    x: round({ value: x }),
    width: round({ value: width }),
    middle: round({ value: x + width / 2 }),
  }
}

// A boolean has no magnitude, so the word in the slot is the whole reading; only
// a real number gets a second line, and only where one was actually measured.
const slotValueText = ({ point, unit }) => {
  if (point.state !== STATES.measured) return ''
  return unit === BOOLEAN_UNIT || point.value === null ? '' : String(point.value)
}

const slot = ({ point, index, count, unit }) => {
  const geometry = slotGeometry({ index, count })
  const value = slotValueText({ point, unit })
  const stateBaseline = BOX_TOP + (value === '' ? STATE_BASELINE_ALONE : STATE_BASELINE_STACKED)
  const stateClass = STATE_CLASS[point.state]
  return [
    '<g>',
    `<title>Phase ${point.phase}: ${escapeHtml({ value: plainText({ value: point.display }) })}</title>`,
    `<text class="tj-phase" x="${geometry.middle}" y="${PHASE_LABEL_BASELINE}" text-anchor="middle">P${point.phase}</text>`,
    `<rect class="tj-box ${stateClass}" x="${geometry.x}" y="${BOX_TOP}" width="${geometry.width}" height="${BOX_HEIGHT}" rx="${BOX_RADIUS}"/>`,
    `<text class="tj-state ${stateClass}" x="${geometry.middle}" y="${stateBaseline}" text-anchor="middle">${STATE_WORD[point.state]}</text>`,
    value === ''
      ? ''
      : `<text class="tj-value" x="${geometry.middle}" y="${BOX_TOP + VALUE_BASELINE}" text-anchor="middle">${escapeHtml({ value })}</text>`,
    '</g>',
  ].join('')
}

const stripDescription = ({ entry }) =>
  [
    `${plainText({ value: entry.label })}, measured in ${entry.unit}.`,
    `${entry.points.length} slots, one per phase, with no line between them:`,
    entry.points
      .map((point) => `phase ${point.phase} ${plainText({ value: point.display })}`)
      .join('; '),
    '.',
  ].join(' ')

const strip = ({ entry }) =>
  [
    `<svg role="img" aria-labelledby="tj-title-${entry.key}" aria-describedby="tj-desc-${entry.key}" viewBox="0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}" width="${STRIP_WIDTH}" height="${STRIP_HEIGHT}">`,
    `<title id="tj-title-${entry.key}">${escapeHtml({ value: plainText({ value: entry.label }) })} — one slot per phase, phases 1 to ${entry.points.length}</title>`,
    `<desc id="tj-desc-${entry.key}">${escapeHtml({ value: stripDescription({ entry }) })}</desc>`,
    entry.points
      .map((point, index) => slot({ point, index, count: entry.points.length, unit: entry.unit }))
      .join(''),
    '</svg>',
  ].join('')

const phaseRangeText = ({ numbers }) => {
  if (numbers.length === 1) return `Phase ${numbers[0]}`
  const contiguous = numbers.at(-1) - numbers[0] === numbers.length - 1
  if (contiguous) return `Phases ${numbers[0]}–${numbers.at(-1)}`
  return `Phases ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`
}

/** Phases whose declared method is the same sentence are one row, not eight copies. */
const groupByMethod = ({ points }) =>
  points.reduce((groups, point) => {
    const existing = groups.find((group) => group.method === point.method)
    if (existing === undefined) return [...groups, { method: point.method, numbers: [point.phase] }]
    return groups.map((group) =>
      group === existing ? { ...group, numbers: [...group.numbers, point.phase] } : group,
    )
  }, [])

const measuredRow = ({ point }) =>
  [
    '<li class="is-measured">',
    `<p class="tj-when"><span class="pill pill-done">measured</span> Phase ${point.phase}</p>`,
    `<p class="tj-read">${renderInline({ source: point.display })}</p>`,
    `<p class="tj-how"><span class="tj-k">How it was measured</span> ${renderInline({ source: point.method })}</p>`,
    point.evidence === ''
      ? ''
      : `<p class="tj-when">evidence: ${evidenceLinks({ evidence: point.evidence })}</p>`,
    '</li>',
  ].join('')

const declaredRow = ({ group }) =>
  [
    '<li class="is-declared">',
    `<p class="tj-when"><span class="pill pill-pending">declared</span> ${phaseRangeText({ numbers: group.numbers })} · never measured</p>`,
    `<p class="tj-how"><span class="tj-k">How it will be measured</span> ${renderInline({ source: group.method })}</p>`,
    '</li>',
  ].join('')

const planList = ({ entry }) => {
  const measured = entry.points.filter((point) => point.state === STATES.measured)
  const declared = groupByMethod({
    points: entry.points.filter((point) => point.state === STATES.declared),
  })
  return [
    '<ul class="tj-plan">',
    measured.map((point) => measuredRow({ point })).join(''),
    declared.map((group) => declaredRow({ group })).join(''),
    '</ul>',
  ].join('')
}

const pointRow = ({ point }) =>
  [
    `<tr><th scope="row">Phase ${point.phase}</th>`,
    `<td><span class="pill ${STATE_PILL[point.state]}">${STATE_WORD[point.state]}</span></td>`,
    `<td>${renderInline({ source: point.display })}</td>`,
    `<td>${renderInline({ source: point.method })}</td>`,
    `<td>${point.evidence === '' ? `<span class="muted">${MISSING}</span>` : evidenceLinks({ evidence: point.evidence })}</td></tr>`,
  ].join('')

const pointTable = ({ entry }) =>
  [
    '<details class="src"><summary>All nine phases, with the reason each unmeasured slot is empty (text alternative)</summary>',
    '<div class="table-wrap"><table><thead><tr><th>Phase</th><th>State</th><th>Reading</th><th>Method, or why not applicable</th><th>Evidence</th></tr></thead><tbody>',
    entry.points.map((point) => pointRow({ point })).join(''),
    '</tbody></table></div></details>',
  ].join('')

const trajectoryFigure = ({ entry }) => {
  const notApplicable = countOf({ points: entry.points, state: STATES.notApplicable })
  return [
    `<figure class="traj" id="traj-${entry.key}">`,
    '<div class="traj-head">',
    `<span class="traj-name">${renderInline({ source: entry.label })}</span>`,
    `<span class="traj-count">${escapeHtml({ value: entry.unit })} · ${countOf({ points: entry.points, state: STATES.measured })} measured · ${countOf({ points: entry.points, state: STATES.declared })} declared · ${notApplicable} not applicable</span>`,
    '</div>',
    `<p class="traj-q">${renderInline({ source: entry.question })}</p>`,
    strip({ entry }),
    notApplicable === 0
      ? ''
      : `<p class="tj-na-note">${notApplicable} slots are marked n/a: those phases declare no measurement of this question. The table below quotes what each of them declares instead.</p>`,
    planList({ entry }),
    pointTable({ entry }),
    '</figure>',
  ].join('')
}

const scoreCard = ({ metric }) =>
  [
    '<li>',
    '<div class="score-head">',
    `<span class="score-name">${renderInline({ source: metric.metric })}</span>`,
    `<span class="pill ${SCORE_PILL[metric.state] ?? 'pill-open'}">${escapeHtml({ value: metric.state })}</span>`,
    '</div>',
    '<dl class="kv">',
    `<dt>target</dt><dd>${renderInline({ source: metric.target })}</dd>`,
    `<dt>today</dt><dd>${renderInline({ source: metric.display })}</dd>`,
    `<dt>method</dt><dd>${renderInline({ source: metric.method })}</dd>`,
    `<dt>evidence</dt><dd>${metric.evidence === '' ? '<span class="muted">none on disk yet</span>' : evidenceLinks({ evidence: metric.evidence })}</dd>`,
    '</dl>',
    '</li>',
  ].join('')

const tallyOf = ({ trajectory }) => {
  const points = trajectory.flatMap((entry) => entry.points)
  return {
    questions: trajectory.length,
    slots: points.length,
    measured: countOf({ points, state: STATES.measured }),
    declared: countOf({ points, state: STATES.declared }),
    notApplicable: countOf({ points, state: STATES.notApplicable }),
  }
}

const tallyList = ({ tally }) =>
  [
    '<ul class="tj-tally">',
    `<li><span class="tj-n">${tally.questions}</span> questions tracked</li>`,
    `<li><span class="tj-n">${tally.measured}</span> slots measured</li>`,
    `<li><span class="tj-n">${tally.declared}</span> declared, method known</li>`,
    `<li><span class="tj-n">${tally.notApplicable}</span> not applicable to that phase</li>`,
    '</ul>',
  ].join('')

export const trajectoryTallyOf = ({ metrics }) =>
  metrics === null ? null : tallyOf({ trajectory: metrics.trajectory })

export const renderTrajectoryPane = ({ metrics, paths }) => {
  if (metrics === null) {
    return [
      '<section class="pane" id="trajectory">',
      '<h2>The lab trajectory</h2>',
      '<p class="empty-note">The measurement frame could not be read, so nothing is shown here. No figure on this page is filled in from memory.</p>',
      '</section>',
    ].join('')
  }
  const tally = tallyOf({ trajectory: metrics.trajectory })
  return [
    '<section class="pane" id="trajectory">',
    '<h2>The lab trajectory</h2>',
    `<p class="lede">The problem this lab measures, and how much of it has actually been measured. ${tally.questions} questions across ${metrics.trajectory[0]?.points.length ?? 0} phases make ${tally.slots} slots: ${tally.measured} carry a measurement taken from an evidence file on disk, ${tally.declared} are declared with the method that will fill them, and ${tally.notApplicable} belong to phases that declare no measurement of that question. Nothing is projected — no slot is inferred from its neighbours and no line is drawn between two slots.</p>`,
    tallyList({ tally }),
    '<h3>The five success metrics</h3>',
    `<p class="traj-q">Copied verbatim from the Success Metrics table of <code>${escapeHtml({ value: paths.prd })}</code>. The state of each is decided only by files under <code>docs/evidence/</code>: a target with no evidence behind it stays pending however plausible it is.</p>`,
    metrics.successMetrics.length === 0
      ? '<p class="empty-note">No Success Metrics table could be read, so no metric is listed.</p>'
      : `<ul class="score">${metrics.successMetrics.map((metric) => scoreCard({ metric })).join('')}</ul>`,
    `<h3>${tally.questions} questions, one slot per phase</h3>`,
    `<p class="traj-q">Each strip below has one slot per phase and no line between them. A solid slot was measured and shows its value; a dashed slot is declared for that phase, and the method that will fill it is quoted underneath; a faint dotted slot is a phase whose own exit criterion measures something else. Methods come from <code>${escapeHtml({ value: paths.plan })}</code>, readings from <code>${escapeHtml({ value: paths.coverageEvidence })}</code> and its siblings.</p>`,
    metrics.trajectory.length === 0
      ? '<p class="empty-note">No trajectory entry resolved against this repository.</p>'
      : metrics.trajectory.map((entry) => trajectoryFigure({ entry })).join(''),
    '</section>',
  ].join('')
}
