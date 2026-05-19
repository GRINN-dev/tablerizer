import { Match as M } from 'effect'
import { Html, html } from 'foldkit/html'
import type { Message } from '../messages.js'
import type { RemoteData } from '../model.js'

const h = html<Message>()

export const withRemote = <T>(
  remoteData: RemoteData<T>,
  onSuccess: (data: T) => Html,
): Html => {
  if (remoteData._tag === 'NotAsked') {
    return h.div([], [])
  }
  if (remoteData._tag === 'Loading') {
    return h.p([h.Class('loading'), h.Role('status')], ['Loading...'])
  }
  if (remoteData._tag === 'Failure') {
    return h.p([h.Class('error'), h.Role('alert')], [remoteData.error])
  }
  return onSuccess(remoteData.data)
}

export const statCard = (value: string, label: string): Html =>
  h.div([h.Class('card')], [
    h.div([h.Class('stat')], [
      h.span([h.Class('value')], [value]),
      h.span([h.Class('label')], [label]),
    ]),
  ])

export const constraintLabel = (type: string): string =>
  M.value(type).pipe(
    M.when('p', () => 'PRIMARY KEY'),
    M.when('u', () => 'UNIQUE'),
    M.when('f', () => 'FOREIGN KEY'),
    M.when('c', () => 'CHECK'),
    M.when('x', () => 'EXCLUSION'),
    M.orElse(() => type),
  )
