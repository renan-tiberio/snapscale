import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The API surface, taken from the OpenAPI document the running app builds, with the
 * hand-written table in the design doc parsed alongside it purely to cross-check.
 * Reads the repo and returns data: renders nothing, prints nothing, writes nothing.
 */

const SPEC_SCRIPT = join('apps', 'api', 'scripts', 'openapi.ts')
const SPEC_RUNNER = join('apps', 'api', 'node_modules', '.bin', 'tsx')
const SPEC_CWD = join('apps', 'api')
const SPEC_TIMEOUT_MS = 60_000 // 1 minute
const SPEC_MAX_BUFFER_BYTES = 16_777_216 // 16 MB

const DESIGN_DOC = join('docs', '03-technical-design.md')
const DESIGN_DOC_REF = `${DESIGN_DOC.replaceAll('\\', '/')} §4`
const DESIGN_DOC_SECTION = '## 4. API contracts'

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']

/** RFC 9110 reason phrases, so a status column reads as prose instead of three digits. */
const STATUS_REASONS = {
  200: 'OK',
  304: 'Not Modified',
  401: 'Unauthorized',
  404: 'Not Found',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
}

const readTextFile = ({ absolutePath }) => {
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// OpenAPI — built from the live route registrations
// ---------------------------------------------------------------------------

/**
 * A child process rather than an import: the app is TypeScript behind path aliases and
 * this file is plain ESM run by `node`. The script only builds the app in memory, so it
 * needs neither Postgres nor SMTP nor a port.
 */
const runSpecGenerator = ({ repoRoot }) => {
  const runner = join(repoRoot, SPEC_RUNNER)
  if (!existsSync(runner)) {
    return { ok: false, message: `${SPEC_RUNNER} is missing — dependencies are not installed` }
  }
  if (!existsSync(join(repoRoot, SPEC_SCRIPT))) {
    return { ok: false, message: `${SPEC_SCRIPT} is missing` }
  }

  try {
    const stdout = execFileSync(runner, [join('scripts', 'openapi.ts')], {
      cwd: join(repoRoot, SPEC_CWD),
      encoding: 'utf8',
      timeout: SPEC_TIMEOUT_MS,
      maxBuffer: SPEC_MAX_BUFFER_BYTES,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { ok: true, spec: JSON.parse(stdout) }
  } catch (error) {
    return { ok: false, message: error.message.split('\n')[0] }
  }
}

/** OpenAPI templates a path as `/albums/{id}`; every other document in this repo writes `:id`. */
const toRoutePath = ({ specPath }) =>
  specPath.replaceAll('{*}', '*').replaceAll(/\{([^}]+)\}/gu, ':$1')

const formatObjectShape = ({ schema }) => {
  const properties = schema?.properties
  if (properties === undefined) return null
  const required = schema.required ?? []
  const fields = Object.keys(properties).map((name) =>
    required.includes(name) ? name : `${name}?`,
  )
  return `{ ${fields.join(', ')} }`
}

const parametersIn = ({ operation, location }) =>
  (operation.parameters ?? []).filter((parameter) => parameter.in === location)

const describePathParams = ({ operation }) => {
  const params = parametersIn({ operation, location: 'path' })
  if (params.length === 0) return null
  return `path \`${params.map((parameter) => parameter.name).join(', ')}\``
}

const describeQueryParams = ({ operation }) => {
  const params = parametersIn({ operation, location: 'query' })
  if (params.length === 0) return null
  const names = params.map((parameter) =>
    parameter.required ? parameter.name : `${parameter.name}?`,
  )
  return `query \`${names.join(', ')}\``
}

const firstContent = ({ container }) => {
  const entries = Object.entries(container?.content ?? {})
  if (entries.length === 0) return null
  const [mediaType, media] = entries[0]
  return { mediaType, schema: media.schema }
}

const describeRequestBody = ({ operation }) => {
  const content = firstContent({ container: operation.requestBody })
  if (content === null) return null
  const label = content.mediaType === 'application/json' ? 'body' : content.mediaType
  const shape = formatObjectShape({ schema: content.schema })
  return shape === null ? label : `${label} \`${shape}\``
}

const describeRequest = ({ operation }) =>
  [
    describePathParams({ operation }),
    describeQueryParams({ operation }),
    describeRequestBody({ operation }),
  ]
    .filter((part) => part !== null)
    .join('; ')

/**
 * `@fastify/swagger` fills every response `description` with the literal string "Default
 * Response", so the declared shape is the only real information a status carries here.
 */
const describeResponse = ({ status, response }) => {
  const content = firstContent({ container: response })
  const shape = content === null ? null : formatObjectShape({ schema: content.schema })
  const body =
    content === null
      ? 'no response schema declared'
      : `${content.mediaType}${shape === null ? '' : ` \`${shape}\``}`
  const reason = STATUS_REASONS[status]
  return reason === undefined ? body : `${reason} — ${body}`
}

const responsesFromSpec = ({ operation }) =>
  Object.entries(operation.responses ?? {})
    .map(([status, response]) => ({
      status: Number(status),
      description: describeResponse({ status: Number(status), response }),
    }))
    .toSorted((left, right) => left.status - right.status)

const fieldNamesFromSpec = ({ operation }) => {
  const parameterNames = (operation.parameters ?? []).map((parameter) => parameter.name)
  const body = firstContent({ container: operation.requestBody })
  const bodyNames = Object.keys(body?.schema?.properties ?? {})
  return [...parameterNames, ...bodyNames].filter((name) => name !== '*')
}

const endpointsFromSpec = ({ spec }) =>
  Object.entries(spec.paths ?? {}).flatMap(([specPath, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.includes(method.toUpperCase()))
      .map(([method, operation]) => ({
        method: method.toUpperCase(),
        path: toRoutePath({ specPath }),
        summary: operation.description ?? operation.summary ?? '',
        request: describeRequest({ operation }),
        responses: responsesFromSpec({ operation }),
        fields: fieldNamesFromSpec({ operation }),
      })),
  )

// ---------------------------------------------------------------------------
// The hand-written contract table in the design doc
// ---------------------------------------------------------------------------

const TABLE_SEPARATOR = /^\|[\s:|-]+\|$/u
const BACKTICKED = /`([^`]+)`/u
const ENDPOINT_SEPARATOR = '·'
const EMPTY_CELL_MARKERS = ['—', '-', '']
const SUCCESS_STATUS = 200

const tableRows = ({ markdown }) => {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.startsWith(DESIGN_DOC_SECTION))
  if (start === -1) return []
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines
    .slice(start, end === -1 ? lines.length : end)
    .filter((line) => line.startsWith('|') && !TABLE_SEPARATOR.test(line))
    .slice(1)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
}

const splitByEndpoint = ({ cell }) => cell.split(ENDPOINT_SEPARATOR).map((part) => part.trim())

/** One cell can describe several endpoints; when it does not, it describes all of them. */
const alignCell = ({ cell, count }) => {
  const parts = splitByEndpoint({ cell })
  return parts.length === count ? parts : Array.from({ length: count }, () => cell)
}

const documentedAuth = ({ cell }) => {
  const text = cell.toLowerCase()
  if (text.startsWith('no')) return 'none'
  if (text.includes('`file`')) return 'session or file token'
  if (text.includes('header only')) return 'session (header only)'
  return 'session'
}

const cleanCell = ({ cell }) => (EMPTY_CELL_MARKERS.includes(cell.trim()) ? '' : cell.trim())

const QUERY_FIELDS = /\?([A-Za-z][A-Za-z0-9_&=]*)/gu
const OBJECT_FIELDS = /\{([^}]*)\}/gu
const BODY_METHODS = ['POST', 'PATCH', 'PUT']

const splitFieldNames = ({ names }) =>
  names.map((name) => name.trim().replace('?', '').replace('=', '')).filter((name) => name !== '')

/** Only the shapes the table writes literally — `?a&b` and `{ a, b? }`; prose is handled below. */
const documentedFieldNames = ({ text }) => ({
  query: splitFieldNames({
    names: [...text.matchAll(QUERY_FIELDS)].flatMap((match) => match[1].split('&')),
  }),
  body: splitFieldNames({
    names: [...text.matchAll(OBJECT_FIELDS)].flatMap((match) => match[1].split(',')),
  }),
})

/**
 * `GET /albums/:id` · `PATCH` · `DELETE`: the table names the path once and lets the methods
 * after it inherit it, so a row is read left to right carrying the last path seen.
 */
const parseEndpointCell = ({ cell }) =>
  splitByEndpoint({ cell }).reduce((accumulator, chunk) => {
    const token = chunk.match(BACKTICKED)?.[1]
    if (token === undefined) return accumulator
    const [method, written] = token.split(/\s+/u)
    if (!HTTP_METHODS.includes(method)) return accumulator
    const inherited = written ?? accumulator.at(-1)?.written
    const [path, query] = (inherited ?? '').split('?')
    return [...accumulator, { method, path, written: inherited, query: query ?? '' }]
  }, [])

/**
 * `partial { name?, description? }` sits in a row shared by GET, PATCH and DELETE and can only
 * mean the PATCH: the other two carry no request body. Attributing it to all three would invent
 * a mismatch with the code that the table never claimed.
 */
const parseDocumentedRow = ({ cells }) => {
  const [endpointCell, authCell, paramsCell, successCell] = cells
  const parsed = parseEndpointCell({ cell: endpointCell ?? '' })
  if (parsed.length === 0) return []

  const params = alignCell({ cell: paramsCell ?? '', count: parsed.length })
  const success = alignCell({ cell: successCell ?? '', count: parsed.length })
  const isCellShared = splitByEndpoint({ cell: paramsCell ?? '' }).length !== parsed.length
  const rowText = cells.join(' ')

  return parsed.map((endpoint, index) => {
    const documented = documentedFieldNames({ text: `?${endpoint.query} ${params[index]}` })
    const ownsBody = BODY_METHODS.includes(endpoint.method) || !isCellShared
    const hasSharedBody = isCellShared && documented.body.length > 0

    return {
      method: endpoint.method,
      path: endpoint.path,
      auth: documentedAuth({ cell: authCell ?? '' }),
      summary: '',
      request: ownsBody || !hasSharedBody ? cleanCell({ cell: params[index] }) : '',
      responses: [
        {
          status: SUCCESS_STATUS,
          description: `OK — ${cleanCell({ cell: success[index] }) || 'not described'}`,
        },
      ],
      fields: ownsBody ? [...documented.query, ...documented.body] : documented.query,
      rowText,
    }
  })
}

const endpointsFromDesignDoc = ({ repoRoot }) => {
  const markdown = readTextFile({ absolutePath: join(repoRoot, DESIGN_DOC) })
  if (markdown === null) return []
  return tableRows({ markdown }).flatMap((cells) => parseDocumentedRow({ cells }))
}

// ---------------------------------------------------------------------------
// Cross-check
// ---------------------------------------------------------------------------

const endpointKey = ({ endpoint }) => `${endpoint.method} ${endpoint.path}`

/**
 * A field the table only names in prose (`multipart: file + ...`) is not drift, so a missing
 * one is reported only when the row never says the word at all.
 */
const fieldDrift = ({ documented, fromSpec }) => {
  const key = endpointKey({ endpoint: fromSpec })
  const rowText = documented.rowText.toLowerCase()
  const undocumented = fromSpec.fields.filter((name) => !rowText.includes(name.toLowerCase()))
  const unimplemented = documented.fields.filter((name) => !fromSpec.fields.includes(name))

  return [
    ...undocumented.map(
      (name) => `\`${key}\` accepts \`${name}\`, which ${DESIGN_DOC_REF} never names in that row.`,
    ),
    ...unimplemented.map(
      (name) =>
        `${DESIGN_DOC_REF} lists \`${name}\` for \`${key}\`, but the API declares no such field.`,
    ),
  ]
}

const compareSources = ({ specEndpoints, documentedEndpoints }) => {
  const documentedByKey = new Map(
    documentedEndpoints.map((endpoint) => [endpointKey({ endpoint }), endpoint]),
  )
  const specKeys = new Set(specEndpoints.map((endpoint) => endpointKey({ endpoint })))

  const missingFromDoc = specEndpoints
    .filter((endpoint) => !documentedByKey.has(endpointKey({ endpoint })))
    .map(
      (endpoint) =>
        `\`${endpointKey({ endpoint })}\` is registered by the API but has no row in ${DESIGN_DOC_REF}.`,
    )

  const missingFromApi = documentedEndpoints
    .filter((endpoint) => !specKeys.has(endpointKey({ endpoint })))
    .map(
      (endpoint) =>
        `${DESIGN_DOC_REF} documents \`${endpointKey({ endpoint })}\`, but the API registers no such route.`,
    )

  const fields = specEndpoints.flatMap((endpoint) => {
    const documented = documentedByKey.get(endpointKey({ endpoint }))
    return documented === undefined ? [] : fieldDrift({ documented, fromSpec: endpoint })
  })

  return [...missingFromDoc, ...missingFromApi, ...fields]
}

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

const UNDOCUMENTED_AUTH = 'not documented'

const SPEC_NOTE =
  'Generated by `apps/api/scripts/openapi.ts`, which builds the real Fastify app and calls ' +
  '`app.swagger()`, so methods, paths, parameters and response shapes come from the same zod ' +
  'schemas that validate live requests; the document declares no security scheme, so the auth ' +
  `column is the one value read from ${DESIGN_DOC_REF}.`

const documentedNote = ({ reason }) =>
  `Parsed from the hand-written table in ${DESIGN_DOC_REF} — documentation rather than the ` +
  `running contract, and free to drift from it: the OpenAPI document could not be generated ` +
  `(${reason}), so no cross-check ran.`

const toPublicEndpoint = ({ endpoint, auth }) => ({
  method: endpoint.method,
  path: endpoint.path,
  auth,
  summary: endpoint.summary,
  request: endpoint.request,
  responses: endpoint.responses,
})

export const collectApiSurface = async ({ repoRoot }) => {
  const documentedEndpoints = endpointsFromDesignDoc({ repoRoot })
  const generated = runSpecGenerator({ repoRoot })

  if (!generated.ok) {
    return {
      source: 'documented',
      sourceNote: documentedNote({ reason: generated.message }),
      endpoints: documentedEndpoints.map((endpoint) =>
        toPublicEndpoint({ endpoint, auth: endpoint.auth }),
      ),
      drift: [],
    }
  }

  const specEndpoints = endpointsFromSpec({ spec: generated.spec })
  const authByKey = new Map(
    documentedEndpoints.map((endpoint) => [endpointKey({ endpoint }), endpoint.auth]),
  )

  return {
    source: 'openapi',
    sourceNote: SPEC_NOTE,
    endpoints: specEndpoints.map((endpoint) =>
      toPublicEndpoint({
        endpoint,
        auth: authByKey.get(endpointKey({ endpoint })) ?? UNDOCUMENTED_AUTH,
      }),
    ),
    drift: compareSources({ specEndpoints, documentedEndpoints }),
  }
}
