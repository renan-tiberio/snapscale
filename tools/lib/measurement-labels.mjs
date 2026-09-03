import { escapeHtml } from '../docs/text.mjs'

// How a measurement slot is labelled, in one place. Two panes show the same
// slots — the lab trajectory and every phase pane — and a slot that reads
// "declared" in one and "pending" in the other would look like two facts about
// the same phase rather than one.
//
// The three keys are the states `collectLabMetrics` emits; nothing here invents a
// fourth.
export const STATE_PILL = {
  measured: 'pill-done',
  declared: 'pill-pending',
  'not-applicable': 'pill-open',
}

export const STATE_WORD = {
  measured: 'measured',
  declared: 'declared',
  'not-applicable': 'n/a',
}

/** Evidence is a comma-separated list of repo-relative paths, printed as code. */
export const evidenceLinks = ({ evidence }) =>
  evidence
    .split(', ')
    .map((path) => `<code>${escapeHtml({ value: path })}</code>`)
    .join(' ')
