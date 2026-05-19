import {
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import type { HttpPlatform } from "@effect/platform/HttpPlatform"
import type { PlatformError } from "@effect/platform/Error"
import type { HttpBody } from "@effect/platform"
import { Effect } from "effect"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, "../../dashboard/dist")

export const spaHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const urlPath = new URL(request.url, "http://localhost").pathname

  if (urlPath !== "/" && urlPath.includes(".")) {
    const filePath = path.join(DIST_DIR, urlPath)
    return yield* HttpServerResponse.file(filePath)
  }

  return yield* HttpServerResponse.file(path.join(DIST_DIR, "index.html"))
}).pipe(
  Effect.catchAll(() =>
    HttpServerResponse.file(path.join(DIST_DIR, "index.html")),
  ),
)
