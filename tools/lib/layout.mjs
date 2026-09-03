import { renderPhase } from '../docs/render-phase.mjs'
import { STYLES } from '../docs/styles.mjs'
import { escapeHtml } from '../docs/text.mjs'

import { renderApiPane } from './api-section.mjs'
import { renderChartsPane, renderOverviewPane } from './overview.mjs'
import { renderDecisionsPane, renderProvenancePane } from './reference.mjs'
import { defaultPaneRules, navCurrentRules, SHELL_STYLES } from './shell-styles.mjs'
import { renderTrajectoryPane, trajectoryTallyOf } from './trajectory-section.mjs'

// The page shell: a persistent <nav> and one panel visible at a time.
//
// The default panel is rendered LAST inside #panes so that the CSS in
// shell-styles.mjs can hide it with a general sibling combinator once another
// panel is targeted. Reading order is unaffected: exactly one panel is displayed,
// so the other fourteen are out of the accessibility tree entirely.
//
// The panel that opens the page is the trajectory: what the lab set out to
// measure and how much of it has been measured. Everything else on the page —
// the narrative, the topologies, the API surface — is support for that, so it
// reads below it rather than in front of it.

const MISSING = '—'
const DEFAULT_PANE = 'trajectory'

const SECTION_ENTRIES = [
  { id: 'trajectory', label: 'The lab trajectory' },
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Across the phases' },
  { id: 'api', label: 'API surface' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'provenance', label: 'Provenance' },
]

const isEmptyPhase = ({ phase }) =>
  phase.narrative === null && !phase.history.exists && !phase.evidence.exists

const sectionLink = ({ entry, count }) =>
  [
    `<li><a href="#${entry.id}" data-pane="${entry.id}">`,
    `<span class="nav-name">${escapeHtml({ value: entry.label })}</span>`,
    count === undefined ? '' : `<span class="nav-flag">${escapeHtml({ value: count })}</span>`,
    '</a></li>',
  ].join('')

const phaseLink = ({ phase }) => {
  const empty = isEmptyPhase({ phase })
  return [
    `<li${empty ? ' class="is-empty"' : ''}><a href="#phase-${phase.number}" data-pane="phase-${phase.number}">`,
    `<span class="nav-num">${phase.number}</span>`,
    `<span class="nav-name">${escapeHtml({ value: phase.name })}</span>`,
    `<span class="nav-flag">${empty ? MISSING : escapeHtml({ value: phase.status })}</span>`,
    '</a></li>',
  ].join('')
}

const navigation = ({ model, sectionCounts }) =>
  [
    '<nav class="sidenav" aria-label="Sections of this page" data-pane-nav>',
    '<div class="nav-group">',
    '<p class="nav-label" id="nav-label-sections">The whole project</p>',
    '<ul class="nav-list" aria-labelledby="nav-label-sections">',
    SECTION_ENTRIES.map((entry) => sectionLink({ entry, count: sectionCounts[entry.id] })).join(''),
    '</ul>',
    '</div>',
    '<div class="nav-group">',
    `<p class="nav-label" id="nav-label-phases">The ${model.phases.length} phases · ${model.populatedCount} with data</p>`,
    '<ul class="nav-list" aria-labelledby="nav-label-phases">',
    model.phases.map((phase) => phaseLink({ phase })).join(''),
    '</ul>',
    '</div>',
    '<p class="nav-hint" data-nav-hint hidden>Press <kbd>[</kbd> and <kbd>]</kbd> to step through these sections.</p>',
    '</nav>',
  ].join('')

// The panel a reader is on IS the URL fragment, so the skip control cannot be a
// link: `href="#panes"` makes <main> itself the :target, none of the
// `#panes > .pane:target` rules match any more, and the page drops back to the
// default panel — the one control aimed at keyboard users would be the only one
// that loses their place. A button moves focus without touching the fragment. That
// needs the script, so like the keyboard hint it ships hidden and is revealed
// once the script has run. Without the script a reader still gets past the
// section list: <nav> and <main> are landmarks, which is how a screen reader
// jumps a repeated block, and the list is 15 tab stops rather than a trap.
const SKIP_CONTROL =
  '<button class="skip" type="button" data-skip-to-pane hidden>Skip to the current section</button>'

// Enhancement only. Panel switching is CSS; this adds the aria-current the
// stylesheet cannot set, wires the two keys the hint promises, and reveals the
// two controls that would otherwise be a lie — the hint itself and the skip
// button, both of which ship hidden.
const ENHANCEMENT_SCRIPT = [
  '(() => {',
  "  const panes = document.getElementById('panes')",
  "  const nav = document.querySelector('[data-pane-nav]')",
  '  if (panes === null || nav === null) return',
  "  const links = Array.from(nav.querySelectorAll('[data-pane]'))",
  '  const order = links.map((link) => link.dataset.pane)',
  '  if (order.length === 0) return',
  '  const fallback = panes.dataset.defaultPane',
  '  const currentPane = () => {',
  '    const id = location.hash.slice(1)',
  "    if (id === '') return fallback",
  '    if (order.includes(id)) return id',
  '    const target = document.getElementById(id)',
  "    const owner = target === null ? null : target.closest('#panes > [id]')",
  '    return owner === null ? fallback : owner.id',
  '  }',
  '  const mark = () => {',
  '    const id = currentPane()',
  '    links.forEach((link) => {',
  "      if (link.dataset.pane === id) link.setAttribute('aria-current', 'page')",
  "      else link.removeAttribute('aria-current')",
  '    })',
  '  }',
  '  const step = (delta) => {',
  '    const index = order.indexOf(currentPane())',
  '    location.hash = order[(index + delta + order.length) % order.length]',
  '  }',
  "  window.addEventListener('hashchange', mark)",
  '  mark()',
  "  const hint = document.querySelector('[data-nav-hint]')",
  "  if (hint !== null) hint.removeAttribute('hidden')",
  "  const skip = document.querySelector('[data-skip-to-pane]')",
  '  if (skip !== null) {',
  "    skip.removeAttribute('hidden')",
  "    skip.addEventListener('click', () => {",
  '      const pane = document.getElementById(currentPane())',
  '      if (pane === null) return',
  '      // A panel is a container: -1 makes it focusable on demand without',
  '      // adding a tab stop of its own.',
  "      pane.setAttribute('tabindex', '-1')",
  '      pane.focus()',
  '    })',
  '  }',
  "  document.addEventListener('keydown', (event) => {",
  '    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return',
  '    const node = event.target',
  '    if (node.isContentEditable === true) return',
  "    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) return",
  "    if (event.key === '[') { event.preventDefault(); step(-1) }",
  "    else if (event.key === ']') { event.preventDefault(); step(1) }",
  '  })',
  '})()',
].join('\n')

const trajectoryCountOf = ({ model }) => {
  const tally = trajectoryTallyOf({ metrics: model.labMetrics })
  return tally === null ? MISSING : `${tally.measured} of ${tally.slots} measured`
}

const sectionCountsOf = ({ model }) => ({
  trajectory: trajectoryCountOf({ model }),
  api: model.apiSurface === null ? MISSING : `${model.apiSurface.endpoints.length} endpoints`,
  decisions: `${model.decisions.length} entries`,
  provenance: `${model.provenance.length} sources`,
})

const head = ({ model, paneIds }) =>
  [
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    '<title>SnapScale — the evolution, phase by phase</title>',
    `<meta name="description" content="SnapScale phase-by-phase evolution: topologies, the API surface and the evidence extracted from the repository at commit ${escapeHtml({ value: model.head.shortSha ?? 'unknown' })}."/>`,
    // Browsers ask for /favicon.ico on their own over http; an empty data: URI
    // answers that without a request of any kind.
    '<link rel="icon" href="data:,"/>',
    `<style>${STYLES}${SHELL_STYLES}${defaultPaneRules({ defaultPaneId: DEFAULT_PANE })}${navCurrentRules({ paneIds, defaultPaneId: DEFAULT_PANE })}</style>`,
    '</head>',
  ].join('\n')

const masthead = ({ model }) =>
  [
    '<header class="masthead">',
    '<h1>SnapScale — the evolution</h1>',
    '<p class="lede">An image gallery whose heavy endpoint is measured, extracted into a real microservice, and autoscaled — one branch per phase, all of it local. This page is generated from the repository itself: the narrative per phase is hand-written, everything else is extracted.</p>',
    `<p class="meta">Generated from <strong>${escapeHtml({ value: model.head.shortSha ?? MISSING })}</strong> (${escapeHtml({ value: model.head.sha ?? MISSING })}) on branch <strong>${escapeHtml({ value: model.head.branch === '' ? MISSING : model.head.branch })}</strong>, committed ${escapeHtml({ value: model.head.date ?? MISSING })} — &ldquo;${escapeHtml({ value: model.head.subject ?? MISSING })}&rdquo;. Built by <code>tools/build-docs.mjs</code>.</p>`,
    '</header>',
  ].join('\n')

// Order matters: the default panel is last so the stylesheet can hide it with a
// sibling combinator. The nav lists it first, and the nav is the reading order.
const panesOf = ({ model }) => [
  renderOverviewPane({ model }),
  renderChartsPane({ model, coverageSourcePath: model.paths.coverageEvidence }),
  renderApiPane({ surface: model.apiSurface }),
  renderDecisionsPane({ decisions: model.decisions, paths: model.paths }),
  renderProvenancePane({ model }),
  ...model.phases.map((phase) =>
    renderPhase({
      phase,
      paths: model.paths,
      evolution: model.evolution,
      metrics: model.labMetrics,
    }),
  ),
  renderTrajectoryPane({ metrics: model.labMetrics, paths: model.paths }),
]

export const paneIdsOf = ({ phases }) => [
  ...SECTION_ENTRIES.map((entry) => entry.id),
  ...phases.map((phase) => `phase-${phase.number}`),
]

// `#panes > :target ~ #overview` can only hide the default panel if the default
// panel really is the last child, and getting that wrong shows two panels at once
// — a bug a reader would see but a comment cannot prevent. So it is checked, and
// a violation stops the build rather than shipping a broken page.
const assertDefaultPaneIsLast = ({ panes }) => {
  const lastId = panes.at(-1)?.match(/ id="([^"]+)"/)?.[1]
  if (lastId === DEFAULT_PANE) return
  throw new Error(
    `the default panel must be the last child of #panes for the CSS fallback to work, but the last panel is "${lastId ?? 'unknown'}" and the default is "${DEFAULT_PANE}"`,
  )
}

export const renderSite = ({ model }) => {
  const paneIds = paneIdsOf({ phases: model.phases })
  const panes = panesOf({ model })
  assertDefaultPaneIsLast({ panes })
  return [
    '<!doctype html>',
    '<html lang="en">',
    head({ model, paneIds }),
    '<body>',
    SKIP_CONTROL,
    masthead({ model }),
    '<div class="shell">',
    navigation({ model, sectionCounts: sectionCountsOf({ model }) }),
    `<main id="panes" data-default-pane="${DEFAULT_PANE}">`,
    ...panes,
    '</main>',
    '</div>',
    '<footer class="meta page-foot">',
    `SnapScale · generated at commit ${escapeHtml({ value: model.head.shortSha ?? MISSING })} · ${paneIds.length} sections in one self-contained file, no external requests`,
    '</footer>',
    `<script>${ENHANCEMENT_SCRIPT}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
