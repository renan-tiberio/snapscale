import { layoutFlowchart, CLUSTER_FONT_SIZE, EDGE_FONT_SIZE, NODE_FONT_SIZE } from './layout.mjs'
import { parseFlowchart } from './mermaid.mjs'
import { renderInline } from './markdown.mjs'
import { escapeHtml, round } from './text.mjs'

const CYLINDER_CAP = 7
const SUBROUTINE_INSET = 6
const CORNER_RADIUS = 7
const BASELINE_RATIO = 0.35
const ARROW_LENGTH = 8
const ARROW_WIDTH = 7

const plainText = ({ value }) => value.replace(/`/g, '')

const point = ({ x, y }) => `${round({ value: x })},${round({ value: y })}`

const textLines = ({ box, fontSize, lineHeight }) => {
  const centreX = box.x + box.w / 2
  const centreY = box.y + box.h / 2
  const firstBaseline =
    centreY - ((box.lines.length - 1) * lineHeight) / 2 + fontSize * BASELINE_RATIO
  return box.lines
    .map(
      (line, index) =>
        `<tspan x="${round({ value: centreX })}" y="${round({ value: firstBaseline + index * lineHeight })}">${escapeHtml({ value: line })}</tspan>`,
    )
    .join('')
}

const NODE_SHAPE_PAINTERS = {
  rect: ({ box }) =>
    `<rect class="dg-shape" x="${round({ value: box.x })}" y="${round({ value: box.y })}" width="${round({ value: box.w })}" height="${round({ value: box.h })}" rx="${CORNER_RADIUS}"/>`,
  round: ({ box }) =>
    `<rect class="dg-shape" x="${round({ value: box.x })}" y="${round({ value: box.y })}" width="${round({ value: box.w })}" height="${round({ value: box.h })}" rx="${round({ value: box.h / 2 })}"/>`,
  circle: ({ box }) =>
    `<ellipse class="dg-shape" cx="${round({ value: box.x + box.w / 2 })}" cy="${round({ value: box.y + box.h / 2 })}" rx="${round({ value: box.w / 2 })}" ry="${round({ value: box.h / 2 })}"/>`,
  cylinder: ({ box }) => {
    const radiusX = box.w / 2
    const top = box.y + CYLINDER_CAP
    const bottom = box.y + box.h - CYLINDER_CAP
    const body = [
      `M ${point({ x: box.x, y: top })}`,
      `A ${round({ value: radiusX })} ${CYLINDER_CAP} 0 0 0 ${point({ x: box.x + box.w, y: top })}`,
      `L ${point({ x: box.x + box.w, y: bottom })}`,
      `A ${round({ value: radiusX })} ${CYLINDER_CAP} 0 0 0 ${point({ x: box.x, y: bottom })}`,
      'Z',
    ].join(' ')
    const rim = `M ${point({ x: box.x, y: top })} A ${round({ value: radiusX })} ${CYLINDER_CAP} 0 0 1 ${point({ x: box.x + box.w, y: top })}`
    return `<path class="dg-shape" d="${body}"/><path class="dg-rim" d="${rim}"/>`
  },
  subroutine: ({ box }) => {
    const left = box.x + SUBROUTINE_INSET
    const right = box.x + box.w - SUBROUTINE_INSET
    return [
      `<rect class="dg-shape" x="${round({ value: box.x })}" y="${round({ value: box.y })}" width="${round({ value: box.w })}" height="${round({ value: box.h })}"/>`,
      `<path class="dg-rim" d="M ${point({ x: left, y: box.y })} L ${point({ x: left, y: box.y + box.h })}"/>`,
      `<path class="dg-rim" d="M ${point({ x: right, y: box.y })} L ${point({ x: right, y: box.y + box.h })}"/>`,
    ].join('')
  },
  rhombus: ({ box }) => {
    const corners = [
      { x: box.x + box.w / 2, y: box.y },
      { x: box.x + box.w, y: box.y + box.h / 2 },
      { x: box.x + box.w / 2, y: box.y + box.h },
      { x: box.x, y: box.y + box.h / 2 },
    ]
    return `<polygon class="dg-shape" points="${corners.map((corner) => point(corner)).join(' ')}"/>`
  },
}

const paintNode = ({ box, lineHeight }) => {
  const painter = NODE_SHAPE_PAINTERS[box.shape] ?? NODE_SHAPE_PAINTERS.rect
  return `<g>${painter({ box })}<text class="dg-node-text">${textLines({ box, fontSize: NODE_FONT_SIZE, lineHeight })}</text></g>`
}

const paintCluster = ({ box }) =>
  [
    `<rect class="dg-cluster" x="${round({ value: box.x })}" y="${round({ value: box.y })}" width="${round({ value: box.w })}" height="${round({ value: box.h })}" rx="${CORNER_RADIUS}"/>`,
    `<text class="dg-cluster-text" x="${round({ value: box.x + box.w / 2 })}" y="${round({ value: box.y + CLUSTER_FONT_SIZE + BASELINE_RATIO * CLUSTER_FONT_SIZE })}">${escapeHtml({ value: box.label })}</text>`,
  ].join('')

const paintEdge = ({ edge, markerId }) =>
  `<line class="dg-edge${edge.dashed ? ' dg-edge-dashed' : ''}" x1="${round({ value: edge.start.x })}" y1="${round({ value: edge.start.y })}" x2="${round({ value: edge.end.x })}" y2="${round({ value: edge.end.y })}" marker-end="url(#${markerId})"/>`

// Edge labels are painted after the nodes: a label on a long edge can end up
// over a box it flies over, and a label hidden under a box is a label the reader
// cannot check against the mermaid source.
const paintEdgeLabel = ({ edge, labelHeight }) => {
  if (edge.labelBox === null) return ''
  const { x, y, w } = edge.labelBox
  const background = `<rect class="dg-edge-label-bg" x="${round({ value: x - w / 2 })}" y="${round({ value: y - labelHeight / 2 })}" width="${round({ value: w })}" height="${labelHeight}" rx="3"/>`
  const text = `<text class="dg-edge-text" x="${round({ value: x })}" y="${round({ value: y + EDGE_FONT_SIZE * BASELINE_RATIO })}">${escapeHtml({ value: edge.label })}</text>`
  return `${background}${text}`
}

const describeGraph = ({ graph }) => {
  const nodes = graph.nodes.map((node) => node.label.replace(/\n/g, ' — ')).join('; ')
  const edges = graph.edges
    .map(
      (edge) =>
        `${edge.from} ${edge.dashed ? 'dashed' : 'solid'} arrow to ${edge.to}${edge.label === '' ? '' : ` labelled "${edge.label}"`}`,
    )
    .join('; ')
  const clusters = graph.clusters
    .map((cluster) => `${cluster.label} groups ${cluster.memberIds.join(', ')}`)
    .join('; ')
  return [`Nodes: ${nodes}.`, `Edges: ${edges}.`, clusters === '' ? '' : `Groups: ${clusters}.`]
    .filter((part) => part !== '')
    .join(' ')
}

const arrowMarker = ({ markerId }) =>
  `<defs><marker id="${markerId}" viewBox="0 0 ${ARROW_LENGTH} ${ARROW_WIDTH}" refX="${ARROW_LENGTH}" refY="${ARROW_WIDTH / 2}" markerWidth="${ARROW_LENGTH}" markerHeight="${ARROW_WIDTH}" orient="auto-start-reverse"><path class="dg-arrow" d="M 0 0 L ${ARROW_LENGTH} ${ARROW_WIDTH / 2} L 0 ${ARROW_WIDTH} Z"/></marker></defs>`

const sourceBlock = ({ source, path }) =>
  `<details class="src"><summary>mermaid source — ${escapeHtml({ value: path })}</summary><pre>${escapeHtml({ value: source })}</pre></details>`

// The mermaid source is the single source of truth for every topology, so the
// generator either lays that source out itself or prints it verbatim. It never
// draws a topology from anywhere else.
export const renderDiagram = ({ source, sourcePath, id, caption }) => {
  const graph = parseFlowchart({ source })
  const fallback = ({ reason }) =>
    [
      '<figure class="diagram">',
      `<p class="warn">Topology not drawn: ${escapeHtml({ value: reason })}. Its mermaid source, which is the source of truth, is printed instead.</p>`,
      `<pre>${escapeHtml({ value: source })}</pre>`,
      `<figcaption>${renderInline({ source: caption })} · <span class="muted">verbatim from ${escapeHtml({ value: sourcePath })}</span></figcaption>`,
      '</figure>',
    ].join('')
  if (graph.error !== undefined) return fallback({ reason: graph.error })
  const laid = layoutFlowchart({ graph })
  if (laid.error !== undefined) return fallback({ reason: laid.error })
  const markerId = `arrow-${id}`
  const titleId = `dg-title-${id}`
  const descriptionId = `dg-desc-${id}`
  const body = [
    arrowMarker({ markerId }),
    `<title id="${titleId}">${escapeHtml({ value: plainText({ value: caption }) })}</title>`,
    `<desc id="${descriptionId}">${escapeHtml({ value: describeGraph({ graph }) })}</desc>`,
    laid.boxes
      .filter((box) => box.kind === 'cluster')
      .map((box) => paintCluster({ box }))
      .join(''),
    laid.edges.map((edge) => paintEdge({ edge, markerId })).join(''),
    laid.boxes
      .filter((box) => box.kind === 'node')
      .map((box) => paintNode({ box, lineHeight: laid.lineHeight }))
      .join(''),
    laid.edges.map((edge) => paintEdgeLabel({ edge, labelHeight: laid.labelHeight })).join(''),
  ].join('')
  return [
    '<figure class="diagram">',
    `<svg class="dg" role="img" aria-labelledby="${titleId}" aria-describedby="${descriptionId}" viewBox="0 0 ${round({ value: laid.width })} ${round({ value: laid.height })}" width="${round({ value: laid.width })}" height="${round({ value: laid.height })}">${body}</svg>`,
    `<figcaption>${renderInline({ source: caption })} · <span class="muted">flowchart ${laid.direction}, ${graph.nodes.length} nodes, ${graph.edges.length} edges — parsed from ${escapeHtml({ value: sourcePath })} and laid out by <code>tools/build-docs.mjs</code></span></figcaption>`,
    sourceBlock({ source, path: sourcePath }),
    '</figure>',
  ].join('')
}
