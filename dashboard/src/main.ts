import { Runtime } from 'foldkit'
import type { Url } from 'foldkit/url'
import { Model, NotAsked, urlToRoute } from './model.js'
import type { Model as ModelType } from './model.js'
import { ClickedLink, ChangedUrl, Message } from './messages.js'
import { update } from './update.js'
import { view } from './views/view.js'

// INIT

const init = (url: Url) => {
  const route = urlToRoute(url)
  const model: ModelType = {
    route,
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
  return update(model, ChangedUrl({ url }))
}

// RUN

// NOTE: Model Schema uses S.Unknown for RemoteData fields because the
// generic RemoteData<T> type cannot be expressed as an Effect Schema.
// The runtime only needs the Schema for DevTools serialization.
const program = Runtime.makeProgram({
  Model,
  container: document.getElementById('app'),
  init,
  update,
  view,
  routing: {
    onUrlRequest: (request: any) => ClickedLink({ request }),
    onUrlChange: (url: any) => ChangedUrl({ url }),
  },
  devTools: {
    show: 'Development',
    position: 'BottomRight',
    mode: 'TimeTravel',
    banner: 'Tablerizer Inspect',
    Message,
  },
} as any)

Runtime.run(program)

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}
