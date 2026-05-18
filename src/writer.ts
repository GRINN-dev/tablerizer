/**
 * File system writer — Effect-TS version
 *
 * CONCEPT — Effect.forEach avec { discard: true }
 *
 * Effect.forEach itère sur une collection et exécute un Effect
 * pour chaque élément. Avec { discard: true }, on ignore les
 * résultats individuels et on retourne void.
 *
 * C'est l'équivalent de :
 *   for (const item of items) { await doSomething(item) }
 */

import { Effect, Data } from "effect"
import fs from "fs/promises"
import path from "path"

export class WriteError extends Data.TaggedError("WriteError")<{
  readonly filePath: string
  readonly cause: unknown
}> {}

export interface WriteTarget {
  filePath: string
  content: string
}

export const writeSnapshots = (
  targets: WriteTarget[],
): Effect.Effect<void, WriteError> =>
  Effect.forEach(
    targets,
    (target) =>
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(path.dirname(target.filePath), { recursive: true })
          await fs.writeFile(target.filePath, target.content)
        },
        catch: (cause) => new WriteError({ filePath: target.filePath, cause }),
      }),
    { discard: true },
  )
