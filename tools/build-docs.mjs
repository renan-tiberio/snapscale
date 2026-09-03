#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { readEvidence } from './docs/evidence.mjs'
import { readHead, readPhaseHistory } from './docs/history.mjs'
import { parsePhaseNarrative } from './docs/narrative.mjs'
import { parseArchitecture, parseDecisionLog, parsePlan } from './docs/parse-docs.mjs'
import { fileStats, readTextFile, refExists, repoPath, REPO_ROOT } from './docs/repo.mjs'
import { collectApiSurface } from './lib/api-surface.mjs'
import { collectLabMetrics } from './lib/lab-metrics.mjs'
import { paneIdsOf, renderSite } from './lib/layout.mjs'
import { collectPhaseEvolution } from './lib/phase-evolution.mjs'

// Builds docs/site/index.html: one self-contained page telling the phase-by-phase
// story of this repository. The narrative per phase is hand-written markdown in
// docs/phases/; every other fact on the page — structure, topologies, numbers,
// history, the API surface — is extracted here, at build time, from the files and
// commands named below.

const PATHS = {
  prd: 'docs/01-prd.md',
  plan: 'docs/04-implementation-plan.md',
  architecture: 'docs/02-architecture.md',
  decisions: 'docs/05-decision-log.md',
  phasesReadme: 'docs/phases/README.md',
  design: 'docs/03-technical-design.md',
  openapi: 'apps/api/scripts/openapi.ts',
  coverageEvidence: 'docs/evidence/phase-N/coverage-summary.md',
}
const OUTPUT_PATH = 'docs/site/index.html'
const DEFAULT_BASE_REF = 'main'

const narrativePathFor = ({ number }) => `docs/phases/phase-${number}.md`

const readNarrative = ({ phase }) => {
  const path = narrativePathFor({ number: phase.number })
  const source = readTextFile({ relative: path })
  if (source === null) return { path, narrative: null, errors: [], warnings: [] }
  const parsed = parsePhaseNarrative({ source, path, expected: phase })
  if (parsed.errors !== undefined)
    return { path, narrative: null, errors: parsed.errors, warnings: [] }
  return { path, narrative: parsed, errors: [], warnings: parsed.warnings }
}

// A phase branch is cut from the previous phase's final state, so its history is
// measured against the nearest earlier phase branch that actually exists.
const baseRefFor = ({ phases, index }) => {
  const earlier = phases
    .slice(0, index)
    .map((phase) => phase.branch)
    .filter((branch) => branch !== null && refExists({ ref: branch }))
  return earlier.at(-1) ?? DEFAULT_BASE_REF
}

const statusOf = ({ narrative, narrativePath }) => {
  if (narrative === null) {
    return {
      status: 'pending',
      statusSource: `no ${narrativePath}, which the contract in ${PATHS.phasesReadme} reads as pending`,
    }
  }
  return {
    status: narrative.frontmatter.status,
    statusSource: `declared \`status: ${narrative.frontmatter.status}\` in ${narrativePath}`,
  }
}

const buildPhases = ({ plan, architecture, decisions }) => {
  const collected = plan.phases.map((phase, index) => {
    const { path, narrative, errors, warnings } = readNarrative({ phase })
    return {
      ...phase,
      ...statusOf({ narrative, narrativePath: path }),
      narrativePath: path,
      narrative: narrative === null ? null : narrative,
      architecture: architecture.find((section) => section.phaseNumber === phase.number),
      evidence: readEvidence({ phaseNumber: phase.number }),
      history: readPhaseHistory({
        branch: phase.branch,
        baseRef: baseRefFor({ phases: plan.phases, index }),
      }),
      decisions: decisions.filter((decision) => decision.phaseNumber === phase.number),
      errors,
      warnings,
    }
  })
  return collected
}

// The API-surface extractor reaches outside the docs tree: it runs the API's own
// OpenAPI generator in a child process, which can fail on a machine where
// dependencies are not installed, and a docs build is not the place to die for
// that. The failure is printed, recorded as a note, and drawn on the page as an
// empty section. An empty section is a true statement; a cached number would not
// be.
const collect = async ({ label, run }) => {
  try {
    return { value: await run(), note: null }
  } catch (error) {
    return {
      value: null,
      note: `${label} could not be collected (${error.message}), so that section of the page is empty rather than filled in from an earlier run.`,
    }
  }
}

const sourceFile = ({ path, extracted }) => ({
  path,
  lines: fileStats({ relative: path })?.lines ?? null,
  extracted,
})

const apiProvenanceFor = ({ apiSurface }) => {
  if (apiSurface === null) return []
  const designRow = sourceFile({
    path: PATHS.design,
    extracted:
      apiSurface.source === 'openapi'
        ? 'the hand-written endpoint table in §4: the auth column, and the cross-check that turns a disagreement with the running app into a drift finding'
        : 'the hand-written endpoint table in §4, the labelled fallback for the API surface when the OpenAPI document cannot be generated',
  })
  if (apiSurface.source !== 'openapi') return [designRow]
  return [
    sourceFile({
      path: PATHS.openapi,
      extracted:
        'the OpenAPI document of the real Fastify app, generated in a child process: every endpoint, its parameters and its response shapes, from the same schemas that validate live requests',
    }),
    designRow,
  ]
}

const provenanceFor = ({ phases }) => [
  {
    path: PATHS.prd,
    lines: fileStats({ relative: PATHS.prd })?.lines ?? null,
    extracted:
      'the Success Metrics table: every metric, its target and the method declared for measuring it — the five rows of the scoreboard; plus the Problem and Hypothesis sections, quoted as the position phase 1 starts from',
  },
  {
    path: PATHS.plan,
    lines: fileStats({ relative: PATHS.plan })?.lines ?? null,
    extracted:
      'the nine phases, their names, branches, goals, exit criteria, per-phase risk tables and the coverage floor in the Definition of Done',
  },
  {
    path: PATHS.architecture,
    lines: fileStats({ relative: PATHS.architecture })?.lines ?? null,
    extracted:
      'the per-phase topology prose and every mermaid flowchart, parsed and drawn as inline SVG; the communication-evolution table; the AWS-mapping table read as one lesson per phase',
  },
  {
    path: PATHS.decisions,
    lines: fileStats({ relative: PATHS.decisions })?.lines ?? null,
    extracted:
      'each decision, the alternative it was chosen over (what a phase discarded), its labelled fields — the problem, the trade-off accepted — and its optional (phase N) tag',
  },
  {
    path: PATHS.phasesReadme,
    lines: fileStats({ relative: PATHS.phasesReadme })?.lines ?? null,
    extracted:
      'the phase-report contract this generator enforces (frontmatter keys, the five H2 sections, the pending fallback)',
  },
  ...phases
    .filter((phase) => phase.narrative !== null)
    .map((phase) => ({
      path: phase.narrativePath,
      lines: fileStats({ relative: phase.narrativePath })?.lines ?? null,
      extracted:
        'the hand-written phase report: frontmatter status plus the five sections, rendered verbatim',
    })),
  ...phases
    .filter((phase) => phase.evidence.exists)
    .flatMap((phase) =>
      phase.evidence.files.map((file) => ({
        path: file.path,
        lines: file.lines,
        extracted:
          file.name === 'coverage-summary.md'
            ? 'the Totals table: test files, tests and coverage percentages per package'
            : file.name === 'verification.md'
              ? 'the header block (date, branch, commit verified) and the Summary gate table'
              : 'listed as evidence, with its size',
      })),
    ),
  {
    path: 'git',
    lines: null,
    extracted:
      'HEAD sha, subject and committer date for the build stamp, and whether each phase branch exists in this repository yet',
  },
]

const notesFor = ({ plan, phases, collectionNotes }) => [
  ...collectionNotes,
  ...(plan.declaredMilestones !== null &&
  !plan.declaredMilestones.startsWith(String(plan.phases.length))
    ? [
        `${PATHS.plan} declares "Selected Milestones: ${plan.declaredMilestones}" while the same file contains ${plan.phases.length} "## Phase N" sections. This page follows the sections.`,
      ]
    : []),
  ...phases.flatMap((phase) => phase.warnings),
  ...phases
    .filter((phase) => phase.architecture !== undefined && phase.architecture.diagrams.length === 0)
    .map(
      (phase) =>
        `Phase ${phase.number} has a section in ${PATHS.architecture} but no mermaid diagram in it, so no topology is drawn for it.`,
    ),
  ...phases
    .filter(
      (phase) =>
        phase.evidence.exists &&
        phase.evidence.coverage?.missing !== null &&
        phase.evidence.coverage !== null,
    )
    .map(
      (phase) =>
        `Phase ${phase.number}: ${phase.evidence.coverage.path} has no "## Totals…" table, so no coverage or test numbers could be extracted from it.`,
    ),
  ...phases
    .filter(
      (phase) =>
        phase.evidence.exists && (phase.evidence.coverage?.unknownColumns?.length ?? 0) > 0,
    )
    .map(
      (phase) =>
        `Phase ${phase.number}: unrecognised columns in the coverage Totals table (${phase.evidence.coverage.unknownColumns.join(', ')}) were ignored.`,
    ),
  ...(plan.statusNote === null ? [] : [`Status line in ${PATHS.plan}: ${plan.statusNote}`]),
]

// The story fields, in the order the phase panes tell them. An empty field is
// rendered as empty and counted here, because "nobody wrote this down" is the
// kind of fact that silently disappears from a page.
const STORY_FIELDS = [
  'problemNow',
  'whatChanged',
  'topologyMermaid',
  'bought',
  'cost',
  'discarded',
  'exitCriterion',
  'lesson',
]

const emptyStoryFields = ({ evolution }) =>
  STORY_FIELDS.map((field) => ({
    field,
    empty: evolution.phases.filter((phase) => phase[field] === '').length,
  }))
    .filter((entry) => entry.empty > 0)
    .map((entry) => `${entry.field} ${entry.empty}`)
    .join(', ') || 'none'

const slotsInState = ({ trajectory, state }) =>
  trajectory.flatMap((entry) => entry.points).filter((point) => point.state === state).length

const labSlots = ({ trajectory }) =>
  [
    `${slotsInState({ trajectory, state: 'measured' })} measured`,
    `${slotsInState({ trajectory, state: 'declared' })} declared`,
    `${slotsInState({ trajectory, state: 'not-applicable' })} not applicable`,
  ].join(', ')

const build = async () => {
  const planSource = readTextFile({ relative: PATHS.plan })
  const architectureSource = readTextFile({ relative: PATHS.architecture })
  const decisionSource = readTextFile({ relative: PATHS.decisions })
  const missingSources = Object.entries({
    [PATHS.plan]: planSource,
    [PATHS.architecture]: architectureSource,
    [PATHS.decisions]: decisionSource,
  })
    .filter(([, source]) => source === null)
    .map(([path]) => path)
  if (missingSources.length > 0) {
    return { errors: missingSources.map((path) => `required source missing: ${path}`) }
  }

  const plan = parsePlan({ source: planSource })
  const architecture = parseArchitecture({ source: architectureSource })
  const decisions = parseDecisionLog({ source: decisionSource })
  const phases = buildPhases({ plan, architecture, decisions })
  const errors = phases.flatMap((phase) => phase.errors)
  if (errors.length > 0) return { errors }

  const api = await collect({
    label: 'The API surface',
    run: () => collectApiSurface({ repoRoot: REPO_ROOT }),
  })
  const collectionNotes = [api.note].filter((note) => note !== null)
  const labMetrics = await collectLabMetrics({ repoRoot: REPO_ROOT })
  const evolution = await collectPhaseEvolution({ repoRoot: REPO_ROOT })

  const model = {
    head: readHead(),
    paths: PATHS,
    outputPath: OUTPUT_PATH,
    phases,
    decisions,
    apiSurface: api.value,
    labMetrics,
    evolution,
    coverageFloorPercent: plan.coverageFloorPercent,
    populatedCount: phases.filter(
      (phase) => phase.narrative !== null || phase.history.exists || phase.evidence.exists,
    ).length,
    provenance: [...provenanceFor({ phases }), ...apiProvenanceFor({ apiSurface: api.value })],
    notes: notesFor({ plan, phases, collectionNotes }),
  }
  return { html: renderSite({ model }), model }
}

const result = await build()
if (result.errors !== undefined) {
  process.stderr.write(
    [
      'build-docs: refusing to write a site from sources that break their contract.',
      ...result.errors.map((error) => `  - ${error}`),
      `The contract lives in ${PATHS.phasesReadme}. Fix the source and re-run.`,
      '',
    ].join('\n'),
  )
  process.exit(1)
}

const outputFile = repoPath({ relative: OUTPUT_PATH })
mkdirSync(dirname(outputFile), { recursive: true })
writeFileSync(outputFile, result.html)
process.stdout.write(
  [
    `build-docs: wrote ${OUTPUT_PATH} (${Buffer.byteLength(result.html)} bytes) from commit ${result.model.head.shortSha}`,
    `  phases: ${result.model.phases.length} declared, ${result.model.populatedCount} with data`,
    `  reports: ${
      result.model.phases
        .filter((phase) => phase.narrative !== null)
        .map((phase) => phase.number)
        .join(', ') || 'none'
    }`,
    `  story: ${result.model.evolution.phases.length} phases, empty fields: ${emptyStoryFields({ evolution: result.model.evolution })}`,
    `  trajectory: ${result.model.labMetrics.successMetrics.length} success metrics, ${result.model.labMetrics.trajectory.length} questions, ${labSlots({ trajectory: result.model.labMetrics.trajectory })}`,
    `  sections: ${paneIdsOf({ phases: result.model.phases }).length} panels, one visible at a time`,
    `  api surface: ${
      result.model.apiSurface === null
        ? 'not collected'
        : `${result.model.apiSurface.endpoints.length} endpoints from ${result.model.apiSurface.source}, ${result.model.apiSurface.drift.length} drift finding(s)`
    }`,
    `  notes: ${result.model.notes.length}`,
    '',
  ].join('\n'),
)
