import { Option } from 'effect'
import { Story } from 'foldkit'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { update } from './update'
import {
  NotAsked,
  Loading,
  Success,
  Failure,
  SchemaListRoute,
  SchemaTablesRoute,
  SchemaFunctionsRoute,
} from './model'
import type { Model, SchemaListItem, SchemaStats } from './model'
import {
  ChangedUrl,
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
  ClickedTab,
  ToggledTreeNode,
  CompletedNavigateInternal,
} from './messages'
import {
  FetchSchemas,
  FetchSchemaStats,
  FetchTables,
  FetchFunctions,
  FetchDependencyGraph,
  FetchTableDetail,
  FetchFunctionDetail,
  NavigateInternal,
} from './commands'

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

const defaultModel: Model = {
  route: SchemaListRoute(),
  schemas: NotAsked(),
  schemaStats: NotAsked(),
  tables: NotAsked(),
  tableDetail: NotAsked(),
  functions: NotAsked(),
  functionDetail: NotAsked(),
  dependencyGraph: NotAsked(),
  expandedNodes: [],
  graphSearch: '',
}

const mockSchemas: ReadonlyArray<SchemaListItem> = [
  {
    schema_name: 'public',
    table_count: 5,
    function_count: 3,
    view_count: 1,
    matview_count: 0,
  },
]

const mockSchemaStats: SchemaStats = {
  schema_name: 'public',
  table_count: 5,
  function_count: 3,
  view_count: 1,
  matview_count: 0,
  trigger_count: 2,
  policy_count: 4,
  rls_enabled_count: 3,
  rls_total_tables: 5,
}

describe('routing', () => {
  test('navigating to / resolves to SchemaList and fetches schemas', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(ChangedUrl({ url: urlOrThrow('http://localhost/') })),
      Story.model((model) => {
        expect(model.route._tag).toBe('SchemaList')
        expect(model.schemas._tag).toBe('Loading')
      }),
      Story.Command.expectHas(FetchSchemas),
      Story.Command.resolve(FetchSchemas, SucceededFetchSchemas({ data: [] })),
    )
  })

  test('navigating to /schemas/public/tables resolves to SchemaTables', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        ChangedUrl({
          url: urlOrThrow('http://localhost/schemas/public/tables'),
        }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('SchemaTables')
        if (model.route._tag === 'SchemaTables') {
          expect(model.route.name).toBe('public')
        }
        expect(model.schemaStats._tag).toBe('Loading')
        expect(model.tables._tag).toBe('Loading')
      }),
      Story.Command.expectHas(FetchSchemaStats),
      Story.Command.expectHas(FetchTables),
      Story.Command.resolve(FetchSchemaStats, SucceededFetchSchemaStats({ data: mockSchemaStats })),
      Story.Command.resolve(FetchTables, SucceededFetchTables({ data: [] })),
    )
  })

  test('navigating to /schemas/public/functions resolves to SchemaFunctions', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        ChangedUrl({
          url: urlOrThrow('http://localhost/schemas/public/functions'),
        }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('SchemaFunctions')
        expect(model.functions._tag).toBe('Loading')
        expect(model.dependencyGraph._tag).toBe('Loading')
      }),
      Story.Command.expectHas(FetchFunctions),
      Story.Command.expectHas(FetchDependencyGraph),
      Story.Command.resolve(FetchSchemaStats, SucceededFetchSchemaStats({ data: mockSchemaStats })),
      Story.Command.resolve(FetchFunctions, SucceededFetchFunctions({ data: [] })),
      Story.Command.resolve(FetchDependencyGraph, SucceededFetchDependencyGraph({ data: [] })),
    )
  })

  test('navigating to /schemas/public/dependencies resolves to SchemaDependencies', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        ChangedUrl({
          url: urlOrThrow('http://localhost/schemas/public/dependencies'),
        }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('SchemaDependencies')
        expect(model.dependencyGraph._tag).toBe('Loading')
      }),
      Story.Command.expectHas(FetchDependencyGraph),
      Story.Command.resolve(FetchSchemaStats, SucceededFetchSchemaStats({ data: mockSchemaStats })),
      Story.Command.resolve(FetchDependencyGraph, SucceededFetchDependencyGraph({ data: [] })),
    )
  })

  test('navigating to /schemas/public/tables/users resolves to TableDetail', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        ChangedUrl({
          url: urlOrThrow('http://localhost/schemas/public/tables/users'),
        }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('TableDetail')
        if (model.route._tag === 'TableDetail') {
          expect(model.route.schema).toBe('public')
          expect(model.route.table).toBe('users')
        }
        expect(model.tableDetail._tag).toBe('Loading')
      }),
      Story.Command.expectHas(FetchTableDetail),
      Story.Command.resolve(FetchTableDetail, SucceededFetchTableDetail({ data: { table: 'users', owner: 'postgres', rls: { enabled: false, force: false, policies: [] }, rbac: { table_grants: [], column_grants: [] }, triggers: [], column_definitions: [], constraint_definitions: [], index_definitions: [], partition_info: null } })),
    )
  })

  test('navigating to /schemas/public/functions/my_func resolves to FunctionDetail', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        ChangedUrl({
          url: urlOrThrow(
            'http://localhost/schemas/public/functions/my_func',
          ),
        }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('FunctionDetail')
        if (model.route._tag === 'FunctionDetail') {
          expect(model.route.schema).toBe('public')
          expect(model.route.fn).toBe('my_func')
        }
        expect(model.functionDetail._tag).toBe('Loading')
      }),
      Story.Command.expectHas(FetchFunctionDetail),
      Story.Command.resolve(FetchFunctionDetail, SucceededFetchFunctionDetail({ data: { info: { schema_name: 'public', function_name: 'my_func', function_signature: 'my_func()', function_definition: 'BEGIN RETURN 1; END;', return_type: 'integer', language: 'plpgsql', volatility: 'volatile', security_definer: false, function_arguments: '', function_type: 'function', is_security_definer: false, comment: null }, grantRoles: [], dependencies: { name: 'my_func', schema: 'public', calls: [], calledBy: [] } } })),
    )
  })

  test('an unknown path falls through to NotFound', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        ChangedUrl({ url: urlOrThrow('http://localhost/whatever') }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('NotFound')
      }),
    )
  })
})

describe('data loading', () => {
  test('successful schema fetch populates the schemas field', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(ChangedUrl({ url: urlOrThrow('http://localhost/') })),
      Story.Command.resolve(
        FetchSchemas,
        SucceededFetchSchemas({ data: mockSchemas }),
      ),
      Story.model((model) => {
        expect(model.schemas._tag).toBe('Success')
        if (model.schemas._tag === 'Success') {
          expect(model.schemas.data).toHaveLength(1)
          expect(model.schemas.data[0].schema_name).toBe('public')
        }
      }),
    )
  })

  test('failed schema fetch populates the error', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(ChangedUrl({ url: urlOrThrow('http://localhost/') })),
      Story.Command.resolve(
        FetchSchemas,
        FailedFetchSchemas({ error: 'Connection refused' }),
      ),
      Story.model((model) => {
        expect(model.schemas._tag).toBe('Failure')
        if (model.schemas._tag === 'Failure') {
          expect(model.schemas.error).toBe('Connection refused')
        }
      }),
    )
  })

  test('successful schema stats fetch populates schemaStats', () => {
    const schemasModel: Model = {
      ...defaultModel,
      route: SchemaTablesRoute.make({ name: 'public' }),
    }
    Story.story(
      update,
      Story.with(schemasModel),
      Story.message(SucceededFetchSchemaStats({ data: mockSchemaStats })),
      Story.model((model) => {
        expect(model.schemaStats._tag).toBe('Success')
      }),
    )
  })

  test('failed schema stats fetch records the error', () => {
    const schemasModel: Model = {
      ...defaultModel,
      route: SchemaTablesRoute.make({ name: 'public' }),
    }
    Story.story(
      update,
      Story.with(schemasModel),
      Story.message(FailedFetchSchemaStats({ error: 'Server error' })),
      Story.model((model) => {
        expect(model.schemaStats._tag).toBe('Failure')
        if (model.schemaStats._tag === 'Failure') {
          expect(model.schemaStats.error).toBe('Server error')
        }
      }),
    )
  })

  test('successful tables fetch populates tables', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(SucceededFetchTables({ data: [] })),
      Story.model((model) => {
        expect(model.tables._tag).toBe('Success')
      }),
    )
  })

  test('failed tables fetch records the error', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(FailedFetchTables({ error: 'Not found' })),
      Story.model((model) => {
        expect(model.tables._tag).toBe('Failure')
      }),
    )
  })

  test('successful table detail fetch populates tableDetail', () => {
    const tableDetail = {
      table: 'users',
      owner: 'postgres',
      rls: { enabled: false, force: false, policies: [] },
      rbac: { table_grants: [], column_grants: [] },
      triggers: [],
      column_definitions: [],
      constraint_definitions: [],
      index_definitions: [],
      partition_info: null,
    }
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(SucceededFetchTableDetail({ data: tableDetail })),
      Story.model((model) => {
        expect(model.tableDetail._tag).toBe('Success')
      }),
    )
  })

  test('failed table detail fetch records the error', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(FailedFetchTableDetail({ error: 'Table not found' })),
      Story.model((model) => {
        expect(model.tableDetail._tag).toBe('Failure')
      }),
    )
  })

  test('successful functions fetch populates functions', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(SucceededFetchFunctions({ data: [] })),
      Story.model((model) => {
        expect(model.functions._tag).toBe('Success')
      }),
    )
  })

  test('failed functions fetch records the error', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(FailedFetchFunctions({ error: 'Timeout' })),
      Story.model((model) => {
        expect(model.functions._tag).toBe('Failure')
      }),
    )
  })

  test('successful function detail fetch populates functionDetail', () => {
    const functionDetail = {
      info: {
        schema_name: 'public',
        function_name: 'my_func',
        function_signature: 'my_func()',
        function_definition: 'BEGIN RETURN 1; END;',
        return_type: 'integer',
        language: 'plpgsql',
        volatility: 'volatile',
        security_definer: false,
        function_arguments: '',
        function_type: 'function',
        is_security_definer: false,
        comment: null,
      },
      grantRoles: [],
      dependencies: { name: 'my_func', schema: 'public', calls: [], calledBy: [] },
    }
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(SucceededFetchFunctionDetail({ data: functionDetail })),
      Story.model((model) => {
        expect(model.functionDetail._tag).toBe('Success')
      }),
    )
  })

  test('failed function detail fetch records the error', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        FailedFetchFunctionDetail({ error: 'Function not found' }),
      ),
      Story.model((model) => {
        expect(model.functionDetail._tag).toBe('Failure')
      }),
    )
  })

  test('successful dependency graph fetch populates dependencyGraph', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(SucceededFetchDependencyGraph({ data: [] })),
      Story.model((model) => {
        expect(model.dependencyGraph._tag).toBe('Success')
      }),
    )
  })

  test('failed dependency graph fetch records the error', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(
        FailedFetchDependencyGraph({ error: 'Connection lost' }),
      ),
      Story.model((model) => {
        expect(model.dependencyGraph._tag).toBe('Failure')
      }),
    )
  })
})

describe('tab navigation', () => {
  test('clicking tables tab triggers NavigateInternal command', () => {
    const schemasModel: Model = {
      ...defaultModel,
      route: SchemaFunctionsRoute.make({ name: 'public' }),
    }
    Story.story(
      update,
      Story.with(schemasModel),
      Story.message(ClickedTab({ tab: 'tables' })),
      Story.Command.expectHas(NavigateInternal),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('clicking functions tab triggers NavigateInternal command', () => {
    const schemasModel: Model = {
      ...defaultModel,
      route: SchemaTablesRoute.make({ name: 'public' }),
    }
    Story.story(
      update,
      Story.with(schemasModel),
      Story.message(ClickedTab({ tab: 'functions' })),
      Story.Command.expectHas(NavigateInternal),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })

  test('clicking dependencies tab triggers NavigateInternal command', () => {
    const schemasModel: Model = {
      ...defaultModel,
      route: SchemaTablesRoute.make({ name: 'public' }),
    }
    Story.story(
      update,
      Story.with(schemasModel),
      Story.message(ClickedTab({ tab: 'dependencies' })),
      Story.Command.expectHas(NavigateInternal),
      Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
    )
  })
})

describe('tree interaction', () => {
  test('toggling a tree node adds it to expandedNodes', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(ToggledTreeNode({ name: 'my_func' })),
      Story.model((model) => {
        expect(model.expandedNodes).toContain('my_func')
      }),
    )
  })

  test('toggling an expanded tree node removes it from expandedNodes', () => {
    const expanded: Model = {
      ...defaultModel,
      expandedNodes: ['my_func'],
    }
    Story.story(
      update,
      Story.with(expanded),
      Story.message(ToggledTreeNode({ name: 'my_func' })),
      Story.model((model) => {
        expect(model.expandedNodes).not.toContain('my_func')
      }),
    )
  })
})

describe('multi-step flow', () => {
  test('navigate to schema list, fetch schemas, then navigate to schema detail', () => {
    Story.story(
      update,
      Story.with(defaultModel),
      Story.message(ChangedUrl({ url: urlOrThrow('http://localhost/') })),
      Story.Command.resolve(
        FetchSchemas,
        SucceededFetchSchemas({ data: mockSchemas }),
      ),
      Story.model((model) => {
        expect(model.schemas._tag).toBe('Success')
      }),
      Story.message(
        ChangedUrl({
          url: urlOrThrow('http://localhost/schemas/public/tables'),
        }),
      ),
      Story.model((model) => {
        expect(model.route._tag).toBe('SchemaTables')
        expect(model.schemaStats._tag).toBe('Loading')
        expect(model.tables._tag).toBe('Loading')
      }),
      Story.Command.resolve(
        FetchSchemaStats,
        SucceededFetchSchemaStats({ data: mockSchemaStats }),
      ),
      Story.Command.resolve(FetchTables, SucceededFetchTables({ data: [] })),
      Story.model((model) => {
        expect(model.schemaStats._tag).toBe('Success')
        expect(model.tables._tag).toBe('Success')
      }),
    )
  })
})
