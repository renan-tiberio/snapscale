import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { parsePlan } from '../docs/parse-docs.mjs'
import { joinWrapped, splitTableRow } from '../docs/text.mjs'

/**
 * What this lab set out to measure, and how much of it has actually been measured.
 * Reads the repo and returns data: renders nothing, prints nothing, writes nothing,
 * and never reads the clock or git.
 *
 * The measurement frame is declared in two places and copied from them verbatim: the
 * Success Metrics table of the PRD, and the nine per-phase exit criteria of the plan.
 * Whether a measurement *happened* is decided only by files under docs/evidence/ — a
 * target with no evidence behind it stays `pending`, however plausible, and every
 * point still carries the method that would fill it. An empty slot showing its method
 * is a roadmap; an empty slot showing nothing is a bug.
 */

const DOCS = {
  prd: 'docs/01-prd.md',
  plan: 'docs/04-implementation-plan.md',
}
const EVIDENCE_ROOT = 'docs/evidence'

const readOptional = async ({ repoRoot, relative }) => {
  try {
    return await readFile(join(repoRoot, relative), 'utf8')
  } catch {
    return null
  }
}

const listOptional = async ({ repoRoot, relative }) => {
  try {
    return (await readdir(join(repoRoot, relative))).toSorted()
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Markdown tables and numbers
// ---------------------------------------------------------------------------

const stripEmphasis = ({ value }) => value.replace(/\*\*/g, '').trim()

const asNumber = ({ value }) => {
  const match = stripEmphasis({ value }).match(/-?\d+(\.\d+)?/)
  return match === null ? null : Number(match[0])
}

const isSeparatorRow = ({ line }) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

/** The first table under a heading, as a header row plus its data rows. */
const tableAfter = ({ source, heading }) => {
  if (source === null) return null
  const lines = source.split('\n')
  const headingIndex = lines.findIndex((line) => heading.test(line))
  if (headingIndex === -1) return null
  const start = lines.findIndex(
    (line, index) =>
      index > headingIndex &&
      line.includes('|') &&
      isSeparatorRow({ line: lines[index + 1] ?? '' }),
  )
  if (start === -1) return null
  const rest = lines.slice(start)
  const endOffset = rest.findIndex((line) => !line.includes('|'))
  const rows = (endOffset === -1 ? rest : rest.slice(0, endOffset))
    .filter((line) => !isSeparatorRow({ line }))
    .map((row) => splitTableRow({ row }).map((value) => stripEmphasis({ value })))
  return { header: rows[0] ?? [], rows: rows.slice(1) }
}

/** A list item plus the wrapped lines indented under it. */
const bulletContaining = ({ source, marker }) => {
  if (source === null) return ''
  const lines = source.split('\n')
  const start = lines.findIndex((line) => /^\s*[-*]\s/.test(line) && line.includes(marker))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.trim() === '' || /^\s*[-*]\s/.test(line))
  const continuation = end === -1 ? rest : rest.slice(0, end)
  return joinWrapped({
    lines: [lines[start].replace(/^\s*[-*]\s+(\[[ x]\]\s+)?/, ''), ...continuation],
  })
}

const oneLine = ({ value }) => (value === null ? '' : joinWrapped({ lines: value.split('\n') }))

// ---------------------------------------------------------------------------
// Evidence actually on disk
// ---------------------------------------------------------------------------

const COVERAGE_FILE = 'coverage-summary.md'
const VERIFICATION_FILE = 'verification.md'
const COVERAGE_TOTALS_HEADING = /^##+\s+Totals/
const JOURNEY_RESULT = /(\d+) of (\d+) journey tests green/

const coverageOf = ({ source }) => {
  const table = tableAfter({ source, heading: COVERAGE_TOTALS_HEADING })
  if (table === null) return null
  const linesColumn = table.header.findIndex((column) => /lines/i.test(column))
  const testsColumn = table.header.findIndex((column) => /^tests$/i.test(column))
  if (linesColumn === -1) return null
  const isTotalRow = (row) => /total/i.test(row[0] ?? '')
  const packages = table.rows
    .filter((row) => !isTotalRow(row))
    .map((row) => ({ name: row[0], lines: asNumber({ value: row[linesColumn] ?? '' }) }))
    .filter((entry) => entry.lines !== null)
  const totalRow = table.rows.find(isTotalRow)
  return {
    packages,
    tests:
      totalRow === undefined || testsColumn === -1
        ? null
        : asNumber({ value: totalRow[testsColumn] ?? '' }),
  }
}

const readEvidence = async ({ repoRoot, number }) => {
  const directory = `${EVIDENCE_ROOT}/phase-${number}`
  const files = await listOptional({ repoRoot, relative: directory })
  const [coverageSource, verificationSource] = await Promise.all(
    [COVERAGE_FILE, VERIFICATION_FILE].map((name) =>
      files.includes(name)
        ? readOptional({ repoRoot, relative: `${directory}/${name}` })
        : Promise.resolve(null),
    ),
  )
  return {
    number,
    directory,
    files,
    coverage: coverageSource === null ? null : coverageOf({ source: coverageSource }),
    coveragePath: coverageSource === null ? '' : `${directory}/${COVERAGE_FILE}`,
    verificationPath: verificationSource === null ? '' : `${directory}/${VERIFICATION_FILE}`,
    journey: verificationSource === null ? null : verificationSource.match(JOURNEY_RESULT),
  }
}

const hasEvidence = ({ evidence }) => evidence.files.length > 0

const percentRange = ({ values }) => {
  const low = Math.min(...values)
  const high = Math.max(...values)
  return low === high ? `${low}%` : `${low}–${high}%`
}

// Boolean measurements have no magnitude; they record 1 for "demonstrated" so a
// reader of `value` alone never mistakes a demonstrated slot for an empty one.
const DEMONSTRATED = 1

const measureExitCriterion = ({ evidence }) => {
  if (!hasEvidence({ evidence })) return null
  const journey = evidence.journey
  return {
    value: DEMONSTRATED,
    display:
      journey === null
        ? 'demonstrated'
        : `demonstrated — journey ${journey[1]}/${journey[2]} green`,
    evidence: evidence.verificationPath === '' ? evidence.directory : evidence.verificationPath,
  }
}

const measureCoverage = ({ evidence, floorPercent }) => {
  const packages = evidence.coverage?.packages ?? []
  if (packages.length === 0) return null
  const values = packages.map((entry) => entry.lines)
  const tests = evidence.coverage.tests
  const floor = floorPercent === null ? '' : ` (floor ${floorPercent}%)`
  return {
    value: Math.min(...values),
    display: `${percentRange({ values })} lines across ${packages.length} packages${tests === null ? '' : `, ${tests} tests`}${floor}`,
    evidence: evidence.coveragePath,
  }
}

// ---------------------------------------------------------------------------
// The Success Metrics table of the PRD
// ---------------------------------------------------------------------------

const SUCCESS_METRICS_HEADING = /^##\s+Success Metrics\s*$/
const PHASE_REFERENCE = /\bphases?\s+(\d+(?:\s*(?:\/|,|and)\s*\d+)*)/i
const PHASE_TARGET = /(\d+)\s*\/\s*(\d+)\s+phases/

const STATES = { met: 'met', partial: 'partial', pending: 'pending' }

const stateFor = ({ done, total }) => {
  if (total > 0 && done === total) return STATES.met
  return done > 0 ? STATES.partial : STATES.pending
}

const phaseListText = ({ numbers }) => {
  const labelled = numbers.map((number) => String(number))
  if (labelled.length === 1) return `phase ${labelled[0]}`
  return `phases ${labelled.slice(0, -1).join(', ')} and ${labelled.at(-1)}`
}

const phasesNamedIn = ({ text }) => {
  const match = text.match(PHASE_REFERENCE)
  if (match === null) return []
  return match[1]
    .split(/\D+/)
    .filter((part) => part !== '')
    .map((part) => Number(part))
}

/** Rows that name their phases: state follows the evidence of exactly those phases. */
const resolveByNamedPhases = ({ row, evidenceByPhase }) => {
  const named = phasesNamedIn({ text: `${row.method} ${row.target}` })
  if (named.length === 0) {
    return { state: STATES.pending, display: 'not measured', evidence: '' }
  }
  const demonstrated = named.filter((number) =>
    hasEvidence({ evidence: evidenceByPhase.get(number) ?? { files: [] } }),
  )
  const state = stateFor({ done: demonstrated.length, total: named.length })
  if (state === STATES.pending) {
    return {
      state,
      display: `not measured — declared for ${phaseListText({ numbers: named })}`,
      evidence: '',
    }
  }
  return {
    state,
    display: `measured in ${phaseListText({ numbers: demonstrated })} of ${named.length}`,
    evidence: demonstrated.map((number) => evidenceByPhase.get(number).directory).join(', '),
  }
}

/** The "9/9 phases" row: one count of the phases whose evidence folder has files. */
const resolveByPhaseCount = ({ row, phases, evidenceByPhase }) => {
  const target = row.target.match(PHASE_TARGET)
  const total = target === null ? phases.length : Number(target[2])
  const demonstrated = phases
    .map((phase) => evidenceByPhase.get(phase.number))
    .filter((evidence) => evidence !== undefined && hasEvidence({ evidence }))
  return {
    state: stateFor({ done: demonstrated.length, total }),
    display: `${demonstrated.length} of ${total} phases`,
    evidence: demonstrated.map((evidence) => evidence.directory).join(', '),
  }
}

const coverageMeasureFor = ({ evidenceByPhase, phase, floorPercent }) => {
  const evidence = evidenceByPhase.get(phase.number)
  return evidence === undefined ? null : measureCoverage({ evidence, floorPercent })
}

/** The coverage row: the numbers come from the coverage runs recorded as evidence. */
const resolveByCoverage = ({ phases, evidenceByPhase, floorPercent }) => {
  const measured = phases
    .map((phase) => ({
      phase,
      measure: coverageMeasureFor({ evidenceByPhase, phase, floorPercent }),
    }))
    .filter((entry) => entry.measure !== null)
  if (measured.length === 0) {
    return { state: STATES.pending, display: 'not measured', evidence: '' }
  }
  return {
    state: stateFor({ done: measured.length, total: phases.length }),
    display: measured
      .map((entry) => `phase ${entry.phase.number}: ${entry.measure.display}`)
      .join('; '),
    evidence: measured.map((entry) => entry.measure.evidence).join(', '),
  }
}

const SUCCESS_RESOLVERS = [
  { applies: ({ row }) => /coverage/i.test(row.metric), resolve: resolveByCoverage },
  { applies: ({ row }) => PHASE_TARGET.test(row.target), resolve: resolveByPhaseCount },
]

const successMetricsOf = ({ prd, phases, evidenceByPhase, floorPercent }) => {
  const table = tableAfter({ source: prd, heading: SUCCESS_METRICS_HEADING })
  if (table === null) return []
  return table.rows.map((cells) => {
    const row = { metric: cells[0] ?? '', target: cells[1] ?? '', method: cells[2] ?? '' }
    const resolver = SUCCESS_RESOLVERS.find((candidate) => candidate.applies({ row }))
    const resolve = resolver === undefined ? resolveByNamedPhases : resolver.resolve
    return { ...row, ...resolve({ row, phases, evidenceByPhase, floorPercent }) }
  })
}

// ---------------------------------------------------------------------------
// The trajectory: one question the lab answers, tracked across all nine phases
// ---------------------------------------------------------------------------

const POINT_STATES = { measured: 'measured', declared: 'declared', notApplicable: 'not-applicable' }

const ALL_PHASES = 'all'
const DOD_COVERAGE_MARKER = 'Coverage ≥'

/**
 * Each entry is one question, taken from the PRD's Success Metrics or from the phases'
 * own exit criteria — no measurement is invented here. `declaredPhases` lists the
 * phases whose documents declare *this* measurement; a phase outside that list is
 * `not-applicable`, and says why: either the machinery does not exist yet (`arrives`)
 * or the phase declares a different measurement, quoted from its own exit criterion.
 *
 * Single-phase measurements (the phase-6 convergence experiment, the phase-8 cache-hit
 * panel, the phase-9 gateway-only ingress) are not repeated here: they *are* their
 * phase's exit criterion, and the first entry already carries each of those verbatim.
 */
const TRAJECTORY = [
  {
    key: 'exit-criterion',
    label: 'Exit criterion demonstrated',
    question:
      "Was this phase's exit criterion demonstrated with an evidence artifact committed to its branch?",
    unit: 'boolean',
    declaredPhases: ALL_PHASES,
    measure: measureExitCriterion,
  },
  {
    key: 'coverage',
    label: 'Line coverage on every package touched',
    question:
      'Does every app and package this phase touches clear the line-coverage floor, with every test born red?',
    unit: '% lines',
    declaredPhases: ALL_PHASES,
    measure: measureCoverage,
    methodFromDefinitionOfDone: true,
  },
  {
    key: 'culprit-latency',
    label: 'p95 of `/images/process` under load',
    question:
      'Does the p95 latency of `/images/process` visibly degrade every other route under k6 load, and does the dashboard isolate it as the culprit?',
    unit: 'ms (p95)',
    declaredPhases: [2, 3, 8],
    methodOverrides: {
      3: 'before/after latency comparison in `findings.md`, committed to `docs/evidence/phase-3/` (docs/04-implementation-plan.md, phase 3 task 7)',
    },
    arrives:
      'nothing measures latency under load before phase 2: k6 (`k6/baseline.js`, `k6/mixed.js`) and the Prometheus/Grafana pipeline are created there (docs/04-implementation-plan.md phase 2; docs/02-architecture.md §6 — metrics, from phase 2)',
  },
  {
    key: 'blast-radius',
    label: 'Gallery CRUD survives the processor dying',
    question: 'With the processor killed, does gallery CRUD keep working?',
    unit: 'boolean',
    declaredPhases: [3, 7],
    arrives:
      'there is no processor to kill before phase 3: gallery → processor is an in-process function call in phases 1–2 (docs/02-architecture.md §5)',
  },
  {
    key: 'autoscaling',
    label: 'Processor replicas under load',
    question: 'Do processor pods scale 1→N under load and back to 1 after?',
    unit: 'pods',
    declaredPhases: [4, 5],
    arrives:
      'there is no cluster and no replica count before phase 4: the Kubernetes topology starts there (docs/02-architecture.md §7 — "Kubernetes topology (phase 4+)")',
  },
  {
    key: 'cross-service-trace',
    label: 'One trace crossing services',
    question: 'Inside this one request, where did the time go — across services?',
    unit: 'boolean',
    declaredPhases: [3, 9],
    methodOverrides: {
      9: 'full E2E + trace across gateway→api→processor + evidence (docs/04-implementation-plan.md, phase 9 tasks outline)',
    },
    arrives:
      'there is no second service to cross and no trace backend before phase 3: traces land with Jaeger there (docs/02-architecture.md §6 — traces, from phase 3)',
  },
  {
    key: 'queue-backlog',
    label: 'Queue depth under burst',
    question:
      'Do jobs queue up under burst, do workers drain them, and does scaling react to backlog instead of CPU?',
    unit: 'messages (queue depth)',
    declaredPhases: [5, 6, 8],
    methodOverrides: {
      6: 'convergence evidence in Grafana (outbox lag, consumer backlog panels) (docs/04-implementation-plan.md, phase 6 tasks outline)',
    },
    arrives:
      'there is no queue before phase 5: gallery → processor is an in-process call in phases 1–2 and a sync HTTP request in phases 3–4 (docs/02-architecture.md §5)',
  },
]

const declaresPhase = ({ entry, number }) =>
  entry.declaredPhases === ALL_PHASES || entry.declaredPhases.includes(number)

const firstDeclaredPhase = ({ entry, phases }) =>
  entry.declaredPhases === ALL_PHASES ? phases[0]?.number : Math.min(...entry.declaredPhases)

const declaredMethodFor = ({ entry, phase, definitionOfDone }) => {
  const override = entry.methodOverrides?.[phase.number]
  if (override !== undefined) return override
  if (entry.methodFromDefinitionOfDone === true) return definitionOfDone
  return oneLine({ value: phase.exitCriterion })
}

const notApplicableMethodFor = ({ entry, phase, phases }) => {
  if (phase.number < firstDeclaredPhase({ entry, phases })) return entry.arrives ?? ''
  const exitCriterion = oneLine({ value: phase.exitCriterion })
  if (exitCriterion === '') return entry.arrives ?? ''
  return `this phase declares no measurement of it; phase ${phase.number}'s own exit criterion is: ${exitCriterion}`
}

const pointFor = ({ entry, phase, phases, evidenceByPhase, floorPercent, definitionOfDone }) => {
  const evidence = evidenceByPhase.get(phase.number)
  const method = declaresPhase({ entry, number: phase.number })
    ? declaredMethodFor({ entry, phase, definitionOfDone })
    : notApplicableMethodFor({ entry, phase, phases })
  const measured =
    entry.measure === undefined || evidence === undefined
      ? null
      : entry.measure({ evidence, floorPercent })
  if (measured !== null) {
    return {
      phase: phase.number,
      state: POINT_STATES.measured,
      value: measured.value,
      display: measured.display,
      method,
      evidence: measured.evidence,
    }
  }
  const declared = declaresPhase({ entry, number: phase.number })
  return {
    phase: phase.number,
    state: declared ? POINT_STATES.declared : POINT_STATES.notApplicable,
    value: null,
    display: declared ? 'declared — never measured' : 'not applicable',
    method,
    evidence: '',
  }
}

export const collectLabMetrics = async ({ repoRoot }) => {
  const [prd, planSource] = await Promise.all(
    [DOCS.prd, DOCS.plan].map((relative) => readOptional({ repoRoot, relative })),
  )
  const plan = parsePlan({ source: planSource ?? '' })
  const phases = plan.phases
  const evidence = await Promise.all(
    phases.map((phase) => readEvidence({ repoRoot, number: phase.number })),
  )
  const evidenceByPhase = new Map(evidence.map((entry) => [entry.number, entry]))
  const floorPercent = plan.coverageFloorPercent
  const definitionOfDone = bulletContaining({ source: planSource, marker: DOD_COVERAGE_MARKER })
  return {
    successMetrics: successMetricsOf({ prd, phases, evidenceByPhase, floorPercent }),
    trajectory: TRAJECTORY.map((entry) => ({
      key: entry.key,
      label: entry.label,
      question: entry.question,
      unit: entry.unit,
      points: phases.map((phase) =>
        pointFor({ entry, phase, phases, evidenceByPhase, floorPercent, definitionOfDone }),
      ),
    })),
  }
}
