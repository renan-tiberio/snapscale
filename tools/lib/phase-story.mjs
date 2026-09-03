import { renderDiagram } from '../docs/diagram.mjs'
import { renderInline, renderMarkdown } from '../docs/markdown.mjs'
import { escapeHtml } from '../docs/text.mjs'

import { evidenceLinks, STATE_PILL, STATE_WORD } from './measurement-labels.mjs'

/**
 * One phase told as a problem and a solution, from `collectPhaseEvolution`.
 *
 * The order is the story rather than the schema: what is wrong when the phase
 * starts, what changed, what that bought, what it cost, what was thrown away, how
 * it will be proved, what it teaches.
 *
 * Around that runs the thread. A phase's problem is the residue the phase before
 * it left behind, so every pane opens on what its predecessor bought and the risks
 * that purchase left standing, and closes on the exact sentence its successor opens
 * with — the handover is quoted twice, from both sides, because two independent
 * cards do not show evolution.
 *
 * A field the documents never stated renders as a dashed note naming the document
 * that would have carried it. Not one sentence here is written into a blank field:
 * a phase whose cost nobody wrote down is itself a finding.
 */

const EXIT_CRITERION_KEY = 'exit-criterion'
const MEASURABLE_STATES = ['measured', 'declared']

// A phase pane titles its story sections with h3, so a heading inside a quoted
// field starts two levels below them instead of competing with them.
const FIELD_HEADING_LEVEL = 5

const emptyField = ({ text }) => `<p class="empty-note">${escapeHtml({ value: text })}</p>`

const sourceTag = ({ source }) => `<span class="muted">· ${escapeHtml({ value: source })}</span>`

const missingStory = () =>
  emptyField({
    text: 'No phase-evolution entry resolved for this phase, so nothing is told here rather than guessed.',
  })

/** The field verbatim, or a note saying which document failed to state it. */
const storySection = ({ number, key, title, source, value, empty, extra = '' }) =>
  [
    `<h3 id="phase-${number}-${key}">${escapeHtml({ value: title })} ${sourceTag({ source })}</h3>`,
    value === ''
      ? emptyField({ text: empty })
      : renderMarkdown({ source: value, minHeadingLevel: FIELD_HEADING_LEVEL }),
    extra,
  ].join('')

// ---------------------------------------------------------------------------
// The thread: where this phase sits, and the two handovers
// ---------------------------------------------------------------------------

const EMPTY_IDEA = { hypothesis: '', problemStatement: '' }

/**
 * One chapter of the thread: this phase's entry and both its neighbours. A pane
 * cannot show a handover from one side only, and a phase the extractor never
 * returned yields nulls rather than a neighbour's text standing in for it.
 */
export const storyChapterOf = ({ evolution, number }) => {
  if (evolution === null) {
    return { story: null, previous: null, next: null, phases: [], idea: EMPTY_IDEA }
  }
  const index = evolution.phases.findIndex((entry) => entry.number === number)
  const found = index === -1 ? null : evolution.phases[index]
  return {
    story: found,
    previous: found === null ? null : (evolution.phases[index - 1] ?? null),
    next: found === null ? null : (evolution.phases[index + 1] ?? null),
    phases: evolution.phases,
    idea: evolution.idea,
  }
}

// The nine phases are a sequence, so the one being read is marked
// aria-current="step" rather than "page": the pane nav already owns "page", and a
// screen reader announcing "step" is what tells a reader where in the chain they are.
const threadStep = ({ entry, current }) => {
  const here = entry.number === current
  return [
    `<li${here ? ' class="here"' : ''}>`,
    `<a class="chip" href="#phase-${entry.number}"${here ? ' aria-current="step"' : ''}>`,
    `<span class="thread-num">P${entry.number}</span> ${escapeHtml({ value: entry.name })}`,
    '</a></li>',
  ].join('')
}

const thread = ({ phases, current }) =>
  [
    `<ol class="thread" aria-label="The ${phases.length} phases in order">`,
    phases.map((entry) => threadStep({ entry, current })).join(''),
    '</ol>',
  ].join('')

const handLine = ({ label, value, empty }) =>
  value === ''
    ? emptyField({ text: empty })
    : `<p class="hand-line"><span class="hand-k">${escapeHtml({ value: label })}</span> ${renderInline({ source: value })}</p>`

// Phase 1 has no predecessor, so what it inherits is the lab's own starting
// position: the problem the PRD states and the hypothesis it bets on.
const openingIdea = ({ idea, paths }) =>
  [
    '<aside class="handover hand-in">',
    `<p class="hand-head">Before phase 1 ${sourceTag({ source: paths.prd })}</p>`,
    handLine({
      label: 'the problem',
      value: idea.problemStatement,
      empty: `No "## Problem" section in ${paths.prd}.`,
    }),
    handLine({
      label: 'the hypothesis',
      value: idea.hypothesis,
      empty: `No "## Hypothesis" section in ${paths.prd}.`,
    }),
    '</aside>',
  ].join('')

const handoverIn = ({ previous, paths }) =>
  [
    '<aside class="handover hand-in">',
    `<p class="hand-head">Coming in from <a href="#phase-${previous.number}">Phase ${previous.number} — ${escapeHtml({ value: previous.name })}</a></p>`,
    handLine({
      label: `phase ${previous.number} bought`,
      value: previous.bought,
      empty: `No "Goal" field for phase ${previous.number} in ${paths.plan}.`,
    }),
    handLine({
      label: 'and left these risks and trade-offs standing',
      value: previous.cost,
      empty: `Phase ${previous.number} declares no risk in ${paths.plan} and no accepted trade-off in ${paths.decisions}.`,
    }),
    '</aside>',
  ].join('')

const handoverOut = ({ story, next, paths }) => {
  if (next === null) {
    return emptyField({
      text: `Phase ${story.number} is the last phase declared in ${paths.plan}; nothing follows it.`,
    })
  }
  return [
    '<aside class="handover hand-out">',
    `<p class="hand-head">Leaving into <a href="#phase-${next.number}">Phase ${next.number} — ${escapeHtml({ value: next.name })}</a></p>`,
    handLine({
      label: 'the problem it opens on',
      value: next.problemNow,
      empty: `No document states the problem entering phase ${next.number}.`,
    }),
    '</aside>',
  ].join('')
}

// ---------------------------------------------------------------------------
// The measurement: the exit criterion, and its state in the lab trajectory
// ---------------------------------------------------------------------------

const pointFor = ({ metrics, key, number }) => {
  if (metrics === null) return null
  const entry = metrics.trajectory.find((candidate) => candidate.key === key)
  if (entry === undefined) return null
  return entry.points.find((point) => point.phase === number) ?? null
}

const stateLine = ({ point }) =>
  [
    '<p class="hand-line">',
    `<span class="pill ${STATE_PILL[point.state]}">${STATE_WORD[point.state]}</span> `,
    renderInline({ source: point.display }),
    point.evidence === ''
      ? ' <span class="muted">· no evidence file on disk yet</span>'
      : ` · evidence: ${evidenceLinks({ evidence: point.evidence })}`,
    ` · <a href="#traj-${EXIT_CRITERION_KEY}">in the lab trajectory</a>`,
    '</p>',
  ].join('')

/** The other lab questions this same phase is expected to answer. */
const alsoMeasured = ({ metrics, number }) => {
  if (metrics === null) return []
  return metrics.trajectory
    .filter((entry) => entry.key !== EXIT_CRITERION_KEY)
    .map((entry) => ({ entry, point: pointFor({ metrics, key: entry.key, number }) }))
    .filter(({ point }) => point !== null && MEASURABLE_STATES.includes(point.state))
}

const alsoMeasuredRow = ({ entry, point }) =>
  [
    '<li>',
    `<span class="pill ${STATE_PILL[point.state]}">${STATE_WORD[point.state]}</span>`,
    `<a href="#traj-${entry.key}">${renderInline({ source: entry.label })}</a>`,
    `<span class="muted">${renderInline({ source: point.display })}</span>`,
    '</li>',
  ].join('')

const alsoMeasuredList = ({ metrics, number }) => {
  const rows = alsoMeasured({ metrics, number })
  if (rows.length === 0) {
    return emptyField({
      text: `No other question tracked in the lab trajectory is measured or declared for phase ${number}.`,
    })
  }
  return [
    `<ul class="story-q" aria-label="Other lab questions this phase answers, ${rows.length} of them">`,
    rows.map((row) => alsoMeasuredRow(row)).join(''),
    '</ul>',
  ].join('')
}

// ---------------------------------------------------------------------------
// The three blocks a phase pane composes
// ---------------------------------------------------------------------------

export const renderPhaseStory = ({ story, phases, previous, idea, paths }) => {
  if (story === null) return missingStory()
  const topology =
    story.topologyMermaid === ''
      ? emptyField({
          text: `${paths.architecture} describes this phase in prose but carries no mermaid diagram for it, so none is drawn.`,
        })
      : renderDiagram({
          source: story.topologyMermaid,
          sourcePath: paths.architecture,
          id: `p${story.number}-topology`,
          caption: `Phase ${story.number} — ${story.name}`,
        })
  return [
    thread({ phases, current: story.number }),
    previous === null ? openingIdea({ idea, paths }) : handoverIn({ previous, paths }),
    storySection({
      number: story.number,
      key: 'problem',
      title: 'The problem now',
      source: 'the repo document that declares it',
      value: story.problemNow,
      empty: `No document in this repository states the problem entering phase ${story.number}, so nothing is quoted here.`,
    }),
    storySection({
      number: story.number,
      key: 'changed',
      title: 'What changed',
      source: paths.architecture,
      value: story.whatChanged,
      empty: `No "Phase ${story.number}" section in ${paths.architecture}.`,
      extra: topology,
    }),
    storySection({
      number: story.number,
      key: 'bought',
      title: 'What it bought',
      source: paths.plan,
      value: story.bought,
      empty: `No "Goal" field in the phase ${story.number} section of ${paths.plan}.`,
    }),
    storySection({
      number: story.number,
      key: 'cost',
      title: 'What it cost',
      source: `${paths.plan} · ${paths.decisions}`,
      value: story.cost,
      empty: `No "Phase risks" table for phase ${story.number} in ${paths.plan}, and no decision bound to it records a trade-off accepted in ${paths.decisions}.`,
    }),
    storySection({
      number: story.number,
      key: 'discarded',
      title: 'What was discarded',
      source: paths.decisions,
      value: story.discarded,
      empty: `Nothing recorded: no decision in ${paths.decisions} bound to phase ${story.number} names an alternative it was chosen over.`,
    }),
  ].join('')
}

export const renderPhaseMeasurement = ({ story, metrics, paths }) => {
  if (story === null) return missingStory()
  const point = pointFor({ metrics, key: EXIT_CRITERION_KEY, number: story.number })
  return [
    storySection({
      number: story.number,
      key: 'measurement',
      title: 'The measurement',
      source: paths.plan,
      value: story.exitCriterion,
      empty: `No "Exit criterion" field in the phase ${story.number} section of ${paths.plan}.`,
    }),
    point === null
      ? emptyField({
          text: `The lab trajectory carries no exit-criterion slot for phase ${story.number}, so its state is not stated here.`,
        })
      : stateLine({ point }),
    alsoMeasuredList({ metrics, number: story.number }),
  ].join('')
}

export const renderPhaseClosing = ({ story, next, paths }) => {
  if (story === null) return missingStory()
  return [
    storySection({
      number: story.number,
      key: 'lesson',
      title: 'The lesson',
      source: paths.architecture,
      value: story.lesson,
      empty: `Nothing recorded: no row of the AWS-mapping table in ${paths.architecture} is mapped to phase ${story.number}.`,
    }),
    handoverOut({ story, next, paths }),
  ].join('')
}
