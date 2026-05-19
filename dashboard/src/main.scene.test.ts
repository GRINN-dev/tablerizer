import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { update } from './update'
import { view } from './views/view'
import {
  NotAsked,
  Loading,
  Success,
  Failure,
  SchemaListRoute,
  SchemaTablesRoute,
  SchemaFunctionsRoute,
  SchemaDependenciesRoute,
  TableDetailRoute,
  FunctionDetailRoute,
  NotFoundRoute,
} from './model'
import type { Model, SchemaListItem, SchemaStats, TableListItem, DependencyNode } from './model'
import {
  FetchSchemas,
  FetchSchemaStats,
  FetchTables,
  FetchTableDetail,
  FetchFunctions,
  FetchFunctionDetail,
  FetchDependencyGraph,
} from './commands'
import {
  SucceededFetchSchemas,
  SucceededFetchSchemaStats,
  SucceededFetchTables,
  SucceededFetchTableDetail,
  FailedFetchSchemas,
  SucceededFetchFunctions,
  SucceededFetchFunctionDetail,
  SucceededFetchDependencyGraph,
} from './messages'

const baseModel: Model = {
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
  {
    schema_name: 'private',
    table_count: 2,
    function_count: 1,
    view_count: 0,
    matview_count: 0,
  },
]

const mockStats: SchemaStats = {
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

const mockTables: ReadonlyArray<TableListItem> = [
  {
    table_name: 'users',
    column_count: 8,
    constraint_count: 3,
    index_count: 2,
    has_rls: true,
    trigger_count: 1,
  },
]

describe('schema list view', () => {
  test('renders the page heading', () => {
    Scene.scene(
      { update, view },
      Scene.with(baseModel),
      Scene.expect(Scene.role('heading', { name: 'Schemas' })).toExist(),
    )
  })

  test('shows loading indicator when schemas are loading', () => {
    const model: Model = { ...baseModel, schemas: Loading() }
    Scene.scene(
      { update, view },
      Scene.with(model),
      Scene.expect(Scene.text('Loading...')).toExist(),
    )
  })

  test('shows error when schemas fail to load', () => {
    const model: Model = {
      ...baseModel,
      schemas: Failure('Connection refused'),
    }
    Scene.scene(
      { update, view },
      Scene.with(model),
      Scene.expect(Scene.text('Connection refused')).toExist(),
    )
  })

  test('renders schema cards when loaded', () => {
    const model: Model = {
      ...baseModel,
      schemas: Success(mockSchemas),
    }
    Scene.scene(
      { update, view },
      Scene.with(model),
      Scene.expect(Scene.text('public')).toExist(),
      Scene.expect(Scene.text('private')).toExist(),
    )
  })

  test('schema cards link to schema detail', () => {
    const model: Model = {
      ...baseModel,
      schemas: Success(mockSchemas),
    }
    Scene.scene(
      { update, view },
      Scene.with(model),
      Scene.expect(
        Scene.role('link', { name: /public/i }),
      ).toExist(),
    )
  })
})

describe('schema detail view', () => {
  const schemaDetailModel: Model = {
    ...baseModel,
    route: SchemaTablesRoute.make({ name: 'public' }),
    schemaStats: Success(mockStats),
    tables: Success(mockTables),
  }

  test('renders breadcrumb navigation', () => {
    Scene.scene(
      { update, view },
      Scene.with(schemaDetailModel),
      Scene.expect(Scene.role('link', { name: 'Schemas' })).toExist(),
    )
  })

  test('shows stats cards', () => {
    Scene.scene(
      { update, view },
      Scene.with(schemaDetailModel),
      Scene.expect(Scene.text('Tables')).toExist(),
      Scene.expect(Scene.text('Functions')).toExist(),
      Scene.expect(Scene.text('Triggers')).toExist(),
      Scene.expect(Scene.text('Policies')).toExist(),
    )
  })

  test('renders tab bar with Tables, Functions, Dependencies', () => {
    Scene.scene(
      { update, view },
      Scene.with(schemaDetailModel),
      Scene.expect(Scene.role('tab', { name: 'Tables' })).toExist(),
      Scene.expect(Scene.role('tab', { name: 'Functions' })).toExist(),
      Scene.expect(Scene.role('tab', { name: 'Dependencies' })).toExist(),
    )
  })

  test('tables tab shows the table list with column data', () => {
    Scene.scene(
      { update, view },
      Scene.with(schemaDetailModel),
      Scene.expect(Scene.text('users')).toExist(),
      Scene.expect(Scene.text('ON')).toExist(),
    )
  })

  test('shows loading when tables are being fetched', () => {
    const loadingModel: Model = {
      ...baseModel,
      route: SchemaTablesRoute.make({ name: 'public' }),
      schemaStats: Success(mockStats),
      tables: Loading(),
    }
    Scene.scene(
      { update, view },
      Scene.with(loadingModel),
      Scene.expect(Scene.text('Loading...')).toExist(),
    )
  })
})

describe('table detail view', () => {
  const tableModel: Model = {
    ...baseModel,
    route: TableDetailRoute.make({ schema: 'public', table: 'users' }),
    tableDetail: Success({
      table: 'users',
      owner: 'postgres',
      rls: { enabled: true, force: false, policies: [] },
      rbac: { table_grants: [], column_grants: [] },
      triggers: [],
      column_definitions: [
        {
          column_name: 'id',
          data_type: 'uuid',
          not_null: true,
          column_default: 'gen_random_uuid()',
          comment: null,
          ordinal_position: 1,
        },
        {
          column_name: 'email',
          data_type: 'text',
          not_null: true,
          column_default: null,
          comment: null,
          ordinal_position: 2,
        },
      ],
      constraint_definitions: [
        {
          constraint_name: 'users_pkey',
          constraint_type: 'p',
          definition: 'PRIMARY KEY (id)',
        },
      ],
      index_definitions: [],
      partition_info: null,
    }),
  }

  test('renders breadcrumb with schema and table names', () => {
    Scene.scene(
      { update, view },
      Scene.with(tableModel),
      Scene.expect(Scene.role('link', { name: 'Schemas' })).toExist(),
      Scene.expect(Scene.role('link', { name: 'public' })).toExist(),
    )
  })

  test('shows column definitions', () => {
    Scene.scene(
      { update, view },
      Scene.with(tableModel),
      Scene.expect(Scene.text('id')).toExist(),
      Scene.expect(Scene.text('uuid')).toExist(),
      Scene.expect(Scene.text('email')).toExist(),
      Scene.expect(Scene.text('text')).toExist(),
    )
  })

  test('shows constraint definitions', () => {
    Scene.scene(
      { update, view },
      Scene.with(tableModel),
      Scene.expect(Scene.text('users_pkey')).toExist(),
      Scene.expect(Scene.text('PRIMARY KEY')).toExist(),
    )
  })

  test('shows RLS status', () => {
    Scene.scene(
      { update, view },
      Scene.with(tableModel),
      Scene.expect(Scene.text('ON')).toExist(),
    )
  })
})

describe('function detail view', () => {
  const functionModel: Model = {
    ...baseModel,
    route: FunctionDetailRoute.make({ schema: 'public', fn: 'calculate_total' }),
    functionDetail: Success({
      info: {
        schema_name: 'public',
        function_name: 'calculate_total',
        function_signature: 'calculate_total(integer)',
        function_definition: 'BEGIN RETURN amount * 2; END;',
        return_type: 'integer',
        language: 'plpgsql',
        volatility: 'volatile',
        security_definer: false,
        function_arguments: 'amount integer',
        function_type: 'function',
        is_security_definer: false,
        comment: null,
      },
      grantRoles: [],
      dependencies: {
        name: 'calculate_total',
        schema: 'public',
        calls: ['helper_func'],
        calledBy: ['process_order'],
      },
    }),
  }

  test('renders breadcrumb with schema and function names', () => {
    Scene.scene(
      { update, view },
      Scene.with(functionModel),
      Scene.expect(Scene.role('link', { name: 'Schemas' })).toExist(),
      Scene.expect(Scene.role('link', { name: 'public' })).toExist(),
    )
  })

  test('shows function info cards', () => {
    Scene.scene(
      { update, view },
      Scene.with(functionModel),
      Scene.expect(Scene.text('plpgsql')).toExist(),
      Scene.expect(Scene.text('integer')).toExist(),
      Scene.expect(Scene.text('INVOKER')).toExist(),
    )
  })

  test('shows function arguments', () => {
    Scene.scene(
      { update, view },
      Scene.with(functionModel),
      Scene.expect(Scene.text('amount integer')).toExist(),
    )
  })

  test('shows dependency links', () => {
    Scene.scene(
      { update, view },
      Scene.with(functionModel),
      Scene.expect(Scene.text('helper_func')).toExist(),
      Scene.expect(Scene.text('process_order')).toExist(),
    )
  })

  test('shows function source code', () => {
    Scene.scene(
      { update, view },
      Scene.with(functionModel),
      Scene.expect(
        Scene.text('BEGIN RETURN amount * 2; END;'),
      ).toExist(),
    )
  })
})

describe('dependency tree view', () => {
  const mockGraph: ReadonlyArray<DependencyNode> = [
    {
      name: 'process_order',
      schema: 'public',
      calls: ['calculate_total', 'validate_input'],
      calledBy: [],
    },
    {
      name: 'calculate_total',
      schema: 'public',
      calls: [],
      calledBy: ['process_order'],
    },
    {
      name: 'validate_input',
      schema: 'public',
      calls: [],
      calledBy: ['process_order'],
    },
    {
      name: 'standalone_func',
      schema: 'public',
      calls: [],
      calledBy: [],
    },
  ]

  const dependenciesModel: Model = {
    ...baseModel,
    route: SchemaDependenciesRoute.make({ name: 'public' }),
    schemaStats: Success(mockStats),
    dependencyGraph: Success(mockGraph),
  }

  test('shows the dependency tree heading', () => {
    Scene.scene(
      { update, view },
      Scene.with(dependenciesModel),
      Scene.expect(
        Scene.role('heading', { name: 'Dependency Tree' }),
      ).toExist(),
    )
  })

  test('shows root functions in the tree', () => {
    Scene.scene(
      { update, view },
      Scene.with(dependenciesModel),
      Scene.expect(Scene.text('process_order')).toExist(),
    )
  })

  test('shows standalone functions section', () => {
    Scene.scene(
      { update, view },
      Scene.with(dependenciesModel),
      Scene.expect(Scene.text('standalone_func')).toExist(),
    )
  })

  test('shows empty message when no dependencies exist', () => {
    const emptyModel: Model = {
      ...baseModel,
      route: SchemaDependenciesRoute.make({ name: 'public' }),
      schemaStats: Success(mockStats),
      dependencyGraph: Success([]),
    }
    Scene.scene(
      { update, view },
      Scene.with(emptyModel),
      Scene.expect(
        Scene.text('No function dependencies found', { exact: false }),
      ).toExist(),
    )
  })
})

describe('not found view', () => {
  test('renders the not found heading and path', () => {
    const notFoundModel: Model = {
      ...baseModel,
      route: NotFoundRoute.make({ path: '/missing' }),
    }
    Scene.scene(
      { update, view },
      Scene.with(notFoundModel),
      Scene.expect(
        Scene.role('heading', { name: 'Page Not Found' }),
      ).toExist(),
      Scene.expect(Scene.text('/missing', { exact: false })).toExist(),
      Scene.expect(Scene.role('link', { name: 'Back to schemas' })).toExist(),
    )
  })
})

describe('header', () => {
  test('the header appears on every route with h1', () => {
    Scene.scene(
      { update, view },
      Scene.with(baseModel),
      Scene.expect(Scene.role('heading', { level: 1 })).toExist(),
    )
  })
})
