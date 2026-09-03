import { widestLine } from './text.mjs'

// A layered ("Sugiyama-lite") layout: rank by longest path from the sources,
// order each rank by the barycentre of its predecessors, then place ranks along
// the flow axis. It is enough for the flowcharts in docs/02-architecture.md and
// it deliberately fails loudly (via `layoutFlowchart` returning an error) rather
// than drawing a topology it cannot place.

export const NODE_FONT_SIZE = 13
export const EDGE_FONT_SIZE = 11
export const CLUSTER_FONT_SIZE = 12

const NODE_LINE_HEIGHT = 17
const NODE_PAD_X = 13
const NODE_PAD_Y = 9
const NODE_MIN_WIDTH = 56
const BASE_RANK_GAP = 72
const EDGE_LABEL_PAD = 26
const CROSS_GAP = 28
const CLUSTER_PAD = 18
const CLUSTER_TITLE_HEIGHT = 24
const DIAGRAM_MARGIN = 12

const SHAPE_EXTRA = {
  rect: { x: 0, y: 0 },
  round: { x: 8, y: 0 },
  circle: { x: 18, y: 14 },
  cylinder: { x: 6, y: 14 },
  subroutine: { x: 16, y: 0 },
  rhombus: { x: 26, y: 14 },
}

const SUPPORTED_DIRECTIONS = ['LR', 'TB']

const measureNode = ({ node }) => {
  const lines = node.label.split('\n')
  const extra = SHAPE_EXTRA[node.shape] ?? SHAPE_EXTRA.rect
  return {
    ...node,
    lines,
    w: Math.max(
      NODE_MIN_WIDTH,
      widestLine({ lines, fontSize: NODE_FONT_SIZE }) + NODE_PAD_X * 2 + extra.x,
    ),
    h: lines.length * NODE_LINE_HEIGHT + NODE_PAD_Y * 2 + extra.y,
  }
}

const rankOf = ({ id, predecessors, visiting }) => {
  if (visiting.has(id)) return 0
  const parents = predecessors[id] ?? []
  if (parents.length === 0) return 0
  const nextVisiting = new Set([...visiting, id])
  return parents.reduce(
    (deepest, parent) =>
      Math.max(deepest, rankOf({ id: parent, predecessors, visiting: nextVisiting }) + 1),
    0,
  )
}

const computeRanks = ({ entities, edges }) => {
  const empty = entities.reduce((accumulator, entity) => ({ ...accumulator, [entity.id]: [] }), {})
  const predecessors = edges.reduce(
    (accumulator, edge) => ({ ...accumulator, [edge.to]: [...accumulator[edge.to], edge.from] }),
    empty,
  )
  return entities.reduce(
    (accumulator, entity) => ({
      ...accumulator,
      [entity.id]: rankOf({ id: entity.id, predecessors, visiting: new Set() }),
    }),
    {},
  )
}

const barycentre = ({ id, edges, placement }) => {
  const parents = edges.filter((edge) => edge.to === id).map((edge) => placement[edge.from])
  const known = parents.filter((position) => position !== undefined)
  if (known.length === 0) return null
  return known.reduce((sum, position) => sum + position, 0) / known.length
}

// Ranks are ordered front to back so a rank can lean on the rank before it;
// within a rank, declaration order breaks every tie, which is what makes two
// runs of the generator produce the same bytes.
const orderRanks = ({ entities, ranks, edges }) => {
  const rankNumbers = [...new Set(entities.map((entity) => ranks[entity.id]))].toSorted(
    (left, right) => left - right,
  )
  return rankNumbers.reduce(
    (accumulator, rank) => {
      const members = entities
        .map((entity, index) => ({ entity, index }))
        .filter((candidate) => ranks[candidate.entity.id] === rank)
      const ordered = members
        .map((candidate) => ({
          ...candidate,
          weight: barycentre({ id: candidate.entity.id, edges, placement: accumulator.placement }),
        }))
        .toSorted((left, right) => {
          if (left.weight === right.weight) return left.index - right.index
          if (left.weight === null) return 1
          if (right.weight === null) return -1
          return left.weight - right.weight
        })
        .map((candidate) => candidate.entity)
      return {
        rows: [...accumulator.rows, { rank, entities: ordered }],
        placement: ordered.reduce(
          (placement, entity, position) => ({ ...placement, [entity.id]: position }),
          accumulator.placement,
        ),
      }
    },
    { rows: [], placement: {} },
  )
}

const rankGaps = ({ rows, ranks, edges, direction }) =>
  rows.slice(0, -1).map((row) => {
    const crossing = edges.filter(
      (edge) =>
        ranks[edge.from] === row.rank && ranks[edge.to] === row.rank + 1 && edge.label !== '',
    )
    if (direction === 'TB' || crossing.length === 0) return BASE_RANK_GAP
    const widest = crossing.reduce(
      (accumulator, edge) =>
        Math.max(accumulator, widestLine({ lines: [edge.label], fontSize: EDGE_FONT_SIZE })),
      0,
    )
    return Math.max(BASE_RANK_GAP, widest + EDGE_LABEL_PAD)
  })

const placeRows = ({ rows, gaps, direction }) => {
  const flowSize = (entity) => (direction === 'LR' ? entity.w : entity.h)
  const crossSize = (entity) => (direction === 'LR' ? entity.h : entity.w)
  const rowFlow = rows.map((row) =>
    row.entities.reduce((biggest, entity) => Math.max(biggest, flowSize(entity)), 0),
  )
  const rowCross = rows.map(
    (row) =>
      row.entities.reduce((total, entity) => total + crossSize(entity), 0) +
      CROSS_GAP * (row.entities.length - 1),
  )
  const crossExtent = rowCross.reduce((biggest, size) => Math.max(biggest, size), 0)
  const flowOffsets = rows.reduce(
    (offsets, _row, index) =>
      index === 0 ? [0] : [...offsets, offsets[index - 1] + rowFlow[index - 1] + gaps[index - 1]],
    [],
  )
  const positions = rows.reduce((accumulator, row, rowIndex) => {
    const crossStart = (crossExtent - rowCross[rowIndex]) / 2
    return row.entities.reduce((inner, entity, entityIndex) => {
      const before = row.entities
        .slice(0, entityIndex)
        .reduce((total, previous) => total + crossSize(previous) + CROSS_GAP, 0)
      const flow = flowOffsets[rowIndex] + (rowFlow[rowIndex] - flowSize(entity)) / 2
      const cross = crossStart + before
      return {
        ...inner,
        [entity.id]: direction === 'LR' ? { x: flow, y: cross } : { x: cross, y: flow },
      }
    }, accumulator)
  }, {})
  const flowExtent = flowOffsets.at(-1) + rowFlow.at(-1)
  return {
    positions,
    width: direction === 'LR' ? flowExtent : crossExtent,
    height: direction === 'LR' ? crossExtent : flowExtent,
  }
}

const layoutFlat = ({ entities, edges, direction }) => {
  const internal = edges.filter(
    (edge) =>
      edge.from !== edge.to &&
      entities.some((entity) => entity.id === edge.from) &&
      entities.some((entity) => entity.id === edge.to),
  )
  const ranks = computeRanks({ entities, edges: internal })
  const { rows } = orderRanks({ entities, ranks, edges: internal })
  const gaps = rankGaps({ rows, ranks, edges: internal, direction })
  return placeRows({ rows, gaps, direction })
}

const boundaryPoint = ({ box, toward }) => {
  const centreX = box.x + box.w / 2
  const centreY = box.y + box.h / 2
  const deltaX = toward.x - centreX
  const deltaY = toward.y - centreY
  if (deltaX === 0 && deltaY === 0) return { x: centreX, y: centreY }
  const scaleX = deltaX === 0 ? Number.POSITIVE_INFINITY : box.w / 2 / Math.abs(deltaX)
  const scaleY = deltaY === 0 ? Number.POSITIVE_INFINITY : box.h / 2 / Math.abs(deltaY)
  const scale = Math.min(scaleX, scaleY)
  return { x: centreX + deltaX * scale, y: centreY + deltaY * scale }
}

const LABEL_STOPS = [0.5, 0.38, 0.62, 0.26, 0.74]
const LABEL_NUDGES = [0, 13, -13, 26, -26]
const LABEL_HEIGHT = 16
const LABEL_TEXT_PAD = 8

const overlaps = ({ rect, box }) =>
  rect.x < box.x + box.w &&
  rect.x + rect.w > box.x &&
  rect.y < box.y + box.h &&
  rect.y + rect.h > box.y

// A label at the midpoint of a long edge can land on top of a box that edge
// flies over, and edge labels are painted last, so an unchecked label would
// erase a node's text. Candidates walk out from the midpoint, nudged
// perpendicular to the line, and the first one clear of every box wins.
const labelPosition = ({ start, end, label, boxes }) => {
  const width = widestLine({ lines: [label], fontSize: EDGE_FONT_SIZE }) + LABEL_TEXT_PAD
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const normal =
    length === 0
      ? { x: 0, y: 0 }
      : { x: -(end.y - start.y) / length, y: (end.x - start.x) / length }
  const candidates = LABEL_STOPS.flatMap((stop) =>
    LABEL_NUDGES.map((nudge) => ({
      x: start.x + (end.x - start.x) * stop + normal.x * nudge,
      y: start.y + (end.y - start.y) * stop + normal.y * nudge,
    })),
  )
  const clear = candidates.find(
    (centre) =>
      !boxes.some((box) =>
        overlaps({
          rect: {
            x: centre.x - width / 2,
            y: centre.y - LABEL_HEIGHT / 2,
            w: width,
            h: LABEL_HEIGHT,
          },
          box,
        }),
      ),
  )
  return { ...(clear ?? candidates[0]), w: width }
}

export const layoutFlowchart = ({ graph }) => {
  if (!SUPPORTED_DIRECTIONS.includes(graph.direction)) {
    return { error: `direction ${graph.direction} is not laid out` }
  }
  const measured = graph.nodes.map((node) => measureNode({ node }))
  const clusterBoxes = graph.clusters.map((cluster) => {
    const members = measured.filter((node) => cluster.memberIds.includes(node.id))
    const inner = layoutFlat({
      entities: members,
      edges: graph.edges,
      direction: graph.direction,
    })
    return {
      ...cluster,
      kind: 'cluster',
      inner,
      w: inner.width + CLUSTER_PAD * 2,
      h: inner.height + CLUSTER_PAD * 2 + CLUSTER_TITLE_HEIGHT,
    }
  })
  const topLevel = measured.filter((node) => node.clusterId === null)
  const clusterOf = (id) => clusterBoxes.find((cluster) => cluster.memberIds.includes(id))
  const representative = (id) => clusterOf(id)?.id ?? id
  const outerEntities = [...topLevel.map((node) => ({ ...node, kind: 'node' })), ...clusterBoxes]
  const outerEdges = graph.edges.map((edge) => ({
    ...edge,
    from: representative(edge.from),
    to: representative(edge.to),
  }))
  const outer = layoutFlat({
    entities: outerEntities,
    edges: outerEdges,
    direction: graph.direction,
  })

  const placedOuter = outerEntities.map((entity) => ({
    ...entity,
    x: outer.positions[entity.id].x + DIAGRAM_MARGIN,
    y: outer.positions[entity.id].y + DIAGRAM_MARGIN,
  }))
  const placedMembers = placedOuter
    .filter((entity) => entity.kind === 'cluster')
    .flatMap((cluster) =>
      measured
        .filter((node) => cluster.memberIds.includes(node.id))
        .map((node) => ({
          ...node,
          kind: 'node',
          x: cluster.x + CLUSTER_PAD + cluster.inner.positions[node.id].x,
          y: cluster.y + CLUSTER_TITLE_HEIGHT + CLUSTER_PAD + cluster.inner.positions[node.id].y,
        })),
    )
  const boxes = [...placedOuter, ...placedMembers]
  const boxOf = (id) => boxes.find((box) => box.id === id)

  const unresolved = graph.edges.filter(
    (edge) => boxOf(edge.from) === undefined || boxOf(edge.to) === undefined,
  )
  if (unresolved.length > 0) {
    return {
      error: `edge endpoints not placed: ${unresolved.map((edge) => `${edge.from}->${edge.to}`).join(', ')}`,
    }
  }

  const edges = graph.edges.map((edge) => {
    const fromBox = boxOf(edge.from)
    const toBox = boxOf(edge.to)
    const fromCentre = { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h / 2 }
    const toCentre = { x: toBox.x + toBox.w / 2, y: toBox.y + toBox.h / 2 }
    const start = boundaryPoint({ box: fromBox, toward: toCentre })
    const end = boundaryPoint({ box: toBox, toward: fromCentre })
    return {
      ...edge,
      start,
      end,
      labelBox: edge.label === '' ? null : labelPosition({ start, end, label: edge.label, boxes }),
    }
  })

  return {
    direction: graph.direction,
    boxes,
    edges,
    width: outer.width + DIAGRAM_MARGIN * 2,
    height: outer.height + DIAGRAM_MARGIN * 2,
    labelHeight: LABEL_HEIGHT,
    clusterTitleHeight: CLUSTER_TITLE_HEIGHT,
    lineHeight: NODE_LINE_HEIGHT,
  }
}
