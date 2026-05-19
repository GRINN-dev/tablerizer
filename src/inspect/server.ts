import {
  HttpRouter,
  HttpServer,
  HttpMiddleware,
  HttpServerResponse,
} from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer, pipe } from "effect"
import { createServer } from "node:http"
import { makeDbLayer } from "../database.js"
import { apiRouter } from "./routes.js"
import { spaHandler } from "./static.js"

export interface InspectOptions {
  readonly database_url: string
  readonly schemas: string[]
  readonly port: number
}

export const runInspectServer = (options: InspectOptions) => {
  const router = pipe(
    HttpRouter.empty,
    HttpRouter.mount("/api", apiRouter),
    HttpRouter.all("*", spaHandler),
  )

  const HttpLive = pipe(
    router,
    HttpServer.serve(HttpMiddleware.logger),
    Layer.provide(
      NodeHttpServer.layer(() => createServer(), { port: options.port }),
    ),
    Layer.provide(makeDbLayer(options.database_url)),
  )

  return pipe(
    Effect.log(
      `Tablerizer inspect running at http://localhost:${options.port}`,
    ),
    Effect.flatMap(() => Layer.launch(HttpLive)),
  )
}
