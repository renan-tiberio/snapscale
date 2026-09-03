import { renderInline, renderMarkdown } from '../docs/markdown.mjs'
import { escapeHtml } from '../docs/text.mjs'

// The two reference panes: the decision log and the provenance table. Neither is
// per-phase, so neither belongs in a phase panel.

const MISSING = '—'

const stripParagraph = ({ source }) =>
  renderMarkdown({ source })
    .replace(/^<p>/, '')
    .replace(/<\/p>$/, '')

const decisionEntry = ({ decision }) =>
  [
    '<details class="src">',
    `<summary>#${decision.number} ${renderInline({ source: decision.title })}${decision.phaseNumber === null ? '' : ` — phase ${decision.phaseNumber}`}</summary>`,
    decision.over === null
      ? ''
      : `<p class="muted">Picked: ${stripParagraph({ source: decision.picked })} · Over: ${stripParagraph({ source: decision.over })}</p>`,
    decision.fields
      .map(
        (field) =>
          `<h4>${escapeHtml({ value: field.label })}</h4>${renderMarkdown({ source: field.value })}`,
      )
      .join(''),
    decision.fields.length === 0
      ? '<p class="empty-note">No labelled fields in this entry.</p>'
      : '',
    '</details>',
  ].join('')

export const renderDecisionsPane = ({ decisions, paths }) => {
  const tagged = decisions.filter((decision) => decision.phaseNumber !== null)
  const untagged = decisions.filter((decision) => decision.phaseNumber === null)
  return [
    '<section class="pane" id="decisions">',
    '<h2>Decisions</h2>',
    `<p class="lede">${decisions.length} entries in <code>${escapeHtml({ value: paths.decisions })}</code>: ${untagged.length} bind from the start of the project, ${tagged.length} carry a <code>(phase N)</code> tag and only materialise in that phase. Each entry is shown with the alternative it was chosen over, extracted from the log — nothing here is restated by hand.</p>`,
    '<h3>Binding from the start</h3>',
    untagged.length === 0
      ? '<p class="empty-note">No untagged entry in the log.</p>'
      : untagged.map((decision) => decisionEntry({ decision })).join(''),
    '<h3>Tagged to a later phase</h3>',
    tagged.length === 0
      ? '<p class="empty-note">No entry in the log carries a phase tag.</p>'
      : tagged.map((decision) => decisionEntry({ decision })).join(''),
    '</section>',
  ].join('')
}

export const renderProvenancePane = ({ model }) =>
  [
    '<section class="pane" id="provenance">',
    '<h2>Provenance</h2>',
    '<p class="lede">Every figure on this page was read out of a file in this repository, out of git, or out of the running application at build time. Nothing is typed in by hand, and nothing missing is filled in with a guess.</p>',
    '<div class="table-wrap"><table><thead><tr><th>Source</th><th class="num">Lines</th><th>What this page takes from it</th></tr></thead><tbody>',
    model.provenance
      .map(
        (entry) =>
          `<tr><th scope="row" class="mono">${escapeHtml({ value: entry.path })}</th><td class="num">${entry.lines ?? MISSING}</td><td>${escapeHtml({ value: entry.extracted })}</td></tr>`,
      )
      .join(''),
    '</tbody></table></div>',
    '<h3>Notes the extraction produced</h3>',
    model.notes.length === 0
      ? '<p>None: every source parsed cleanly and every declared value agreed with its neighbours.</p>'
      : `<ul>${model.notes.map((note) => `<li>${renderInline({ source: note })}</li>`).join('')}</ul>`,
    '<h3>Rebuilding this page</h3>',
    renderMarkdown({
      source: [
        '```bash',
        'pnpm docs:build          # or: node tools/build-docs.mjs',
        'turbo run docs:build     # the same task, through the pipeline',
        '```',
        '',
        `The generator is plain Node ESM with zero dependencies. It writes exactly one file, \`${model.outputPath}\`, and it is idempotent: the only timestamp it embeds is the committer date of \`HEAD\`, so running it twice produces byte-identical output and no diff noise.`,
        '',
        'The page makes **zero network requests**: no CDN, no web fonts, no remote images. Styles, scripts, diagrams and charts are inline, so it renders the same from `file://`, offline, years from now. The section switching is CSS `:target`, which means it also works with JavaScript switched off; the script adds keyboard shortcuts and marks the current section for assistive technology, and nothing else.',
      ].join('\n'),
    }),
    '</section>',
  ].join('')
