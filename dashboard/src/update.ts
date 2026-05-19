import { Array, Match as M } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'
import type { Model, AppRoute } from './model.js'
import { Loading, Success, Failure, urlToRoute } from './model.js'
import {
  schemaTablesRouter,
  schemaFunctionsRouter,
  schemaDependenciesRouter,
  schemaGraphRouter,
} from './model.js'
import type { Message } from './messages.js'
import {
  NavigateInternal,
  LoadExternal,
  FetchSchemas,
  FetchSchemaStats,
  FetchTables,
  FetchFunctions,
  FetchDependencyGraph,
  FetchTableDetail,
  FetchFunctionDetail,
} from './commands.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const commandsForRoute = (
  route: AppRoute,
): ReadonlyArray<Command.Command<Message>> =>
  M.value(route).pipe(
    M.withReturnType<ReadonlyArray<Command.Command<Message>>>(),
    M.tagsExhaustive({
      SchemaList: () => [FetchSchemas()],
      SchemaTables: ({ name }) => [
        FetchSchemaStats({ name }),
        FetchTables({ schema: name }),
      ],
      SchemaFunctions: ({ name }) => [
        FetchSchemaStats({ name }),
        FetchFunctions({ schema: name }),
        FetchDependencyGraph({ schema: name }),
      ],
      SchemaDependencies: ({ name }) => [
        FetchSchemaStats({ name }),
        FetchDependencyGraph({ schema: name }),
      ],
      SchemaGraph: ({ name }) => [
        FetchSchemaStats({ name }),
        FetchDependencyGraph({ schema: name }),
      ],
      TableDetail: ({ schema, table }) => [
        FetchTableDetail({ schema, table }),
      ],
      FunctionDetail: ({ schema, fn }) => [
        FetchFunctionDetail({ schema, fn }),
      ],
      NotFound: () => [],
    }),
  )

const loadingModelForRoute = (model: Model, route: AppRoute): Model =>
  M.value(route).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      SchemaList: () =>
        evo(model, {
          route: () => route,
          schemas: () => Loading(),
        }),
      SchemaTables: () =>
        evo(model, {
          route: () => route,
          schemaStats: () => Loading(),
          tables: () => Loading(),
        }),
      SchemaFunctions: () =>
        evo(model, {
          route: () => route,
          schemaStats: () => Loading(),
          functions: () => Loading(),
          dependencyGraph: () => Loading(),
        }),
      SchemaDependencies: () =>
        evo(model, {
          route: () => route,
          schemaStats: () => Loading(),
          dependencyGraph: () => Loading(),
        }),
      SchemaGraph: () =>
        evo(model, {
          route: () => route,
          schemaStats: () => Loading(),
          dependencyGraph: () => Loading(),
        }),
      TableDetail: () =>
        evo(model, {
          route: () => route,
          tableDetail: () => Loading(),
        }),
      FunctionDetail: () =>
        evo(model, {
          route: () => route,
          functionDetail: () => Loading(),
        }),
      NotFound: () =>
        evo(model, {
          route: () => route,
        }),
    }),
  )

const navigateToRoute = (model: Model, route: AppRoute): UpdateReturn => {
  const nextModel = loadingModelForRoute(model, route)
  return [nextModel, commandsForRoute(route)]
}

const handleClickedTab =
  (model: Model) =>
  ({ tab }: Readonly<{ tab: string }>): UpdateReturn => {
    const name = M.value(model.route).pipe(
      M.tag('SchemaTables', ({ name }) => name),
      M.tag('SchemaFunctions', ({ name }) => name),
      M.tag('SchemaDependencies', ({ name }) => name),
      M.tag('SchemaGraph', ({ name }) => name),
      M.orElse(() => ''),
    )
    if (name === '') {
      return [model, []]
    }
    const url = M.value(tab).pipe(
      M.when('tables', () => schemaTablesRouter({ name })),
      M.when('functions', () => schemaFunctionsRouter({ name })),
      M.when('dependencies', () => schemaDependenciesRouter({ name })),
      M.when('graph', () => schemaGraphRouter({ name })),
      M.orElse(() => schemaTablesRouter({ name })),
    )
    return [model, [NavigateInternal({ url })]]
  }

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          M.withReturnType<UpdateReturn>(),
          M.tagsExhaustive({
            Internal: ({ url }): UpdateReturn => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }): UpdateReturn => [
              model,
              [LoadExternal({ href })],
            ],
          }),
        ),

      ChangedUrl: ({ url }) => navigateToRoute(model, urlToRoute(url)),

      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],

      ClickedTab: handleClickedTab(model),

      ChangedGraphSearch: ({ query }) => [
        evo(model, { graphSearch: () => query }),
        [],
      ],

      ToggledTreeNode: ({ name }) => {
        const isExpanded = Array.contains(model.expandedNodes, name)
        return [
          evo(model, {
            expandedNodes: () =>
              isExpanded
                ? Array.filter(model.expandedNodes, (node) => node !== name)
                : [...model.expandedNodes, name],
          }),
          [],
        ]
      },

      SucceededFetchSchemas: ({ data }) => [
        evo(model, { schemas: () => Success(data) }),
        [],
      ],
      FailedFetchSchemas: ({ error }) => [
        evo(model, { schemas: () => Failure(error) }),
        [],
      ],

      SucceededFetchSchemaStats: ({ data }) => [
        evo(model, { schemaStats: () => Success(data) }),
        [],
      ],
      FailedFetchSchemaStats: ({ error }) => [
        evo(model, { schemaStats: () => Failure(error) }),
        [],
      ],

      SucceededFetchTables: ({ data }) => [
        evo(model, { tables: () => Success(data) }),
        [],
      ],
      FailedFetchTables: ({ error }) => [
        evo(model, { tables: () => Failure(error) }),
        [],
      ],

      SucceededFetchTableDetail: ({ data }) => [
        evo(model, { tableDetail: () => Success(data) }),
        [],
      ],
      FailedFetchTableDetail: ({ error }) => [
        evo(model, { tableDetail: () => Failure(error) }),
        [],
      ],

      SucceededFetchFunctions: ({ data }) => [
        evo(model, { functions: () => Success(data) }),
        [],
      ],
      FailedFetchFunctions: ({ error }) => [
        evo(model, { functions: () => Failure(error) }),
        [],
      ],

      SucceededFetchFunctionDetail: ({ data }) => [
        evo(model, { functionDetail: () => Success(data) }),
        [],
      ],
      FailedFetchFunctionDetail: ({ error }) => [
        evo(model, { functionDetail: () => Failure(error) }),
        [],
      ],

      SucceededFetchDependencyGraph: ({ data }) => [
        evo(model, { dependencyGraph: () => Success(data) }),
        [],
      ],
      FailedFetchDependencyGraph: ({ error }) => [
        evo(model, { dependencyGraph: () => Failure(error) }),
        [],
      ],
    }),
  )
