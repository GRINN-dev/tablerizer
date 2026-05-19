import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import type {
  SchemaListItem,
  SchemaStats,
  TableListItem,
  TableDetail,
  FunctionInfo,
  FunctionDetailData,
  DependencyNode,
} from './model.js'

// MESSAGE

export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')

export const ClickedTab = m('ClickedTab', { tab: S.String })
export const ToggledTreeNode = m('ToggledTreeNode', { name: S.String })
export const ChangedGraphSearch = m('ChangedGraphSearch', { query: S.String })

export const SucceededFetchSchemas = m('SucceededFetchSchemas', {
  data: S.Unknown as S.Schema<ReadonlyArray<SchemaListItem>>,
})
export const FailedFetchSchemas = m('FailedFetchSchemas', {
  error: S.String,
})

export const SucceededFetchSchemaStats = m('SucceededFetchSchemaStats', {
  data: S.Unknown as S.Schema<SchemaStats>,
})
export const FailedFetchSchemaStats = m('FailedFetchSchemaStats', {
  error: S.String,
})

export const SucceededFetchTables = m('SucceededFetchTables', {
  data: S.Unknown as S.Schema<ReadonlyArray<TableListItem>>,
})
export const FailedFetchTables = m('FailedFetchTables', {
  error: S.String,
})

export const SucceededFetchTableDetail = m('SucceededFetchTableDetail', {
  data: S.Unknown as S.Schema<TableDetail>,
})
export const FailedFetchTableDetail = m('FailedFetchTableDetail', {
  error: S.String,
})

export const SucceededFetchFunctions = m('SucceededFetchFunctions', {
  data: S.Unknown as S.Schema<ReadonlyArray<FunctionInfo>>,
})
export const FailedFetchFunctions = m('FailedFetchFunctions', {
  error: S.String,
})

export const SucceededFetchFunctionDetail = m('SucceededFetchFunctionDetail', {
  data: S.Unknown as S.Schema<FunctionDetailData>,
})
export const FailedFetchFunctionDetail = m('FailedFetchFunctionDetail', {
  error: S.String,
})

export const SucceededFetchDependencyGraph = m(
  'SucceededFetchDependencyGraph',
  {
    data: S.Unknown as S.Schema<ReadonlyArray<DependencyNode>>,
  },
)
export const FailedFetchDependencyGraph = m('FailedFetchDependencyGraph', {
  error: S.String,
})

export const Message = S.Union([
  ClickedLink,
  ChangedUrl,
  CompletedNavigateInternal,
  CompletedLoadExternal,
  ClickedTab,
  ToggledTreeNode,
  ChangedGraphSearch,
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
])
export type Message = typeof Message.Type
