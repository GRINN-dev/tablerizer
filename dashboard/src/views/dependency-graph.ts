import { Array } from 'effect'
import { Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import { ChangedGraphSearch } from '../messages.js'
import type { DependencyNode } from '../model.js'

const h = html<Message>()

const NODE_W = 180
const NODE_H = 36
const LAYER_GAP_Y = 70
const NODE_GAP_X = 24
const PAD_X = 30
const PAD_Y = 30
const MAX_COLS = 6

type LayoutNode = Readonly<{
  name: string
  x: number
  y: number
  layer: number
  calls: ReadonlyArray<string>
  calledBy: ReadonlyArray<string>
}>

type LayoutEdge = Readonly<{
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}>

const assignLayers = (
  graph: ReadonlyArray<DependencyNode>,
): Map<string, number> => {
  const layers = new Map<string, number>()
  const byName = new Map(graph.map((n) => [n.name, n]))
  const visiting = new Set<string>()

  const visit = (name: string, depth: number): number => {
    if (visiting.has(name)) return depth
    const existing = layers.get(name)
    if (existing !== undefined && existing >= depth) return existing
    layers.set(name, depth)
    const node = byName.get(name)
    if (!node) return depth
    visiting.add(name)
    let maxChild = depth
    for (const callee of node.calls) {
      maxChild = Math.max(maxChild, visit(callee, depth + 1))
    }
    visiting.delete(name)
    return maxChild
  }

  const roots = graph.filter((n) => n.calledBy.length === 0)
  if (roots.length === 0 && graph.length > 0) {
    visit(graph[0].name, 0)
  }
  for (const root of roots) {
    visit(root.name, 0)
  }
  for (const node of graph) {
    if (!layers.has(node.name)) {
      visit(node.name, 0)
    }
  }
  return layers
}

const layoutGraph = (
  graph: ReadonlyArray<DependencyNode>,
): Readonly<{ nodes: ReadonlyArray<LayoutNode>; edges: ReadonlyArray<LayoutEdge>; width: number; height: number }> => {
  if (graph.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 }
  }

  const layers = assignLayers(graph)
  const maxLayer = Math.max(...layers.values())

  const layerBuckets: string[][] = []
  for (let i = 0; i <= maxLayer; i++) layerBuckets.push([])
  for (const [name, layer] of layers) {
    layerBuckets[layer].push(name)
  }

  for (const bucket of layerBuckets) bucket.sort()

  const byName = new Map(graph.map((n) => [n.name, n]))
  const positions = new Map<string, { x: number; y: number }>()

  const clampedBucketWidths = layerBuckets.map((b) => Math.min(b.length, MAX_COLS))
  const maxBucketWidth = Math.max(...clampedBucketWidths)
  const totalWidth = maxBucketWidth * (NODE_W + NODE_GAP_X) - NODE_GAP_X + PAD_X * 2

  let cumulativeY = PAD_Y
  for (let layer = 0; layer <= maxLayer; layer++) {
    const bucket = layerBuckets[layer]
    const rowCount = Math.ceil(bucket.length / MAX_COLS)
    for (let i = 0; i < bucket.length; i++) {
      const row = Math.floor(i / MAX_COLS)
      const col = i % MAX_COLS
      const colsInRow = Math.min(bucket.length - row * MAX_COLS, MAX_COLS)
      const rowWidth = colsInRow * (NODE_W + NODE_GAP_X) - NODE_GAP_X
      const offsetX = (totalWidth - rowWidth) / 2
      positions.set(bucket[i], {
        x: offsetX + col * (NODE_W + NODE_GAP_X),
        y: cumulativeY + row * (NODE_H + 8),
      })
    }
    cumulativeY += rowCount * (NODE_H + 8) - 8 + LAYER_GAP_Y
  }

  for (let pass = 0; pass < 4; pass++) {
    const direction = pass % 2 === 0 ? 1 : -1
    const start = direction === 1 ? 0 : maxLayer
    const end = direction === 1 ? maxLayer + 1 : -1

    for (let layer = start; layer !== end; layer += direction) {
      const bucket = layerBuckets[layer]
      const barycenters = new Map<string, number>()

      for (const name of bucket) {
        const node = byName.get(name)
        if (!node) continue
        const neighbors = direction === 1 ? node.calledBy : node.calls
        const neighborPositions = neighbors
          .map((n) => positions.get(n))
          .filter((p): p is { x: number; y: number } => p !== undefined)
        if (neighborPositions.length > 0) {
          const avg = neighborPositions.reduce((s, p) => s + p.x, 0) / neighborPositions.length
          barycenters.set(name, avg)
        }
      }

      bucket.sort((a, b) => {
        const ba = barycenters.get(a)
        const bb = barycenters.get(b)
        if (ba !== undefined && bb !== undefined) return ba - bb
        if (ba !== undefined) return -1
        if (bb !== undefined) return 1
        return a.localeCompare(b)
      })

      const rowCount = Math.ceil(bucket.length / MAX_COLS)
      const baseY = positions.get(bucket[0])!.y
      for (let i = 0; i < bucket.length; i++) {
        const row = Math.floor(i / MAX_COLS)
        const col = i % MAX_COLS
        const colsInRow = Math.min(bucket.length - row * MAX_COLS, MAX_COLS)
        const rowWidth = colsInRow * (NODE_W + NODE_GAP_X) - NODE_GAP_X
        const offsetX = (totalWidth - rowWidth) / 2
        const pos = positions.get(bucket[i])!
        pos.x = offsetX + col * (NODE_W + NODE_GAP_X)
        pos.y = baseY + row * (NODE_H + 8)
      }
    }
  }

  const nodes: LayoutNode[] = []
  for (const [name, pos] of positions) {
    const dep = byName.get(name)
    nodes.push({
      name,
      x: pos.x,
      y: pos.y,
      layer: layers.get(name) ?? 0,
      calls: dep?.calls ?? [],
      calledBy: dep?.calledBy ?? [],
    })
  }

  const edges: LayoutEdge[] = []
  for (const node of graph) {
    const fromPos = positions.get(node.name)
    if (!fromPos) continue
    for (const callee of node.calls) {
      const toPos = positions.get(callee)
      if (!toPos) continue
      edges.push({
        from: node.name,
        to: callee,
        x1: fromPos.x + NODE_W / 2,
        y1: fromPos.y + NODE_H,
        x2: toPos.x + NODE_W / 2,
        y2: toPos.y,
      })
    }
  }

  const maxY = Math.max(...[...positions.values()].map((p) => p.y))
  const height = maxY + NODE_H + PAD_Y
  return { nodes, edges, width: Math.max(totalWidth, 400), height: Math.max(height, 200) }
}

const edgePath = (e: LayoutEdge): string => {
  const midY = (e.y1 + e.y2) / 2
  return `M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`
}

const renderNode = (node: LayoutNode, matched: boolean): Html => {
  const isRoot = node.calledBy.length === 0 && node.calls.length > 0
  const isLeaf = node.calls.length === 0 && node.calledBy.length > 0
  const fill = isRoot ? '#4f46e5' : isLeaf ? '#059669' : '#7c3aed'
  return h.g(
    [
      h.Transform(`translate(${node.x}, ${node.y})`),
      h.Class('graph-node'),
      h.Attribute('data-name', node.name),
    ],
    [
      h.title([], [node.name]),
      matched
        ? h.rect([
            h.X('-3'),
            h.Y('-3'),
            h.Width(String(NODE_W + 6)),
            h.Height(String(NODE_H + 6)),
            h.Attribute('rx', '9'),
            h.Fill('none'),
            h.Stroke('#facc15'),
            h.StrokeWidth('3'),
          ], [])
        : h.empty,
      h.rect([
        h.Width(String(NODE_W)),
        h.Height(String(NODE_H)),
        h.Attribute('rx', '6'),
        h.Fill(fill),
      ], []),
      h.text(
        [
          h.X(String(NODE_W / 2)),
          h.Y(String(NODE_H / 2 + 1)),
          h.Fill('#ffffff'),
          h.Attribute('text-anchor', 'middle'),
          h.Attribute('dominant-baseline', 'middle'),
          h.Class('graph-node-label'),
          h.Style({ fontSize: '12px', fontFamily: 'monospace' }),
        ],
        [node.name.length > 22 ? node.name.slice(0, 20) + '..' : node.name],
      ),
    ],
  )
}

const ARROW_W = 5
const ARROW_H = 8

const renderEdge = (edge: LayoutEdge): Html =>
  h.g(
    [
      h.Class('graph-edge'),
      h.Attribute('data-from', edge.from),
      h.Attribute('data-to', edge.to),
    ],
    [
      h.path([h.D(edgePath(edge)), h.Class('edge-line')], []),
      h.path([
        h.D(
          `M${edge.x2 - ARROW_W} ${edge.y2 - ARROW_H}L${edge.x2 + ARROW_W} ${edge.y2 - ARROW_H}L${edge.x2} ${edge.y2}Z`,
        ),
        h.Class('edge-arrow'),
      ], []),
    ],
  )

const esc = (s: string): string => s.replace(/["\\]/g, '\\$&')

const generateHoverCss = (nodes: ReadonlyArray<LayoutNode>): string => {
  const base = [
    '.graph-node{cursor:pointer}',
    '.graph-node,.graph-edge{transition:opacity .15s ease}',
    '.edge-line{fill:none;stroke:#94a3b8;stroke-width:1.5}',
    '.edge-arrow{fill:#94a3b8;stroke:none}',
    '.dependency-graph:has(.graph-node:hover) .graph-node{opacity:.15}',
    '.dependency-graph:has(.graph-node:hover) .graph-edge{opacity:.06}',
    '.graph-node:hover{opacity:1!important}',
    '.graph-node:hover rect{filter:brightness(1.2)}',
  ]
  const perNode: string[] = []
  for (const node of nodes) {
    const connected = [...new Set([...node.calls, ...node.calledBy])]
    if (connected.length === 0) continue
    const hov = `.dependency-graph:has([data-name="${esc(node.name)}"]:hover)`
    const sels = [
      ...connected.map((n) => `${hov} [data-name="${esc(n)}"]`),
      `${hov} [data-from="${esc(node.name)}"]`,
      `${hov} [data-to="${esc(node.name)}"]`,
    ]
    perNode.push(`${sels.join(',')}{opacity:1!important}`)
    perNode.push(
      `${hov} [data-from="${esc(node.name)}"] .edge-line{stroke:#60a5fa;stroke-width:2.5}`,
      `${hov} [data-from="${esc(node.name)}"] .edge-arrow{fill:#60a5fa}`,
      `${hov} [data-to="${esc(node.name)}"] .edge-line{stroke:#a78bfa;stroke-width:2.5}`,
      `${hov} [data-to="${esc(node.name)}"] .edge-arrow{fill:#a78bfa}`,
    )
  }
  return [...base, ...perNode].join('\n')
}

const legendDot = (color: string): Html =>
  h.span([h.Style({ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: color, marginRight: '6px', verticalAlign: 'middle' })], [])

const legend: Html =
  h.div([h.Class('graph-legend')], [
    legendDot('#4f46e5'),
    'Root — called by none, calls others  ',
    legendDot('#7c3aed'),
    'Internal — both caller and callee  ',
    legendDot('#059669'),
    'Leaf — called by others, calls none  ',
  ])

const searchInput = (value: string): Html =>
  h.div([h.Style({ marginBottom: '10px' })], [
    h.input([
      h.Type('text'),
      h.Placeholder('Search functions...'),
      h.Value(value),
      h.OnInput((query) => ChangedGraphSearch({ query })),
      h.Class('graph-search'),
    ]),
  ])

export const dependencyGraphSvg = (
  graph: ReadonlyArray<DependencyNode>,
  schema: string,
  graphSearch: string,
): Html => {
  const connected = graph.filter(
    (n) => n.calls.length > 0 || n.calledBy.length > 0,
  )
  const standaloneCount = graph.length - connected.length

  if (connected.length === 0) {
    return h.p([h.Class('loading')], [
      `All ${graph.length} functions are standalone (no inter-function calls).`,
    ])
  }

  const { nodes, edges, width, height } = layoutGraph(connected)
  const hoverCss = generateHoverCss(nodes)
  const query = graphSearch.toLowerCase()
  const matchedNames = query.length >= 3
    ? new Set(nodes.filter((n) => n.name.toLowerCase().includes(query)).map((n) => n.name))
    : new Set<string>()

  return h.div([], [
    h.style([], [hoverCss]),
    legend,
    searchInput(graphSearch),
    standaloneCount > 0
      ? h.p([h.Style({ fontSize: '13px', color: '#8b949e', marginBottom: '8px' })], [
          `${standaloneCount} standalone functions hidden`,
        ])
      : h.empty,
    matchedNames.size > 0
      ? h.p([h.Style({ fontSize: '13px', color: '#facc15', marginBottom: '8px' })], [
          `${matchedNames.size} match${matchedNames.size === 1 ? '' : 'es'}`,
        ])
      : h.empty,
    h.div([h.Class('graph-container')], [
      h.svg(
        [
          h.ViewBox(`0 0 ${width} ${height}`),
          h.Width(String(Math.min(width, 1200))),
          h.Attribute('preserveAspectRatio', 'xMidYMin meet'),
          h.Class('dependency-graph'),
        ],
        [
          h.g([], Array.map(edges, renderEdge)),
          h.g([], Array.map(nodes, (n) => renderNode(n, matchedNames.has(n.name)))),
        ],
      ),
    ]),
  ])
}
