import { Array } from 'effect'
import { Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import type { Model, SchemaListItem } from '../model.js'
import { schemaTablesRouter } from '../model.js'
import { withRemote, statCard } from './helpers.js'

const h = html<Message>()

const schemaCard = (schema: SchemaListItem): Html =>
  h.keyed('div')(
    schema.schema_name,
    [h.Class('card')],
    [
      h.a(
        [h.Href(schemaTablesRouter({ name: schema.schema_name }))],
        [
          h.h3([], [schema.schema_name]),
          h.div([h.Class('stats')], [
            statCard(String(schema.table_count), 'tables'),
            statCard(String(schema.function_count), 'functions'),
            statCard(String(schema.view_count), 'views'),
            statCard(String(schema.matview_count), 'mat. views'),
          ]),
        ],
      ),
    ],
  )

export const schemaListView = (model: Model): Html =>
  h.section([], [
    h.h2([h.Class('section-title')], ['Schemas']),
    withRemote(model.schemas, (schemas) =>
      h.div([h.Class('card-grid')], Array.map(schemas, schemaCard)),
    ),
  ])
