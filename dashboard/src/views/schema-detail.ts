import { Array } from 'effect'
import { Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import { ClickedTab } from '../messages.js'
import type { Model, TableListItem, FunctionInfo, DependencyNode, RemoteData } from '../model.js'
import {
  schemaListRouter,
  schemaTablesRouter,
  schemaFunctionsRouter,
  schemaDependenciesRouter,
  tableDetailRouter,
  functionDetailRouter,
} from '../model.js'
import { ToggledTreeNode } from '../messages.js'
import { withRemote, statCard } from './helpers.js'
import { dependencyGraphSvg } from './dependency-graph.js'

const h = html<Message>()

type ActiveTab = 'tables' | 'functions' | 'dependencies' | 'graph'

const tabBar = (activeTab: ActiveTab, schema: string): Html => {
  const tabs: ReadonlyArray<Readonly<{ key: ActiveTab; label: string }>> = [
    { key: 'tables', label: 'Tables' },
    { key: 'functions', label: 'Functions' },
    { key: 'dependencies', label: 'Dependencies' },
    { key: 'graph', label: 'Graph' },
  ]
  return h.nav(
    [h.Class('tab-bar'), h.AriaLabel('Schema sections')],
    Array.map(tabs, ({ key, label }) =>
      h.keyed('div')(
        key,
        [
          h.Class(key === activeTab ? 'tab tab-active' : 'tab'),
          h.OnClick(ClickedTab({ tab: key })),
          h.Role('tab'),
          h.AriaSelected(key === activeTab),
        ],
        [label],
      ),
    ),
  )
}

const breadcrumbs = (schemaName: string): Html =>
  h.nav([h.Class('breadcrumbs'), h.AriaLabel('Breadcrumb')], [
    h.a([h.Href(schemaListRouter())], ['Schemas']),
    h.span([], [' / ']),
    h.span([], [schemaName]),
  ])

const tableRow = (table: TableListItem, schema: string): Html =>
  h.keyed('tr')(
    table.table_name,
    [],
    [
      h.td([], [
        h.a(
          [h.Href(tableDetailRouter({ schema, table: table.table_name }))],
          [table.table_name],
        ),
      ]),
      h.td([], [String(table.column_count)]),
      h.td([], [String(table.constraint_count)]),
      h.td([], [String(table.index_count)]),
      h.td([], [String(table.trigger_count)]),
      h.td([], [
        h.span(
          [h.Class(table.has_rls ? 'badge badge-green' : 'badge badge-gray')],
          [table.has_rls ? 'ON' : 'OFF'],
        ),
      ]),
    ],
  )

const tablesContent = (model: Model, schema: string): Html =>
  withRemote(model.tables, (tables) =>
    h.div([h.Class('table-wrap')], [
      h.table([], [
        h.thead([], [
          h.tr([], [
            h.th([], ['Name']),
            h.th([], ['Columns']),
            h.th([], ['Constraints']),
            h.th([], ['Indexes']),
            h.th([], ['Triggers']),
            h.th([], ['RLS']),
          ]),
        ]),
        h.tbody([], Array.map(tables, (table) => tableRow(table, schema))),
      ]),
    ]),
  )

const depCounts = (
  fnName: string,
  graph: ReadonlyArray<DependencyNode>,
): Readonly<{ calls: number; calledBy: number }> => {
  const node = Array.findFirst(graph, (n) => n.name === fnName)
  return node._tag === 'Some'
    ? { calls: node.value.calls.length, calledBy: node.value.calledBy.length }
    : { calls: 0, calledBy: 0 }
}

const functionRow = (
  fn: FunctionInfo,
  schema: string,
  graph: ReadonlyArray<DependencyNode>,
): Html => {
  const deps = depCounts(fn.function_name, graph)
  return h.keyed('tr')(
    fn.function_name,
    [],
    [
      h.td([], [
        h.a(
          [h.Href(functionDetailRouter({ schema, fn: fn.function_name }))],
          [fn.function_name],
        ),
      ]),
      h.td([], [h.span([h.Class('badge badge-blue')], [fn.function_type])]),
      h.td([], [fn.language]),
      h.td([], [fn.return_type]),
      h.td([], [
        h.span(
          [
            h.Class(
              fn.is_security_definer
                ? 'badge badge-green'
                : 'badge badge-gray',
            ),
          ],
          [fn.is_security_definer ? 'DEFINER' : 'INVOKER'],
        ),
      ]),
      h.td([], [
        deps.calls > 0
          ? h.span([h.Class('badge badge-blue')], [String(deps.calls)])
          : h.span([h.Class('badge badge-gray')], ['0']),
      ]),
      h.td([], [
        deps.calledBy > 0
          ? h.span([h.Class('badge badge-blue')], [String(deps.calledBy)])
          : h.span([h.Class('badge badge-gray')], ['0']),
      ]),
    ],
  )
}

const functionsContent = (model: Model, schema: string): Html =>
  withRemote(model.functions, (functions) => {
    const graph =
      model.dependencyGraph._tag === 'Success'
        ? model.dependencyGraph.data
        : ([] as ReadonlyArray<DependencyNode>)
    return h.div([h.Class('table-wrap')], [
      h.table([], [
        h.thead([], [
          h.tr([], [
            h.th([], ['Name']),
            h.th([], ['Type']),
            h.th([], ['Language']),
            h.th([], ['Returns']),
            h.th([], ['Security']),
            h.th([], ['Calls']),
            h.th([], ['Called By']),
          ]),
        ]),
        h.tbody(
          [],
          Array.map(functions, (fn) => functionRow(fn, schema, graph)),
        ),
      ]),
    ])
  })

const treeNode = (
  node: DependencyNode,
  graph: ReadonlyArray<DependencyNode>,
  expandedNodes: ReadonlyArray<string>,
): Html => {
  const isExpanded = Array.contains(expandedNodes, node.name)
  const hasChildren = Array.isReadonlyArrayNonEmpty(node.calls)

  return h.keyed('li')(
    node.name,
    [],
    [
      h.span(
        [
          h.Class('tree-toggle'),
          h.OnClick(ToggledTreeNode({ name: node.name })),
          h.AriaExpanded(isExpanded),
        ],
        [
          h.span(
            [h.Class('tree-arrow')],
            [hasChildren ? (isExpanded ? '▾' : '▸') : '•'],
          ),
          h.span([h.Class('tree-label')], [node.name]),
          Array.isReadonlyArrayNonEmpty(node.calledBy)
            ? h.span([h.Class('badge badge-gray')], [
                ` called by ${node.calledBy.length}`,
              ])
            : h.empty,
        ],
      ),
      hasChildren && isExpanded
        ? h.ul(
            [],
            Array.map(node.calls, (callName) => {
              const child = Array.findFirst(
                graph,
                (graphNode) => graphNode.name === callName,
              )
              return child._tag === 'Some'
                ? treeNode(child.value, graph, expandedNodes)
                : h.li([], [
                    h.span([h.Class('tree-arrow')], ['•']),
                    h.span([h.Class('tree-label')], [callName]),
                  ])
            }),
          )
        : h.empty,
    ],
  )
}

const dependenciesContent = (model: Model): Html =>
  withRemote(model.dependencyGraph, (graph) => {
    if (Array.isReadonlyArrayEmpty(graph)) {
      return h.p([h.Class('loading')], [
        'No function dependencies found in this schema.',
      ])
    }
    const roots = Array.filter(
      graph,
      (node) => Array.isReadonlyArrayEmpty(node.calledBy),
    )
    const isolated = Array.filter(
      graph,
      (node) =>
        Array.isReadonlyArrayEmpty(node.calls) && Array.isReadonlyArrayEmpty(node.calledBy),
    )
    const connected = Array.filter(roots, (node) =>
      Array.isReadonlyArrayNonEmpty(node.calls),
    )

    return h.div([], [
      Array.isReadonlyArrayNonEmpty(connected)
        ? h.div([], [
            h.h3([h.Class('section-title')], ['Dependency Tree']),
            h.ul(
              [h.Class('tree')],
              Array.map(connected, (node) =>
                treeNode(node, graph, model.expandedNodes),
              ),
            ),
          ])
        : h.empty,
      Array.isReadonlyArrayNonEmpty(isolated)
        ? h.div([], [
            h.h3([h.Class('section-title')], [
              `Standalone Functions (${isolated.length})`,
            ]),
            h.ul(
              [h.Class('tree')],
              Array.map(isolated, (node) =>
                h.keyed('li')(node.name, [], [
                  h.span([h.Class('tree-arrow')], ['•']),
                  h.span([h.Class('tree-label')], [node.name]),
                ]),
              ),
            ),
          ])
        : h.empty,
    ])
  })

export const schemaTablesView = (model: Model, name: string): Html =>
  h.section([], [
    breadcrumbs(name),
    withRemote(model.schemaStats, (stats) =>
      h.div([h.Class('card-grid')], [
        statCard(String(stats.table_count), 'Tables'),
        statCard(String(stats.function_count), 'Functions'),
        statCard(String(stats.trigger_count), 'Triggers'),
        statCard(String(stats.policy_count), 'Policies'),
        statCard(
          stats.rls_total_tables > 0
            ? `${Math.round((stats.rls_enabled_count / stats.rls_total_tables) * 100)}%`
            : 'N/A',
          'RLS Coverage',
        ),
        statCard(String(stats.view_count + stats.matview_count), 'Views'),
      ]),
    ),
    tabBar('tables', name),
    tablesContent(model, name),
  ])

export const schemaFunctionsView = (model: Model, name: string): Html =>
  h.section([], [
    breadcrumbs(name),
    withRemote(model.schemaStats, (stats) =>
      h.div([h.Class('card-grid')], [
        statCard(String(stats.table_count), 'Tables'),
        statCard(String(stats.function_count), 'Functions'),
        statCard(String(stats.trigger_count), 'Triggers'),
        statCard(String(stats.policy_count), 'Policies'),
        statCard(
          stats.rls_total_tables > 0
            ? `${Math.round((stats.rls_enabled_count / stats.rls_total_tables) * 100)}%`
            : 'N/A',
          'RLS Coverage',
        ),
        statCard(String(stats.view_count + stats.matview_count), 'Views'),
      ]),
    ),
    tabBar('functions', name),
    functionsContent(model, name),
  ])

export const schemaDependenciesView = (model: Model, name: string): Html =>
  h.section([], [
    breadcrumbs(name),
    withRemote(model.schemaStats, (stats) =>
      h.div([h.Class('card-grid')], [
        statCard(String(stats.table_count), 'Tables'),
        statCard(String(stats.function_count), 'Functions'),
        statCard(String(stats.trigger_count), 'Triggers'),
        statCard(String(stats.policy_count), 'Policies'),
        statCard(
          stats.rls_total_tables > 0
            ? `${Math.round((stats.rls_enabled_count / stats.rls_total_tables) * 100)}%`
            : 'N/A',
          'RLS Coverage',
        ),
        statCard(String(stats.view_count + stats.matview_count), 'Views'),
      ]),
    ),
    tabBar('dependencies', name),
    dependenciesContent(model),
  ])

export const schemaGraphView = (model: Model, name: string): Html =>
  h.section([], [
    breadcrumbs(name),
    withRemote(model.schemaStats, (stats) =>
      h.div([h.Class('card-grid')], [
        statCard(String(stats.table_count), 'Tables'),
        statCard(String(stats.function_count), 'Functions'),
        statCard(String(stats.trigger_count), 'Triggers'),
        statCard(String(stats.policy_count), 'Policies'),
        statCard(
          stats.rls_total_tables > 0
            ? `${Math.round((stats.rls_enabled_count / stats.rls_total_tables) * 100)}%`
            : 'N/A',
          'RLS Coverage',
        ),
        statCard(String(stats.view_count + stats.matview_count), 'Views'),
      ]),
    ),
    tabBar('graph', name),
    withRemote(model.dependencyGraph, (graph) =>
      dependencyGraphSvg(graph, name, model.graphSearch),
    ),
  ])
