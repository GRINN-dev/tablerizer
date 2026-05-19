import { HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect, pipe } from "effect"
import * as existingQueries from "../queries.js"
import * as inspectQueries from "./queries.js"
import { scanTable, scanFunction } from "../scanner.js"
import { buildDependencyGraph } from "./dependencies.js"

const withErrorHandler = <R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
  effect.pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.log(`API error: ${error}`)
        return HttpServerResponse.unsafeJson(
          { error: String(error) },
          { status: 500 },
        )
      }),
    ),
  )

export const apiRouter = pipe(
  HttpRouter.empty,

  HttpRouter.get(
    "/schemas",
    withErrorHandler(
      pipe(inspectQueries.getSchemaList(), Effect.flatMap((data) => HttpServerResponse.json(data))),
    ),
  ),

  HttpRouter.get(
    "/schemas/:name",
    withErrorHandler(
      Effect.gen(function* () {
        const { name } = yield* HttpRouter.params
        const stats = yield* inspectQueries.getSchemaStats(name!)
        if (!stats) {
          return HttpServerResponse.unsafeJson({ error: "Schema not found" }, { status: 404 })
        }
        return yield* HttpServerResponse.json(stats)
      }),
    ),
  ),

  HttpRouter.get(
    "/schemas/:name/tables",
    withErrorHandler(
      Effect.gen(function* () {
        const { name } = yield* HttpRouter.params
        const tables = yield* inspectQueries.getTableList(name!)
        return yield* HttpServerResponse.json(tables)
      }),
    ),
  ),

  HttpRouter.get(
    "/schemas/:name/tables/:table",
    withErrorHandler(
      Effect.gen(function* () {
        const { name, table } = yield* HttpRouter.params
        const data = yield* scanTable(name!, table!)
        return yield* HttpServerResponse.json(data)
      }),
    ),
  ),

  HttpRouter.get(
    "/schemas/:name/functions",
    withErrorHandler(
      Effect.gen(function* () {
        const { name } = yield* HttpRouter.params
        const functions = yield* existingQueries.getFunctions(name!)
        return yield* HttpServerResponse.json(functions)
      }),
    ),
  ),

  HttpRouter.get(
    "/schemas/:name/functions/:fn",
    withErrorHandler(
      Effect.gen(function* () {
        const { name, fn } = yield* HttpRouter.params
        const funcData = yield* scanFunction(name!, fn!)
        const graph = yield* buildDependencyGraph(name!)
        const deps = graph.find(
          (d) => d.name.toLowerCase() === fn!.toLowerCase(),
        )
        return yield* HttpServerResponse.json({
          ...funcData,
          dependencies: deps ?? { name: fn!, schema: name!, calls: [], calledBy: [] },
        })
      }),
    ),
  ),

  HttpRouter.get(
    "/schemas/:name/dependencies",
    withErrorHandler(
      Effect.gen(function* () {
        const { name } = yield* HttpRouter.params
        yield* Effect.log(`Building dependency graph for schema: ${name}`)
        const graph = yield* buildDependencyGraph(name!)
        yield* Effect.log(`Dependency graph built: ${graph.length} nodes`)
        return yield* HttpServerResponse.json(graph)
      }),
    ),
  ),
)
