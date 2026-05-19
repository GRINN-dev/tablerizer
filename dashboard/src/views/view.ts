import { Match as M } from 'effect'
import { Document, Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import type { Model } from '../model.js'
import { routeTitle, schemaListRouter } from '../model.js'
import { schemaListView } from './schema-list.js'
import {
  schemaTablesView,
  schemaFunctionsView,
  schemaDependenciesView,
  schemaGraphView,
} from './schema-detail.js'
import { tableDetailView } from './table-detail.js'
import { functionDetailView } from './function-detail.js'

// VIEW

const h = html<Message>()

const routeContent = (model: Model): Html =>
  M.value(model.route).pipe(
    M.tagsExhaustive({
      SchemaList: () => schemaListView(model),
      SchemaTables: ({ name }) => schemaTablesView(model, name),
      SchemaFunctions: ({ name }) => schemaFunctionsView(model, name),
      SchemaDependencies: ({ name }) => schemaDependenciesView(model, name),
      SchemaGraph: ({ name }) => schemaGraphView(model, name),
      TableDetail: ({ schema, table }) =>
        tableDetailView(model, schema, table),
      FunctionDetail: ({ schema, fn }) =>
        functionDetailView(model, schema, fn),
      NotFound: ({ path }) =>
        h.section([], [
          h.h2([h.Class('section-title')], ['Page Not Found']),
          h.p([], [`The path "${path}" was not found.`]),
          h.a([h.Href(schemaListRouter())], ['Back to schemas']),
        ]),
    }),
  )

export const view = (model: Model): Document => ({
  title: routeTitle(model.route),
  body: h.div([], [
    h.header([h.Class('header')], [
      h.div([h.Class('container')], [
        h.h1([], [
          h.a([h.Href(schemaListRouter())], ['Tablerizer ', h.span([], ['Inspect'])]),
        ]),
      ]),
    ]),
    h.main([h.Class('container')], [
      h.keyed('div')(model.route._tag, [], [routeContent(model)]),
    ]),
  ]),
})
