// One inline stylesheet. No @font-face, no @import, no url() — the document has
// to render identically with the network unplugged, so every pixel it needs is
// either in this file or in the reader's own system fonts.
export const STYLES = `
:root {
  --bg: #fbfaf8;
  --panel: #ffffff;
  --fg: #17171a;
  --muted: #62626b;
  --line: #ded9d0;
  --line-strong: #7d7a72;
  --accent: #2f5d8a;
  --done: #2c6e49;
  --pending: #8a6d2f;
  --fail: #a02c2c;
  --cluster: #f1efea;
  --s1: #2f5d8a;
  --s2: #2c6e49;
  --s3: #8a5a2f;
  --s4: #6b4a86;
  --s5: #7d7a72;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121316;
    --panel: #191b1f;
    --fg: #e9e7e2;
    --muted: #a3a2a8;
    --line: #33363c;
    --line-strong: #8d8f97;
    --accent: #8fb6dd;
    --done: #74c69d;
    --pending: #d9b871;
    --fail: #e88f8f;
    --cluster: #22252a;
    --s1: #8fb6dd;
    --s2: #74c69d;
    --s3: #d1a06a;
    --s4: #b79bd6;
    --s5: #9a9aa2;
  }
}
* { box-sizing: border-box; }
/* No smooth scrolling. Switching panes changes the document height by thousands of
   pixels, and the animation resolves its target before that reflow settles, so the
   reader lands past the section with its own heading above the fold. Measured at
   40-108px off on the taller panes. */
html { scroll-behavior: auto; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.01em; }
h2 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
h3 { font-size: 16px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
h4 { font-size: 16px; margin: 20px 0 6px; }
h5, h6 { font-size: 14px; margin: 16px 0 6px; }
p { margin: 0 0 12px; }
a { color: var(--accent); }
code, pre, .mono { font-family: var(--mono); font-size: 13px; }
code { background: var(--cluster); padding: 0 3px; border-radius: 3px; }
pre { background: var(--cluster); padding: 12px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
.muted { color: var(--muted); }
.lede { font-size: 17px; color: var(--muted); margin: 0 0 18px; max-width: 70ch; }
.meta { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px 22px;
  margin: 0 0 22px;
}
.panel > :last-child { margin-bottom: 0; }
.rule { border: 0; border-top: 1px solid var(--line); margin: 26px 0; }
.pill {
  display: inline-block;
  font-family: var(--mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 1px 9px;
  white-space: nowrap;
}
.pill-done { color: var(--done); }
.pill-pending { color: var(--pending); }
.pill-fail { color: var(--fail); }
.phase-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; padding: 0; list-style: none; }
.phase-nav a {
  display: block;
  font-family: var(--mono);
  font-size: 12px;
  text-decoration: none;
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 9px;
  background: var(--panel);
}
.phase-nav a:hover { border-color: var(--line-strong); }
.phase-nav .dot { display: inline-block; width: 7px; height: 7px; border-radius: 999px; margin-right: 6px; background: var(--pending); }
.phase-nav .dot-done { background: var(--done); }
.filters { display: flex; gap: 8px; align-items: center; margin: 0 0 18px; flex-wrap: wrap; }
.filters button {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
}
.filters button[aria-pressed='true'] { border-color: var(--line-strong); background: var(--cluster); }
.phase {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 22px;
  margin: 0 0 26px;
}
.phase-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.phase-head .branch { font-family: var(--mono); font-size: 13px; color: var(--muted); }
.phase.is-empty { border-style: dashed; }
[data-filter='populated'] .phase.is-empty { display: none; }
[data-filter='pending'] .phase:not(.is-empty) { display: none; }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; margin: 12px 0 0; font-size: 14px; }
.kv dt { color: var(--muted); font-family: var(--mono); font-size: 12px; padding-top: 3px; }
.kv dd { margin: 0; }
.table-wrap { overflow-x: auto; margin: 0 0 14px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { border-bottom: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-family: var(--mono); white-space: nowrap; }
blockquote { margin: 0 0 12px; padding: 2px 0 2px 14px; border-left: 3px solid var(--line); color: var(--muted); }
ul, ol { margin: 0 0 12px; padding-left: 22px; }
li { margin: 0 0 4px; }
figure { margin: 0 0 18px; }
figcaption { font-size: 12px; color: var(--muted); margin-top: 8px; }
.diagram { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: var(--panel); overflow-x: auto; }
details.src { margin: 8px 0 0; }
details.src summary { font-family: var(--mono); font-size: 12px; color: var(--muted); cursor: pointer; }
details.src[open] summary { margin-bottom: 8px; }
.warn { color: var(--fail); }
.empty-note {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0 0 14px;
}
.dg { max-width: 100%; height: auto; display: block; }
.dg-shape { fill: var(--panel); stroke: var(--line-strong); stroke-width: 1.2; }
.dg-rim { fill: none; stroke: var(--line-strong); stroke-width: 1.2; }
.dg-node-text { font-family: var(--mono); font-size: 13px; fill: var(--fg); text-anchor: middle; }
.dg-cluster { fill: var(--cluster); stroke: var(--line-strong); stroke-width: 1; stroke-dasharray: 5 4; }
.dg-cluster-text { font-family: var(--mono); font-size: 12px; fill: var(--muted); text-anchor: middle; }
.dg-edge { stroke: var(--line-strong); stroke-width: 1.3; fill: none; }
.dg-edge-dashed { stroke-dasharray: 6 4; }
.dg-edge-label-bg { fill: var(--panel); }
.dg-edge-text { font-family: var(--mono); font-size: 11px; fill: var(--muted); text-anchor: middle; }
.dg-arrow { fill: var(--line-strong); }
.chart { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: var(--panel); margin: 0 0 20px; }
.chart svg { max-width: 100%; height: auto; display: block; }
.ch-grid { stroke: var(--line); stroke-width: 1; }
.ch-tick, .ch-category, .ch-value, .ch-empty-text, .ch-reference-text {
  font-family: var(--mono);
  fill: var(--muted);
}
.ch-tick { font-size: 10px; }
.ch-category { font-size: 11px; }
.ch-value { font-size: 10px; fill: var(--fg); }
.ch-empty { fill: none; stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 4; }
.ch-empty-text { font-size: 10px; }
.ch-reference { stroke: var(--fail); stroke-width: 1; stroke-dasharray: 4 3; }
.ch-reference-text { font-size: 10px; fill: var(--fail); }
.ch-legend { display: flex; flex-wrap: wrap; gap: 14px; list-style: none; padding: 0; margin: 10px 0 0; font-family: var(--mono); font-size: 12px; color: var(--muted); }
.ch-legend li { margin: 0; display: flex; align-items: center; gap: 6px; }
.ch-swatch { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
.ch-s1, .ch-swatch.ch-s1 { fill: var(--s1); background: var(--s1); }
.ch-s2, .ch-swatch.ch-s2 { fill: var(--s2); background: var(--s2); }
.ch-s3, .ch-swatch.ch-s3 { fill: var(--s3); background: var(--s3); }
.ch-s4, .ch-swatch.ch-s4 { fill: var(--s4); background: var(--s4); }
.ch-s5, .ch-swatch.ch-s5 { fill: var(--s5); background: var(--s5); }
/* The skip control is a button, not a link, because the panel a reader is on
   lives in the URL fragment and any href would replace it — see the comment on
   SKIP_CONTROL in tools/lib/layout.mjs. Fixed, not absolute: nothing on the page
   establishes a containing block, so an absolutely positioned box puts :focus
   12px from the top of the DOCUMENT, i.e. off-screen for anyone who scrolled
   before shift-tabbing back to it. */
.skip {
  position: fixed;
  top: 12px;
  left: -9999px;
  z-index: 20;
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
}
.skip:focus { left: 12px; }
@media print {
  body { background: #fff; }
  .phase, .panel, .chart, .diagram { break-inside: avoid; }
  details.src, .skip { display: none; }
}
`
