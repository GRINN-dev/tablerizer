import { Array } from 'effect'
import { Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import type { Model } from '../model.js'
import { schemaListRouter, schemaTablesRouter } from '../model.js'
import { withRemote, statCard, constraintLabel } from './helpers.js'

const h = html<Message>()

const breadcrumbs = (schema: string, table: string): Html =>
  h.nav([h.Class('breadcrumbs'), h.AriaLabel('Breadcrumb')], [
    h.a([h.Href(schemaListRouter())], ['Schemas']),
    h.span([], [' / ']),
    h.a([h.Href(schemaTablesRouter({ name: schema }))], [schema]),
    h.span([], [' / ']),
    h.span([], [table]),
  ])

export const tableDetailView = (
  model: Model,
  schema: string,
  table: string,
): Html =>
  h.section([], [
    breadcrumbs(schema, table),
    withRemote(model.tableDetail, (detail) =>
      h.div([], [
        h.div([h.Class('card-grid')], [
          statCard(String(detail.column_definitions.length), 'Columns'),
          statCard(
            String(detail.constraint_definitions.length),
            'Constraints',
          ),
          statCard(String(detail.index_definitions.length), 'Indexes'),
          statCard(String(detail.triggers.length), 'Triggers'),
          statCard(String(detail.rls.policies.length), 'Policies'),
          statCard(detail.rls.enabled ? 'ON' : 'OFF', 'RLS'),
        ]),

        h.h3([h.Class('section-title')], ['Columns']),
        h.div([h.Class('table-wrap')], [
          h.table([], [
            h.thead([], [
              h.tr([], [
                h.th([], ['#']),
                h.th([], ['Name']),
                h.th([], ['Type']),
                h.th([], ['Nullable']),
                h.th([], ['Default']),
              ]),
            ]),
            h.tbody(
              [],
              Array.map(detail.column_definitions, (column) =>
                h.keyed('tr')(column.column_name, [], [
                  h.td([], [String(column.ordinal_position)]),
                  h.td([], [column.column_name]),
                  h.td([], [column.data_type]),
                  h.td([], [
                    h.span(
                      [
                        h.Class(
                          column.not_null
                            ? 'badge badge-green'
                            : 'badge badge-gray',
                        ),
                      ],
                      [column.not_null ? 'NOT NULL' : 'nullable'],
                    ),
                  ]),
                  h.td([], [column.column_default ?? '']),
                ]),
              ),
            ),
          ]),
        ]),

        Array.isReadonlyArrayNonEmpty(detail.constraint_definitions)
          ? h.div([], [
              h.h3([h.Class('section-title')], ['Constraints']),
              h.div([h.Class('table-wrap')], [
                h.table([], [
                  h.thead([], [
                    h.tr([], [
                      h.th([], ['Name']),
                      h.th([], ['Type']),
                      h.th([], ['Definition']),
                    ]),
                  ]),
                  h.tbody(
                    [],
                    Array.map(detail.constraint_definitions, (constraint) =>
                      h.keyed('tr')(constraint.constraint_name, [], [
                        h.td([], [constraint.constraint_name]),
                        h.td([], [
                          h.span(
                            [h.Class('badge badge-blue')],
                            [constraintLabel(constraint.constraint_type)],
                          ),
                        ]),
                        h.td([], [h.code([], [constraint.definition])]),
                      ]),
                    ),
                  ),
                ]),
              ]),
            ])
          : h.empty,

        Array.isReadonlyArrayNonEmpty(detail.index_definitions)
          ? h.div([], [
              h.h3([h.Class('section-title')], ['Indexes']),
              h.div([h.Class('table-wrap')], [
                h.table([], [
                  h.thead([], [
                    h.tr([], [h.th([], ['Name']), h.th([], ['Definition'])]),
                  ]),
                  h.tbody(
                    [],
                    Array.map(detail.index_definitions, (index) =>
                      h.keyed('tr')(index.index_name, [], [
                        h.td([], [index.index_name]),
                        h.td([], [h.code([], [index.index_definition])]),
                      ]),
                    ),
                  ),
                ]),
              ]),
            ])
          : h.empty,

        Array.isReadonlyArrayNonEmpty(detail.rls.policies)
          ? h.div([], [
              h.h3([h.Class('section-title')], ['RLS Policies']),
              h.div([h.Class('table-wrap')], [
                h.table([], [
                  h.thead([], [
                    h.tr([], [
                      h.th([], ['Policy']),
                      h.th([], ['Command']),
                      h.th([], ['Permissive']),
                      h.th([], ['Roles']),
                    ]),
                  ]),
                  h.tbody(
                    [],
                    Array.map(detail.rls.policies, (policy) =>
                      h.keyed('tr')(policy.policy, [], [
                        h.td([], [policy.policy]),
                        h.td([], [policy.cmd]),
                        h.td([], [policy.permissive]),
                        h.td([], [policy.roles?.join(', ') ?? 'ALL']),
                      ]),
                    ),
                  ),
                ]),
              ]),
            ])
          : h.empty,

        Array.isReadonlyArrayNonEmpty(detail.triggers)
          ? h.div([], [
              h.h3([h.Class('section-title')], ['Triggers']),
              h.div([h.Class('table-wrap')], [
                h.table([], [
                  h.thead([], [
                    h.tr([], [
                      h.th([], ['Name']),
                      h.th([], ['Timing']),
                      h.th([], ['Event']),
                      h.th([], ['Statement']),
                    ]),
                  ]),
                  h.tbody(
                    [],
                    Array.map(detail.triggers, (trigger) =>
                      h.keyed('tr')(trigger.trigger_name, [], [
                        h.td([], [trigger.trigger_name]),
                        h.td([], [trigger.action_timing]),
                        h.td([], [trigger.event_manipulation]),
                        h.td([], [h.code([], [trigger.action_statement])]),
                      ]),
                    ),
                  ),
                ]),
              ]),
            ])
          : h.empty,
      ]),
    ),
  ])
