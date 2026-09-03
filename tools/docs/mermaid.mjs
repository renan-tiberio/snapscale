// A deliberately small subset of mermaid's flowchart grammar: exactly what
// docs/02-architecture.md uses. Anything outside it returns `{ error }`, and the
// caller falls back to printing the mermaid source instead of drawing a topology
// this parser did not fully understand.

const DIRECTION_ALIASES = { LR: 'LR', RL: 'RL', TB: 'TB', TD: 'TB', BT: 'BT' }

const NODE_SHAPES = [
  { shape: 'circle', pattern: /^\(\(([\s\S]*?)\)\)/ },
  { shape: 'cylinder', pattern: /^\[\(([\s\S]*?)\)\]/ },
  { shape: 'subroutine', pattern: /^\[\[([\s\S]*?)\]\]/ },
  { shape: 'rect', pattern: /^\["([\s\S]*?)"\]/ },
  { shape: 'rect', pattern: /^\[([\s\S]*?)\]/ },
  { shape: 'rhombus', pattern: /^\{([\s\S]*?)\}/ },
  { shape: 'round', pattern: /^\(([\s\S]*?)\)/ },
]

const EDGE_FORMS = [
  { pattern: /^--\s*"([^"]*)"\s*-->/, dashed: false, labelled: true },
  { pattern: /^-\.\s*"([^"]*)"\s*\.->/, dashed: true, labelled: true },
  { pattern: /^-->/, dashed: false, labelled: false },
  { pattern: /^-\.->/, dashed: true, labelled: false },
  { pattern: /^--([^>]*?)-->/, dashed: false, labelled: true },
  { pattern: /^-\.([^>]*?)\.->/, dashed: true, labelled: true },
]

const unescapeLabel = ({ raw }) =>
  raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/&quot;/g, '"')
    .trim()

const matchNode = ({ text }) => {
  const idMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
  if (idMatch === null) return null
  const rest = text.slice(idMatch[0].length)
  const shapeMatch = NODE_SHAPES.reduce((found, candidate) => {
    if (found !== null) return found
    const match = rest.match(candidate.pattern)
    if (match === null) return null
    return {
      shape: candidate.shape,
      label: unescapeLabel({ raw: match[1] }),
      length: match[0].length,
    }
  }, null)
  if (shapeMatch === null) {
    return {
      token: { type: 'node', id: idMatch[0], label: null, shape: null },
      length: idMatch[0].length,
    }
  }
  return {
    token: { type: 'node', id: idMatch[0], label: shapeMatch.label, shape: shapeMatch.shape },
    length: idMatch[0].length + shapeMatch.length,
  }
}

const matchEdge = ({ text }) =>
  EDGE_FORMS.reduce((found, form) => {
    if (found !== null) return found
    const match = text.match(form.pattern)
    if (match === null) return null
    return {
      token: {
        type: 'edge',
        dashed: form.dashed,
        label: form.labelled ? unescapeLabel({ raw: match[1] }) : '',
      },
      length: match[0].length,
    }
  }, null)

const tokenizeStatement = ({ line }) => {
  const walk = ({ text, tokens }) => {
    const trimmed = text.trimStart()
    if (trimmed === '') return { tokens }
    const edge = matchEdge({ text: trimmed })
    if (edge !== null) {
      return walk({ text: trimmed.slice(edge.length), tokens: [...tokens, edge.token] })
    }
    const node = matchNode({ text: trimmed })
    if (node !== null) {
      return walk({ text: trimmed.slice(node.length), tokens: [...tokens, node.token] })
    }
    return { tokens, error: `cannot parse "${trimmed}"` }
  }
  return walk({ text: line, tokens: [] })
}

const mergeNode = ({ nodes, token, clusterId }) => {
  const existing = nodes.find((node) => node.id === token.id)
  if (existing === undefined) {
    return [
      ...nodes,
      {
        id: token.id,
        label: token.label ?? token.id,
        shape: token.shape ?? 'rect',
        clusterId,
        declared: token.label !== null,
      },
    ]
  }
  // A node mentioned outside a subgraph and then again inside it belongs to the
  // subgraph — that is how `K6 --> ING` followed by `subgraph K3D … ING --> WEB`
  // reads in docs/02, and how mermaid itself resolves it. First claim wins.
  const claimed = existing.clusterId ?? clusterId
  if (existing.declared || token.label === null) {
    return nodes.map((node) => (node.id === token.id ? { ...node, clusterId: claimed } : node))
  }
  return nodes.map((node) =>
    node.id === token.id
      ? {
          ...node,
          label: token.label,
          shape: token.shape ?? 'rect',
          declared: true,
          clusterId: claimed,
        }
      : node,
  )
}

const applyStatement = ({ state, tokens }) => {
  const nodesAdded = tokens
    .filter((token) => token.type === 'node')
    .reduce(
      (nodes, token) => mergeNode({ nodes, token, clusterId: state.stack.at(-1) ?? null }),
      state.nodes,
    )
  const edgesAdded = tokens.reduce((accumulator, token, index) => {
    if (token.type !== 'edge') return accumulator
    const from = tokens[index - 1]
    const to = tokens[index + 1]
    if (from?.type !== 'node' || to?.type !== 'node') return accumulator
    return [...accumulator, { from: from.id, to: to.id, label: token.label, dashed: token.dashed }]
  }, state.edges)
  return { ...state, nodes: nodesAdded, edges: edgesAdded }
}

const parseSubgraphOpen = ({ line }) => {
  const match = line.match(
    /^subgraph\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\["([^"]*)"\]|\[([^\]]*)\])?\s*$/,
  )
  if (match === null) return null
  const rawLabel = match[2] ?? match[3] ?? match[1]
  return { id: match[1], label: unescapeLabel({ raw: rawLabel }) }
}

const IGNORED_STATEMENTS = /^(classDef|class|style|linkStyle|click|%%)/

export const parseFlowchart = ({ source }) => {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const header = lines[0] ?? ''
  const headerMatch = header.match(/^(?:flowchart|graph)\s+([A-Za-z]{2})$/)
  if (headerMatch === null) return { error: `unsupported header "${header}"` }
  const direction = DIRECTION_ALIASES[headerMatch[1]]
  if (direction === undefined) return { error: `unsupported direction "${headerMatch[1]}"` }

  const parsed = lines.slice(1).reduce(
    (state, line) => {
      if (state.error !== null) return state
      if (IGNORED_STATEMENTS.test(line)) return state
      const open = parseSubgraphOpen({ line })
      if (open !== null) {
        if (state.stack.length > 0) return { ...state, error: 'nested subgraphs are not supported' }
        return {
          ...state,
          clusters: [...state.clusters, { id: open.id, label: open.label }],
          stack: [...state.stack, open.id],
        }
      }
      if (line === 'end') {
        if (state.stack.length === 0) return { ...state, error: 'unbalanced subgraph end' }
        return { ...state, stack: state.stack.slice(0, -1) }
      }
      const { tokens, error } = tokenizeStatement({ line })
      if (error !== undefined) return { ...state, error }
      return applyStatement({ state, tokens })
    },
    { nodes: [], edges: [], clusters: [], stack: [], error: null },
  )

  if (parsed.error !== null) return { error: parsed.error }
  if (parsed.stack.length > 0) return { error: 'unterminated subgraph' }
  const clusterIds = parsed.clusters.map((cluster) => cluster.id)
  return {
    direction,
    // A subgraph id can also be an edge endpoint, in which case the tokenizer
    // recorded it as a bare node. Those stand-ins are dropped: the cluster box
    // is the real thing, and layout resolves the edge against it.
    nodes: parsed.nodes.filter((node) => !clusterIds.includes(node.id)),
    edges: parsed.edges,
    clusters: parsed.clusters.map((cluster) => ({
      ...cluster,
      memberIds: parsed.nodes
        .filter((node) => node.clusterId === cluster.id)
        .map((node) => node.id),
    })),
  }
}
