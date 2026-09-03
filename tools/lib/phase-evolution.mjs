import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parsePhaseNarrative } from '../docs/narrative.mjs'
import { parseArchitecture, parseDecisionLog, parsePlan } from '../docs/parse-docs.mjs'
import { joinWrapped, splitTableRow } from '../docs/text.mjs'

/**
 * The evolution of the problem and of the solution, phase by phase, taken from the
 * documents that declare them. Reads the repo and returns data: renders nothing,
 * prints nothing, writes nothing, and never reads the clock or git.
 *
 * Every string returned is copied from a repo file, or assembled mechanically out of
 * cells of one of its tables. A field the documents do not state comes back as '' —
 * an empty field is a true statement about the repo, and a plausible sentence written
 * here would not be checkable against anything.
 */

const DOCS = {
  prd: 'docs/01-prd.md',
  architecture: 'docs/02-architecture.md',
  plan: 'docs/04-implementation-plan.md',
  decisions: 'docs/05-decision-log.md',
}

const narrativePathOf = ({ number }) => `docs/phases/phase-${number}.md`

const readOptional = async ({ repoRoot, relative }) => {
  try {
    return await readFile(join(repoRoot, relative), 'utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Markdown, read as blocks rather than rendered
// ---------------------------------------------------------------------------

/** A section ends at the next heading of its own level or shallower. */
const sectionBody = ({ source, heading }) => {
  if (source === null) return ''
  const level = heading.match(/^#+/)[0].length
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const boundary = new RegExp(`^#{1,${level}} `)
  const end = rest.findIndex((line) => boundary.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

// A bullet, a table row, a quote or a numbered item — not a paragraph that merely
// opens in bold, which is why the list markers require the space that follows them.
const BLOCK_IS_STRUCTURED = /^\s*([-*]\s|[>|]|\d+\.\s)/

// Soft line wraps are joined back into one line; a block that carries its own
// structure (list, table, quote) keeps its line breaks, because joining those
// would put a bullet or a pipe in the middle of a sentence.
const unwrap = ({ block }) =>
  block.split('\n').some((line) => BLOCK_IS_STRUCTURED.test(line))
    ? block.trim()
    : joinWrapped({ lines: block.split('\n') })

const prose = ({ body }) =>
  body
    .split(/\n{2,}/)
    .map((block) => unwrap({ block }))
    .filter((block) => block !== '')
    .join('\n\n')

const paragraphContaining = ({ source, marker }) => {
  if (source === null) return ''
  const block = source.split(/\n{2,}/).find((candidate) => candidate.includes(marker))
  return block === undefined ? '' : unwrap({ block })
}

const BULLET = /^\s*[-*]\s+/

/** One list item — its first line plus the wrapped continuation lines under it. */
const bulletContaining = ({ source, marker }) => {
  if (source === null) return ''
  const lines = source.split('\n')
  const start = lines.findIndex((line) => BULLET.test(line) && line.includes(marker))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.trim() === '' || BULLET.test(line))
  const continuation = end === -1 ? rest : rest.slice(0, end)
  return joinWrapped({ lines: [lines[start].replace(BULLET, ''), ...continuation] })
}

const isSeparatorRow = ({ line }) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

/** Data rows of the first table in a block, header row dropped. */
const tableRows = ({ body }) =>
  body
    .split('\n')
    .filter((line) => line.includes('|') && !isSeparatorRow({ line }))
    .map((row) => splitTableRow({ row }))
    .slice(1)

const rowStartingWith = ({ rows, first }) => rows.find((row) => row[0] === first) ?? null

const cell = ({ row, index }) => (row === null ? '' : joinWrapped({ lines: [row[index] ?? ''] }))

// ---------------------------------------------------------------------------
// The documents' own vocabulary
// ---------------------------------------------------------------------------

const COMMUNICATION_SECTION = '## 5. Communication evolution'
const AWS_MAPPING_SECTION = '## 8. AWS mapping — the point of the lab'
const PHASE_RISKS_HEADING = '### Phase risks'
const RISKS_PARAGRAPH = /^Risks:\s*/

const WHY_IT_CHANGES_COLUMN = 2
const AWS_EQUIVALENT_COLUMN = 1
const LESSON_COLUMN = 2

const communicationRow = ({ architecture, first }) =>
  rowStartingWith({
    rows: tableRows({
      body: sectionBody({ source: architecture, heading: COMMUNICATION_SECTION }),
    }),
    first,
  })

const decisionMatching = ({ decisions, marker }) =>
  decisions.find((decision) => decision.title.includes(marker)) ?? null

const decisionField = ({ decision, label }) => {
  const found = decision?.fields.find((entry) => entry.label === label)
  return found === undefined ? '' : joinWrapped({ lines: found.value.split('\n') })
}

const planPhaseBody = ({ plan, number }) => {
  const start = plan.search(new RegExp(`^## Phase ${number} — `, 'm'))
  if (start === -1) return ''
  const rest = plan.slice(start)
  const end = rest.slice(1).search(/^## /m)
  return end === -1 ? rest : rest.slice(0, end + 1)
}

// ---------------------------------------------------------------------------
// problemNow — what is wrong, or invisible, when the phase starts
// ---------------------------------------------------------------------------

/**
 * No document carries a "the problem entering phase N" heading, so each phase names
 * its own anchor: the sentence, bullet, table cell or labelled field where a document
 * states the deficiency that phase inherits. An anchor that stops matching (because
 * its document was rewritten) yields '' rather than stale prose.
 */
const PROBLEM_NOW = {
  1: ({ docs }) => bulletContaining({ source: docs.architecture, marker: 'CPU-bound traffic' }),
  2: ({ docs }) =>
    bulletContaining({
      source: docs.phaseOneReport,
      marker: 'OTel from day 1, backends per phase',
    }),
  3: ({ docs }) => paragraphContaining({ source: docs.architecture, marker: 'Metrics prove' }),
  // Phase 4 inherits the risk phase 3 accepted knowingly, so the anchor is the row
  // phase 3's own risk table declares and defers ("that's the phase-4/5 lesson").
  4: ({ docs }) => {
    const RISK_DECLARED_BY = 3
    const row = rowStartingWith({
      rows: tableRows({
        body: sectionBody({
          source: planPhaseBody({ plan: docs.plan ?? '', number: RISK_DECLARED_BY }),
          heading: PHASE_RISKS_HEADING,
        }),
      }),
      first: 'Sync HTTP call just moves the bottleneck',
    })
    if (row === null) return ''
    return `${row[0]} — ${row.at(-1)}`
  },
  5: ({ docs }) => {
    const row = communicationRow({ architecture: docs.architecture, first: '3–4' })
    if (row === null) return ''
    return `${row[1]} — ${row[WHY_IT_CHANGES_COLUMN]}`
  },
  6: ({ decisions }) =>
    decisionField({
      decision: decisionMatching({ decisions, marker: 'Cross-service data consistency' }),
      label: 'The problem',
    }),
  7: ({ docs }) =>
    cell({
      row: communicationRow({ architecture: docs.architecture, first: '7+' }),
      index: WHY_IT_CHANGES_COLUMN,
    }),
  8: ({ docs }) =>
    cell({
      row: communicationRow({ architecture: docs.architecture, first: '8+' }),
      index: WHY_IT_CHANGES_COLUMN,
    }),
  9: ({ decisions }) =>
    decisionField({
      decision: decisionMatching({ decisions, marker: 'Sessions: JWT' }),
      label: 'Why',
    }),
}

const problemNowOf = ({ number, docs, decisions }) => {
  const anchor = PROBLEM_NOW[number]
  return anchor === undefined ? '' : anchor({ docs, decisions })
}

// ---------------------------------------------------------------------------
// cost, discarded, lesson
// ---------------------------------------------------------------------------

const risksOf = ({ body }) => {
  const table = sectionBody({ source: body, heading: PHASE_RISKS_HEADING })
  if (table !== '') {
    return tableRows({ body: table })
      .map((row) => row[0])
      .filter((risk) => risk !== '')
      .join('; ')
  }
  const paragraph = body.split(/\n{2,}/).find((block) => RISKS_PARAGRAPH.test(block.trim()))
  if (paragraph === undefined) return ''
  return unwrap({ block: paragraph }).replace(RISKS_PARAGRAPH, '')
}

// docs/05 orders its entries "by when they bind: platform first, then per-phase
// choices", and only per-phase entries carry a *(phase N)* tag. An untagged decision
// therefore binds with the platform, which is what phase 1 builds.
const PLATFORM_PHASE = 1

const decisionsFor = ({ decisions, number }) =>
  decisions.filter((decision) => (decision.phaseNumber ?? PLATFORM_PHASE) === number)

const REJECTED_LABELS = ['Alternatives rejected', 'Rejected alternatives']

// A docs/05 heading is written "what was picked — over what it beat", so the heading
// alone already names the alternative. The labelled paragraph is only read for the
// entries whose heading does not, and an entry that rejected nothing is left out.
const rejectedBy = ({ decision }) => {
  if (decision.over !== null) return decision.title
  const rejected = REJECTED_LABELS.map((label) => decisionField({ decision, label })).find(
    (value) => value !== '',
  )
  return rejected === undefined ? '' : `${decision.picked}: ${rejected}`
}

const costOf = ({ body, decisions }) =>
  [
    risksOf({ body }),
    ...decisions
      .filter((decision) => decision.phaseNumber !== null)
      .map((decision) => decisionField({ decision, label: 'Trade-off accepted' })),
  ]
    .filter((part) => part !== '')
    .join(' · ')

const discardedOf = ({ decisions }) =>
  decisions
    .map((decision) => rejectedBy({ decision }))
    .filter((entry) => entry !== '')
    .join('; ')

/**
 * The AWS-mapping table in docs/02 §8 is keyed by tool, not by phase. Three rows name
 * their phase in the tool cell and are read from there; the rest are mapped here, each
 * from the document that says when the tool arrives. A tool no rule covers is left
 * unmapped, and its phase gets no lesson rather than a guessed one.
 */
const LESSON_PHASE_BY_TOOL = {
  'OTel SDK': 1, // §2 rule 5: every service is born instrumented
  MailHog: 1, // §3 phase 1: MailHog catches OTP emails
  'Postgres containers': 1, // §3 phase 1: one Postgres
  'Prometheus + Grafana': 2, // §6 table: metrics, from phase 2
  Jaeger: 3, // §6 table: traces, from phase 3
  'k3d cluster': 4, // §7: Kubernetes topology (phase 4+)
  'HPA + metrics-server': 4, // §7: metrics-server feeds the HPA
  'Redis cache': 8, // §3 phase 8: Redis sits in front of processing
}

const TOOL_PHASE_TAG = /\(phase (\d+)\)/

const lessonPhaseOf = ({ tool }) => {
  const tagged = tool.match(TOOL_PHASE_TAG)
  if (tagged !== null) return Number(tagged[1])
  return LESSON_PHASE_BY_TOOL[tool] ?? null
}

const lessonsOf = ({ architecture, number }) =>
  tableRows({ body: sectionBody({ source: architecture, heading: AWS_MAPPING_SECTION }) })
    .filter((row) => lessonPhaseOf({ tool: row[0] }) === number)
    .map((row) => `${row[0]} → ${row[AWS_EQUIVALENT_COLUMN]}: ${row[LESSON_COLUMN]}`)
    .join('; ')

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const IDEA_SECTIONS = { problemStatement: '## Problem', hypothesis: '## Hypothesis' }

const ideaOf = ({ prd }) => ({
  hypothesis: prose({ body: sectionBody({ source: prd, heading: IDEA_SECTIONS.hypothesis }) }),
  problemStatement: prose({
    body: sectionBody({ source: prd, heading: IDEA_SECTIONS.problemStatement }),
  }),
})

const PENDING = 'pending'

// docs/phases/README.md: a phase with no narrative file is read as pending. A file
// that breaks the report contract is read the same way — `done` is a claim the
// contract only lets a legible report make.
const narrativeOf = async ({ repoRoot, phase }) => {
  const relative = narrativePathOf({ number: phase.number })
  const source = await readOptional({ repoRoot, relative })
  if (source === null) return { narrativePath: '', status: PENDING }
  const parsed = parsePhaseNarrative({ source, path: relative, expected: phase })
  if (parsed.errors !== undefined) return { narrativePath: relative, status: PENDING }
  return { narrativePath: relative, status: parsed.frontmatter.status }
}

const oneLine = ({ value }) => (value === null ? '' : joinWrapped({ lines: value.split('\n') }))

const phaseEntry = ({ phase, docs, architecture, decisions, narrative }) => {
  const section = architecture.find((entry) => entry.phaseNumber === phase.number)
  const own = decisionsFor({ decisions, number: phase.number })
  return {
    number: phase.number,
    name: phase.name,
    branch: phase.branch ?? '',
    status: narrative.status,
    problemNow: problemNowOf({ number: phase.number, docs, decisions }),
    whatChanged: section === undefined ? '' : prose({ body: section.prose }),
    topologyMermaid: section?.diagrams[0] ?? '',
    bought: oneLine({ value: phase.goal }),
    cost: costOf({
      body: planPhaseBody({ plan: docs.plan ?? '', number: phase.number }),
      decisions: own,
    }),
    discarded: discardedOf({ decisions: own }),
    exitCriterion: oneLine({ value: phase.exitCriterion }),
    lesson: lessonsOf({ architecture: docs.architecture, number: phase.number }),
    narrativePath: narrative.narrativePath,
  }
}

export const collectPhaseEvolution = async ({ repoRoot }) => {
  const entries = await Promise.all(
    Object.entries(DOCS).map(async ([key, relative]) => [
      key,
      await readOptional({ repoRoot, relative }),
    ]),
  )
  const docs = Object.fromEntries(entries)
  const plan = parsePlan({ source: docs.plan ?? '' })
  const architecture = parseArchitecture({ source: docs.architecture ?? '' })
  const decisions = parseDecisionLog({ source: docs.decisions ?? '' })
  const narratives = await Promise.all(plan.phases.map((phase) => narrativeOf({ repoRoot, phase })))
  const withReport = {
    ...docs,
    phaseOneReport: await readOptional({
      repoRoot,
      relative: narrativePathOf({ number: PLATFORM_PHASE }),
    }),
  }
  return {
    idea: ideaOf({ prd: docs.prd }),
    phases: plan.phases.map((phase, index) =>
      phaseEntry({
        phase,
        docs: withReport,
        architecture,
        decisions,
        narrative: narratives[index],
      }),
    ),
  }
}
