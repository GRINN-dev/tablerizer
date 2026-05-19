import { Array } from 'effect'
import { Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import type { Model } from '../model.js'
import {
  schemaListRouter,
  schemaFunctionsRouter,
  functionDetailRouter,
} from '../model.js'
import { withRemote, statCard } from './helpers.js'

const h = html<Message>()

const breadcrumbs = (schema: string, fn: string): Html =>
  h.nav([h.Class('breadcrumbs'), h.AriaLabel('Breadcrumb')], [
    h.a([h.Href(schemaListRouter())], ['Schemas']),
    h.span([], [' / ']),
    h.a([h.Href(schemaFunctionsRouter({ name: schema }))], [schema]),
    h.span([], [' / ']),
    h.span([], [fn]),
  ])

const dependencyLinks = (
  names: ReadonlyArray<string>,
  schema: string,
): Html =>
  h.ul(
    [h.Class('tree')],
    Array.map(names, (name) =>
      h.keyed('li')(name, [], [
        h.a([h.Href(functionDetailRouter({ schema, fn: name }))], [name]),
      ]),
    ),
  )

export const functionDetailView = (
  model: Model,
  schema: string,
  fn: string,
): Html =>
  h.section([], [
    breadcrumbs(schema, fn),
    withRemote(model.functionDetail, (detail) =>
      h.div([], [
        h.div([h.Class('card-grid')], [
          statCard(detail.info.function_type, 'Type'),
          statCard(detail.info.language, 'Language'),
          statCard(detail.info.return_type, 'Returns'),
          statCard(
            detail.info.is_security_definer ? 'DEFINER' : 'INVOKER',
            'Security',
          ),
          statCard(String(detail.dependencies.calls.length), 'Calls'),
          statCard(
            String(detail.dependencies.calledBy.length),
            'Called By',
          ),
        ]),

        detail.info.function_arguments
          ? h.div([], [
              h.h3([h.Class('section-title')], ['Arguments']),
              h.div([h.Class('code-block')], [
                detail.info.function_arguments,
              ]),
            ])
          : h.empty,

        Array.isReadonlyArrayNonEmpty(detail.dependencies.calls)
          ? h.div([], [
              h.h3([h.Class('section-title')], ['Calls']),
              dependencyLinks(detail.dependencies.calls, schema),
            ])
          : h.empty,

        Array.isReadonlyArrayNonEmpty(detail.dependencies.calledBy)
          ? h.div([], [
              h.h3([h.Class('section-title')], ['Called By']),
              dependencyLinks(detail.dependencies.calledBy, schema),
            ])
          : h.empty,

        h.h3([h.Class('section-title')], ['Source']),
        h.div([h.Class('code-block')], [
          h.pre([], [h.code([], [detail.info.function_definition])]),
        ]),
      ]),
    ),
  ])
