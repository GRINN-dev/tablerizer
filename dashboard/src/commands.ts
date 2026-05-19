import { Effect, Schema as S } from 'effect'
import { Command } from 'foldkit'
import {
  SucceededFetchSchemas,
  FailedFetchSchemas,
  SucceededFetchSchemaStats,
  FailedFetchSchemaStats,
  SucceededFetchTables,
  FailedFetchTables,
  SucceededFetchTableDetail,
  FailedFetchTableDetail,
  SucceededFetchFunctions,
  FailedFetchFunctions,
  SucceededFetchFunctionDetail,
  FailedFetchFunctionDetail,
  SucceededFetchDependencyGraph,
  FailedFetchDependencyGraph,
  CompletedNavigateInternal,
  CompletedLoadExternal,
} from './messages.js'
import { pushUrl, load } from 'foldkit/navigation'

// COMMAND

const fetchJson = (url: string) =>
  Effect.tryPromise({
    try: () =>
      fetch(url).then(async (response) => {
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        }
        return response.json()
      }),
    catch: (error) => error as Error,
  })

export const NavigateInternal = Command.define(
  'NavigateInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

export const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

export const FetchSchemas = Command.define(
  'FetchSchemas',
  SucceededFetchSchemas,
  FailedFetchSchemas,
)(
  fetchJson('/api/schemas').pipe(
    Effect.map((data) => SucceededFetchSchemas({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchSchemas]', e)
        return FailedFetchSchemas({ error: String(e) })
      }),
    ),
  ),
)

export const FetchSchemaStats = Command.define(
  'FetchSchemaStats',
  { name: S.String },
  SucceededFetchSchemaStats,
  FailedFetchSchemaStats,
)(({ name }) =>
  fetchJson(`/api/schemas/${encodeURIComponent(name)}`).pipe(
    Effect.map((data) => SucceededFetchSchemaStats({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchSchemaStats]', e)
        return FailedFetchSchemaStats({ error: String(e) })
      }),
    ),
  ),
)

export const FetchTables = Command.define(
  'FetchTables',
  { schema: S.String },
  SucceededFetchTables,
  FailedFetchTables,
)(({ schema }) =>
  fetchJson(`/api/schemas/${encodeURIComponent(schema)}/tables`).pipe(
    Effect.map((data) => SucceededFetchTables({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchTables]', e)
        return FailedFetchTables({ error: String(e) })
      }),
    ),
  ),
)

export const FetchTableDetail = Command.define(
  'FetchTableDetail',
  { schema: S.String, table: S.String },
  SucceededFetchTableDetail,
  FailedFetchTableDetail,
)(({ schema, table }) =>
  fetchJson(
    `/api/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}`,
  ).pipe(
    Effect.map((data) => SucceededFetchTableDetail({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchTableDetail]', e)
        return FailedFetchTableDetail({ error: String(e) })
      }),
    ),
  ),
)

export const FetchFunctions = Command.define(
  'FetchFunctions',
  { schema: S.String },
  SucceededFetchFunctions,
  FailedFetchFunctions,
)(({ schema }) =>
  fetchJson(`/api/schemas/${encodeURIComponent(schema)}/functions`).pipe(
    Effect.map((data) => SucceededFetchFunctions({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchFunctions]', e)
        return FailedFetchFunctions({ error: String(e) })
      }),
    ),
  ),
)

export const FetchFunctionDetail = Command.define(
  'FetchFunctionDetail',
  { schema: S.String, fn: S.String },
  SucceededFetchFunctionDetail,
  FailedFetchFunctionDetail,
)(({ schema, fn }) =>
  fetchJson(
    `/api/schemas/${encodeURIComponent(schema)}/functions/${encodeURIComponent(fn)}`,
  ).pipe(
    Effect.map((data) => SucceededFetchFunctionDetail({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchFunctionDetail]', e)
        return FailedFetchFunctionDetail({ error: String(e) })
      }),
    ),
  ),
)

export const FetchDependencyGraph = Command.define(
  'FetchDependencyGraph',
  { schema: S.String },
  SucceededFetchDependencyGraph,
  FailedFetchDependencyGraph,
)(({ schema }) =>
  fetchJson(`/api/schemas/${encodeURIComponent(schema)}/dependencies`).pipe(
    Effect.map((data) => SucceededFetchDependencyGraph({ data })),
    Effect.catch((e) =>
      Effect.sync(() => {
        console.error('[FetchDependencyGraph]', e)
        return FailedFetchDependencyGraph({ error: String(e) })
      }),
    ),
  ),
)
