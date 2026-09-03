import { renderInline } from '../docs/markdown.mjs'
import { escapeHtml, slug } from '../docs/text.mjs'

// The API surface pane, fed by `collectApiSurface`. Two things a reader has to be
// able to tell at a glance and which this module therefore renders before any
// endpoint: which of the two possible sources produced the table, and whether the
// documented contract and the running one disagree. A drift finding is the most
// valuable thing this page can show, so it is a callout at the top, not a footnote.

const SOURCE_LABELS = {
  openapi: 'extracted from the running app',
  documented: 'read from the design document',
}

const CLIENT_ERROR_FLOOR = 400
const SERVER_ERROR_FLOOR = 500

const statusClass = ({ status }) => {
  if (status >= SERVER_ERROR_FLOOR) return 'status-server'
  if (status >= CLIENT_ERROR_FLOOR) return 'status-client'
  return 'status-ok'
}

// The resource is the first literal path segment: it is what a reader scans for
// ("albums", "images") and it is stable under parameterisation.
const resourceOf = ({ path }) => {
  const segment = path.replace(/^\//, '').split('/')[0]
  return segment === '' ? 'root' : segment
}

const groupEndpoints = ({ endpoints }) =>
  endpoints.reduce((groups, endpoint) => {
    const name = resourceOf({ path: endpoint.path })
    const existing = groups.find((group) => group.name === name)
    if (existing === undefined) return [...groups, { name, endpoints: [endpoint] }]
    return groups.map((group) =>
      group === existing ? { ...group, endpoints: [...group.endpoints, endpoint] } : group,
    )
  }, [])

const verb = ({ method }) =>
  `<span class="verb verb-${method.toLowerCase()}">${escapeHtml({ value: method })}</span>`

const requestCell = ({ request }) =>
  request === ''
    ? '<span class="muted">no body, no parameters</span>'
    : renderInline({ source: request })

const responseList = ({ responses }) =>
  responses.length === 0
    ? '<span class="muted">no response declared</span>'
    : `<ul class="status-list">${responses
        .map(
          (response) =>
            `<li><span class="status ${statusClass({ status: response.status })}">${response.status}</span> <span>${renderInline({ source: response.description })}</span></li>`,
        )
        .join('')}</ul>`

const endpointRow = ({ endpoint }) =>
  [
    '<tr>',
    '<td>',
    `<div class="api-head">${verb({ method: endpoint.method })} <code class="api-path">${escapeHtml({ value: endpoint.path })}</code></div>`,
    `<span class="api-summary">${renderInline({ source: endpoint.summary })}</span>`,
    '</td>',
    `<td><span class="pill pill-auth">${escapeHtml({ value: endpoint.auth })}</span></td>`,
    `<td class="api-request">${requestCell({ request: endpoint.request })}</td>`,
    `<td>${responseList({ responses: endpoint.responses })}</td>`,
    '</tr>',
  ].join('')

const groupSection = ({ group }) =>
  [
    `<h3 id="api-${slug({ value: group.name })}">/${escapeHtml({ value: group.name })} <span class="muted">· ${group.endpoints.length} endpoint${group.endpoints.length === 1 ? '' : 's'}</span></h3>`,
    '<div class="table-wrap"><table class="api-table"><thead><tr><th>Endpoint</th><th>Auth</th><th>Request</th><th>Responses</th></tr></thead><tbody>',
    group.endpoints.map((endpoint) => endpointRow({ endpoint })).join(''),
    '</tbody></table></div>',
  ].join('')

const resourceChips = ({ groups }) =>
  [
    '<ul class="chip-row">',
    groups
      .map(
        (group) =>
          `<li><a class="chip" href="#api-${slug({ value: group.name })}">/${escapeHtml({ value: group.name })} <span class="muted">${group.endpoints.length}</span></a></li>`,
      )
      .join(''),
    '</ul>',
  ].join('')

const driftCallout = ({ drift }) => {
  if (drift.length === 0) {
    return [
      '<aside class="callout callout-clean" aria-labelledby="api-drift-h">',
      '<h3 id="api-drift-h">Documented contract vs running contract: no drift</h3>',
      '<p>Every endpoint the app registers has a row in the design document, and every documented row matches the running route. The comparison is redone on every build, so this claim expires the moment one of the two changes.</p>',
      '</aside>',
    ].join('')
  }
  return [
    '<aside class="callout callout-drift" aria-labelledby="api-drift-h">',
    `<h3 id="api-drift-h">Drift: ${drift.length} mismatch${drift.length === 1 ? '' : 'es'} between the documented contract and the running one</h3>`,
    `<ul>${drift.map((entry) => `<li>${renderInline({ source: entry })}</li>`).join('')}</ul>`,
    '<p class="muted">Found by comparing the two sources against each other at build time. Neither side is assumed correct — this page reports the disagreement rather than picking a winner.</p>',
    '</aside>',
  ].join('')
}

const sourceBanner = ({ surface }) =>
  [
    '<div class="source-banner">',
    `<span class="pill pill-source">source: ${escapeHtml({ value: surface.source })}</span>`,
    `<span class="source-label">${escapeHtml({ value: SOURCE_LABELS[surface.source] ?? 'source not recognised' })}</span>`,
    '</div>',
    `<p class="source-note">${renderInline({ source: surface.sourceNote })}</p>`,
  ].join('')

const authSummary = ({ endpoints }) => {
  const kinds = [...new Set(endpoints.map((endpoint) => endpoint.auth))].toSorted()
  return kinds
    .map(
      (kind) =>
        `<li><span class="pill pill-auth">${escapeHtml({ value: kind })}</span> <span class="muted">${endpoints.filter((endpoint) => endpoint.auth === kind).length} endpoint${endpoints.filter((endpoint) => endpoint.auth === kind).length === 1 ? '' : 's'}</span></li>`,
    )
    .join('')
}

export const renderApiPane = ({ surface }) => {
  if (surface === null) {
    return [
      '<section class="pane" id="api">',
      '<h2>API surface</h2>',
      '<p class="empty-note">Neither source for the API surface could be read, so no endpoint is listed. Nothing is filled in from memory: an endpoint that cannot be traced to the app or to the design document does not appear on this page.</p>',
      '</section>',
    ].join('')
  }
  if (surface.endpoints.length === 0) {
    return [
      '<section class="pane" id="api">',
      '<h2>API surface</h2>',
      sourceBanner({ surface }),
      '<p class="empty-note">The source parsed but declared no endpoint.</p>',
      '</section>',
    ].join('')
  }
  const groups = groupEndpoints({ endpoints: surface.endpoints })
  const methods = [...new Set(surface.endpoints.map((endpoint) => endpoint.method))]
  return [
    '<section class="pane" id="api">',
    '<h2>API surface</h2>',
    `<p class="lede">${surface.endpoints.length} endpoints across ${groups.length} resources, ${methods.length} HTTP method${methods.length === 1 ? '' : 's'}. Method, path, parameters and response shapes below are not restated by hand — they are read out of the source named in the banner on every build.</p>`,
    sourceBanner({ surface }),
    driftCallout({ drift: surface.drift }),
    '<h3>Jump to a resource</h3>',
    resourceChips({ groups }),
    `<ul class="auth-legend">${authSummary({ endpoints: surface.endpoints })}</ul>`,
    groups.map((group) => groupSection({ group })).join(''),
    '</section>',
  ].join('')
}
