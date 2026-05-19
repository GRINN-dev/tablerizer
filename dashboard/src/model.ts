import { Match as M, Option, Schema as S, pipe } from 'effect'
import { r, literal, slash, string } from 'foldkit/route'
import { Route } from 'foldkit'
import { Url } from 'foldkit/url'

// ROUTE

export const SchemaListRoute = r('SchemaList')
export const SchemaTablesRoute = r('SchemaTables', { name: S.String })
export const SchemaFunctionsRoute = r('SchemaFunctions', { name: S.String })
export const SchemaDependenciesRoute = r('SchemaDependencies', {
  name: S.String,
})
export const SchemaGraphRoute = r('SchemaGraph', { name: S.String })
export const TableDetailRoute = r('TableDetail', {
  schema: S.String,
  table: S.String,
})
export const FunctionDetailRoute = r('FunctionDetail', {
  schema: S.String,
  fn: S.String,
})
export const NotFoundRoute = r('NotFound', { path: S.String })

export const AppRoute = S.Union([
  SchemaListRoute,
  SchemaTablesRoute,
  SchemaFunctionsRoute,
  SchemaDependenciesRoute,
  SchemaGraphRoute,
  TableDetailRoute,
  FunctionDetailRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

export const schemaListRouter = pipe(Route.root, Route.mapTo(SchemaListRoute))

export const schemaTablesRouter = pipe(
  literal('schemas'),
  slash(string('name')),
  slash(literal('tables')),
  Route.mapTo(SchemaTablesRoute),
)

export const schemaFunctionsRouter = pipe(
  literal('schemas'),
  slash(string('name')),
  slash(literal('functions')),
  Route.mapTo(SchemaFunctionsRoute),
)

export const schemaDependenciesRouter = pipe(
  literal('schemas'),
  slash(string('name')),
  slash(literal('dependencies')),
  Route.mapTo(SchemaDependenciesRoute),
)

export const schemaGraphRouter = pipe(
  literal('schemas'),
  slash(string('name')),
  slash(literal('graph')),
  Route.mapTo(SchemaGraphRoute),
)

export const tableDetailRouter = pipe(
  literal('schemas'),
  slash(string('schema')),
  slash(literal('tables')),
  slash(string('table')),
  Route.mapTo(TableDetailRoute),
)

export const functionDetailRouter = pipe(
  literal('schemas'),
  slash(string('schema')),
  slash(literal('functions')),
  slash(string('fn')),
  Route.mapTo(FunctionDetailRoute),
)

export const routeParser = Route.oneOf(
  tableDetailRouter,
  functionDetailRouter,
  schemaTablesRouter,
  schemaFunctionsRouter,
  schemaDependenciesRouter,
  schemaGraphRouter,
  schemaListRouter,
)

export const urlToRoute = Route.parseUrlWithFallback(routeParser, NotFoundRoute)

// MODEL

// NOTE: RemoteData is generic, which ts() does not support. Using plain
// constructors with _tag discrimination so the type works with evo().
export type RemoteData<T> =
  | Readonly<{ _tag: 'NotAsked' }>
  | Readonly<{ _tag: 'Loading' }>
  | Readonly<{ _tag: 'Success'; data: T }>
  | Readonly<{ _tag: 'Failure'; error: string }>

export const NotAsked = <T>(): RemoteData<T> => ({ _tag: 'NotAsked' })
export const Loading = <T>(): RemoteData<T> => ({ _tag: 'Loading' })
export const Success = <T>(data: T): RemoteData<T> => ({
  _tag: 'Success',
  data,
})
export const Failure = <T>(error: string): RemoteData<T> => ({
  _tag: 'Failure',
  error,
})

export interface SchemaListItem {
  readonly schema_name: string
  readonly table_count: number
  readonly function_count: number
  readonly view_count: number
  readonly matview_count: number
}

export interface SchemaStats {
  readonly schema_name: string
  readonly table_count: number
  readonly function_count: number
  readonly view_count: number
  readonly matview_count: number
  readonly trigger_count: number
  readonly policy_count: number
  readonly rls_enabled_count: number
  readonly rls_total_tables: number
}

export interface TableListItem {
  readonly table_name: string
  readonly column_count: number
  readonly constraint_count: number
  readonly index_count: number
  readonly has_rls: boolean
  readonly trigger_count: number
}

export interface TableDetail {
  readonly table: string
  readonly owner: string
  readonly rls: Readonly<{
    enabled: boolean
    force: boolean
    policies: ReadonlyArray<
      Readonly<{
        policy: string
        cmd: string
        roles: ReadonlyArray<string> | null
        permissive: string
        using?: string | null
        with_check?: string | null
      }>
    >
  }>
  readonly rbac: Readonly<{
    table_grants: ReadonlyArray<
      Readonly<{
        grantor: string
        grantee: string
        privilege: string
        is_grantable: boolean
      }>
    >
    column_grants: ReadonlyArray<
      Readonly<{
        column_name: string
        grantor: string
        grantee: string
        privilege: string
        is_grantable: boolean
      }>
    >
  }>
  readonly triggers: ReadonlyArray<
    Readonly<{
      trigger_name: string
      action_timing: string
      event_manipulation: string
      action_orientation: string
      action_statement: string
      action_condition: string | null
      action_order: number
    }>
  >
  readonly column_definitions: ReadonlyArray<
    Readonly<{
      column_name: string
      data_type: string
      not_null: boolean
      column_default: string | null
      comment: string | null
      ordinal_position: number
    }>
  >
  readonly constraint_definitions: ReadonlyArray<
    Readonly<{
      constraint_name: string
      constraint_type: string
      definition: string
    }>
  >
  readonly index_definitions: ReadonlyArray<
    Readonly<{
      index_name: string
      index_definition: string
      comment: string | null
    }>
  >
  readonly partition_info: Readonly<{
    partition_strategy: string
    partition_key: string
  }> | null
  readonly comment?: string
}

export interface FunctionInfo {
  readonly schema_name: string
  readonly function_name: string
  readonly function_signature: string
  readonly function_definition: string
  readonly return_type: string
  readonly language: string
  readonly volatility: string
  readonly security_definer: boolean
  readonly function_arguments: string
  readonly function_type: string
  readonly is_security_definer: boolean
  readonly comment: string | null
}

export interface FunctionDetailData {
  readonly info: FunctionInfo
  readonly grantRoles: ReadonlyArray<string>
  readonly dependencies: Readonly<{
    name: string
    schema: string
    calls: ReadonlyArray<string>
    calledBy: ReadonlyArray<string>
  }>
}

export interface DependencyNode {
  readonly name: string
  readonly schema: string
  readonly calls: ReadonlyArray<string>
  readonly calledBy: ReadonlyArray<string>
}

export const Model = S.Struct({
  route: AppRoute,
  schemas: S.Unknown,
  schemaStats: S.Unknown,
  tables: S.Unknown,
  tableDetail: S.Unknown,
  functions: S.Unknown,
  functionDetail: S.Unknown,
  dependencyGraph: S.Unknown,
  expandedNodes: S.Array(S.String),
  graphSearch: S.String,
})

export type Model = Readonly<{
  route: AppRoute
  schemas: RemoteData<ReadonlyArray<SchemaListItem>>
  schemaStats: RemoteData<SchemaStats>
  tables: RemoteData<ReadonlyArray<TableListItem>>
  tableDetail: RemoteData<TableDetail>
  functions: RemoteData<ReadonlyArray<FunctionInfo>>
  functionDetail: RemoteData<FunctionDetailData>
  dependencyGraph: RemoteData<ReadonlyArray<DependencyNode>>
  expandedNodes: ReadonlyArray<string>
  graphSearch: string
}>

export const routeSchemaName = (route: AppRoute): Option.Option<string> =>
  M.value(route).pipe(
    M.tag('SchemaTables', ({ name }) => Option.some(name)),
    M.tag('SchemaFunctions', ({ name }) => Option.some(name)),
    M.tag('SchemaDependencies', ({ name }) => Option.some(name)),
    M.tag('SchemaGraph', ({ name }) => Option.some(name)),
    M.tag('TableDetail', ({ schema }) => Option.some(schema)),
    M.tag('FunctionDetail', ({ schema }) => Option.some(schema)),
    M.orElse(() => Option.none()),
  )

export const routeTitle = (route: AppRoute): string =>
  M.value(route).pipe(
    M.tag('SchemaList', () => 'Schemas'),
    M.tag('SchemaTables', ({ name }) => `${name} Tables`),
    M.tag('SchemaFunctions', ({ name }) => `${name} Functions`),
    M.tag('SchemaDependencies', ({ name }) => `${name} Dependencies`),
    M.tag('SchemaGraph', ({ name }) => `${name} Graph`),
    M.tag('TableDetail', ({ schema, table }) => `${schema}.${table}`),
    M.tag('FunctionDetail', ({ schema, fn }) => `${schema}.${fn}`),
    M.tag('NotFound', () => 'Not Found'),
    M.exhaustive,
  )
