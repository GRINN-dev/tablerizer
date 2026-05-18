/**
 * Configuration management for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. Data.TaggedError  → erreurs typées dans le système de types
 *   2. Schema            → types + validation en une seule déclaration
 *   3. Effect<A, E, R>   → calculs paresseux avec erreurs typées
 *   4. pipe              → composition lisible de transformations
 */

import { Effect, Data, pipe } from "effect"
import * as Schema from "effect/Schema"
import fs from "fs"
import path from "path"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARTIE 1 — ERREURS TYPÉES (Data.TaggedError)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// En TS vanilla : throw new Error("message")
//   → Le compilateur ne sait PAS qu'une fonction peut échouer.
//   → On attrape tout avec catch(e: unknown). Fragile.
//
// Avec Effect : chaque erreur est une classe avec un _tag unique.
// Le type Effect<A, E, R> encode E = les erreurs possibles.
// Le compilateur te FORCE à les gérer. Fini les oublis.
//
// Pense aux checked exceptions de Java, mais sans la lourdeur :
// l'inférence fait tout le travail.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class ConfigFileNotFound extends Data.TaggedError("ConfigFileNotFound")<{
  readonly searched: readonly string[]
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly issues: readonly string[]
}> {}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARTIE 2 — SCHÉMAS ET TYPES (Schema)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Un Schema c'est UN objet qui te donne :
//   • le TYPE TypeScript   →  typeof MonSchema.Type
//   • un DÉCODEUR runtime  →  Schema.decodeUnknownSync(MonSchema)
//   • un ENCODEUR          →  Schema.encodeSync(MonSchema)
//   • des messages d'erreur lisibles
//
// C'est comme Zod, mais intégré dans l'écosystème Effect.
//
// AVANT (vanilla TS) — 2 définitions, 2 sources de vérité :
//   interface Foo { name: string }
//   function validate(x: unknown): Foo { ... }
//
// APRÈS (Effect Schema) — 1 seule source de vérité :
//   const Foo = Schema.Struct({ name: Schema.String })
//   type Foo = typeof Foo.Type   // type dérivé automatiquement
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ExportScope = Schema.Literal(
  "tables", "functions", "views", "materialized-views", "all"
)
export type ExportScope = typeof ExportScope.Type

export const ALL_SCOPES: Exclude<ExportScope, "all">[] = [
  "tables", "functions", "views", "materialized-views",
]

// Le Schema EST la définition du type. Plus de duplication.
//
// NOTE : Schema.mutable rend les types mutables (string[] au lieu
// de readonly string[]). Effect est IMMUABLE par défaut — c'est
// voulu pour prévenir les bugs de mutation partagée. On utilise
// mutable ici pour rester compatible avec le code existant.
// Dans un projet 100% Effect, on garderait readonly.
export const TablerizerOptions = Schema.mutable(Schema.Struct({
  schemas: Schema.mutable(Schema.Array(Schema.String)),
  out: Schema.optional(Schema.String),
  roles: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  database_url: Schema.optional(Schema.String),
  role_mappings: Schema.optional(Schema.mutable(Schema.Record({ key: Schema.String, value: Schema.String }))),
  scope: Schema.optional(Schema.Union(ExportScope, Schema.mutable(Schema.Array(ExportScope)))),
  include_date: Schema.optional(Schema.Boolean),
  clean: Schema.optional(Schema.Boolean),
  silent: Schema.optional(Schema.Boolean),
}))
export type TablerizerOptions = typeof TablerizerOptions.Type

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARTIE 3 — FONCTIONS PURES (pas besoin d'Effect !)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// POINT CLÉ : Effect ne force PAS à tout wrapper.
// Une fonction pure (pas d'I/O, pas d'erreur significative)
// reste une fonction normale. Effect est là pour les effets de
// bord, pas pour ajouter de la cérémonie partout.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeScope(scope?: ExportScope | ExportScope[]): Exclude<ExportScope, "all">[] {
  if (!scope || scope === "all") return [...ALL_SCOPES]
  if (Array.isArray(scope)) return scope as Exclude<ExportScope, "all">[]
  return [scope as Exclude<ExportScope, "all">]
}

function expandEnvVars(
  value: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return value.replace(
    /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g,
    (match, braced, simple) => {
      const varName = braced || simple
      if (braced && braced.includes(":")) {
        const [envVar, defaultValue] = braced.split(":", 2)
        return env[envVar] || defaultValue
      }
      return env[varName] || match
    },
  )
}

function expandConfigEnvVars(
  obj: any,
  parentKey?: string,
  env?: Record<string, string | undefined>,
): any {
  if (typeof obj === "string") return expandEnvVars(obj, env)
  if (Array.isArray(obj)) return obj.map((item) => expandConfigEnvVars(item, undefined, env))
  if (obj && typeof obj === "object") {
    const expanded: any = {}
    if (parentKey === "role_mappings") {
      for (const [key, value] of Object.entries(obj)) {
        expanded[expandEnvVars(key, env)] = expandConfigEnvVars(value, undefined, env)
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        expanded[key] = expandConfigEnvVars(value, key, env)
      }
    }
    return expanded
  }
  return obj
}

export function getDefaultConfig(): TablerizerOptions {
  return {
    schemas: [],
    out: "./tables",
    roles: undefined,
    database_url: undefined,
    role_mappings: {},
    scope: "all",
    include_date: false,
    clean: true,
    silent: false,
  }
}

export function parseCliArgs(args: string[]): Partial<TablerizerOptions> {
  const result: Partial<TablerizerOptions> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    switch (arg) {
      case "--schema": result.schemas = [next]; i++; break
      case "--schemas": result.schemas = next.split(",").map((s) => s.trim()); i++; break
      case "--out": result.out = next; i++; break
      case "--role":
      case "--roles": result.roles = next.split(",").map((r) => r.trim()); i++; break
      case "--database-url": result.database_url = next; i++; break
      case "--scope": result.scope = next as ExportScope; i++; break
      case "--include-date": result.include_date = true; break
      case "--no-date": result.include_date = false; break
      case "--clean": result.clean = true; break
      case "--no-clean": result.clean = false; break
      case "--silent": result.silent = true; break
      case "--config": i++; break
    }
  }
  return result
}

export function parseEnvVars(
  env: Record<string, string | undefined>,
): Partial<TablerizerOptions> {
  const result: Partial<TablerizerOptions> = {}
  if (env.DATABASE_URL) result.database_url = env.DATABASE_URL
  if (env.SCHEMAS) result.schemas = env.SCHEMAS.split(",").map((s) => s.trim())
  if (env.OUTPUT_DIR) result.out = env.OUTPUT_DIR
  if (env.ROLES) result.roles = env.ROLES.split(",").map((r) => r.trim())
  return result
}

export interface ConfigLayers {
  file?: Partial<TablerizerOptions>
  env?: Partial<TablerizerOptions>
  cli?: Partial<TablerizerOptions>
}

export function resolveConfig(layers: ConfigLayers): TablerizerOptions {
  const defaults = getDefaultConfig()
  const file = layers.file ?? {}
  const env = layers.env ?? {}
  const cli = layers.cli ?? {}

  return {
    schemas: first([cli.schemas, env.schemas, file.schemas, defaults.schemas], isNonEmptyArray) ?? [],
    out: cli.out ?? env.out ?? file.out ?? defaults.out,
    roles: cli.roles ?? env.roles ?? file.roles ?? defaults.roles,
    database_url: cli.database_url ?? env.database_url ?? file.database_url ?? defaults.database_url,
    role_mappings: { ...defaults.role_mappings, ...file.role_mappings, ...env.role_mappings, ...cli.role_mappings },
    scope: cli.scope ?? env.scope ?? file.scope ?? defaults.scope,
    include_date: cli.include_date ?? env.include_date ?? file.include_date ?? defaults.include_date,
    clean: cli.clean ?? env.clean ?? file.clean ?? defaults.clean,
    silent: cli.silent ?? env.silent ?? file.silent ?? defaults.silent,
  }
}

function first<T>(candidates: (T | undefined)[], predicate: (v: T) => boolean): T | undefined {
  for (const c of candidates) {
    if (c !== undefined && predicate(c)) return c
  }
  return undefined
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARTIE 4 — FONCTIONS EFFECTFUL (Effect<A, E, R>)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CONCEPT — Effect<Success, Error, Requirements>
//
// Un Effect est une DESCRIPTION PARESSEUSE d'un calcul.
// Il ne s'exécute pas tout seul — il faut le "run" explicitement.
//
// Les 3 paramètres de type :
//   A (Success)      → ce que ça produit quand ça marche
//   E (Error)        → comment ça peut échouer (typé !)
//   R (Requirements) → les services nécessaires à l'exécution
//
// Exemples de signatures :
//   Effect<string, never, never>         → produit un string, ne peut PAS échouer
//   Effect<Config, ParseError, never>    → produit Config OU échoue avec ParseError
//   Effect<User, DbError, Database>      → a besoin d'un service Database
//
// CONCEPT — pipe
//
//   pipe(valeur, transformation1, transformation2, ...)
//
// C'est comme le |> de Elixir ou le . de méthode chaînée.
// Au lieu de : map(flatMap(effect, f), g)      ← illisible
// On écrit :   pipe(effect, flatMap(f), map(g)) ← linéaire
//
// CONCEPT — Effect.succeed / Effect.fail
//
// Les constructeurs de base :
//   Effect.succeed(42)            → Effect<number, never, never>
//   Effect.fail(new MyError())    → Effect<never, MyError, never>
//
// CONCEPT — Effect.try
//
// Wraps du code qui peut throw dans un Effect :
//   Effect.try({
//     try: () => JSON.parse(str),
//     catch: (e) => new ParseError({ cause: e })
//   })
// → Effect<unknown, ParseError, never>
//
// CONCEPT — Effect.flatMap
//
// Enchaîne deux Effects : le second dépend du résultat du premier.
// C'est le "then" de Promise, mais qui retourne un Effect.
//   pipe(
//     readFile,                           // Effect<string, ReadError>
//     Effect.flatMap((content) =>         // content: string
//       parseJson(content)                // Effect<Json, ParseError>
//     )
//   )
// → Effect<Json, ReadError | ParseError>  ← les erreurs s'UNIONNENT !
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Cherche un fichier de config dans le répertoire courant.
 *
 * Retourne : Effect<string, ConfigFileNotFound>
 *   → succès : le chemin absolu du fichier trouvé
 *   → échec  : ConfigFileNotFound (avec la liste des chemins cherchés)
 *
 * Note : "fichier non trouvé" est modélisé comme une ERREUR typée,
 * pas comme null. L'appelant peut décider quoi faire avec
 * Effect.catchTag("ConfigFileNotFound", ...) — par ex. utiliser
 * les défauts. C'est plus explicite que `if (result === null)`.
 */
export const findConfigFile: Effect.Effect<string, ConfigFileNotFound> = (() => {
  const candidates = [".tablerizerrc", ".tablerizerrc.json"]
  return pipe(
    // Effect.sync wraps du code synchrone sans erreur dans un Effect
    Effect.sync(() => {
      for (const name of candidates) {
        const p = path.resolve(process.cwd(), name)
        if (fs.existsSync(p)) return p
      }
      return null as string | null
    }),
    // flatMap : si trouvé → succeed, sinon → fail
    Effect.flatMap((found) =>
      found !== null
        ? Effect.succeed(found)
        : Effect.fail(new ConfigFileNotFound({ searched: candidates }))
    ),
  )
})()

/**
 * Parse le contenu JSON d'un fichier de config.
 *
 * Ici on combine DEUX sources d'erreur potentielles :
 *   1. JSON.parse peut throw      → capturé par Effect.try
 *   2. Le Schema peut rejeter     → capturé par Effect.flatMap
 *
 * Avec pipe, on voit le flux de données de haut en bas :
 *   JSON string → parsed object → env-expanded → schema-validated
 */
export const parseConfigFile = (
  jsonContent: string,
  env?: Record<string, string | undefined>,
): Effect.Effect<Partial<TablerizerOptions>, ConfigParseError> =>
  pipe(
    // Étape 1 : parser le JSON (peut throw → Effect.try le capture)
    Effect.try({
      try: () => JSON.parse(jsonContent),
      catch: (cause) =>
        new ConfigParseError({
          message: `Invalid JSON: ${cause instanceof Error ? cause.message : cause}`,
          cause,
        }),
    }),
    // Étape 2 : expansion des variables d'environnement (pur, pas d'erreur)
    // Pas de validation Schema ici : le fichier de config est PARTIEL par design.
    // La validation complète se fait dans validateConfig(), après la fusion des couches.
    Effect.map((raw) => expandConfigEnvVars(raw, undefined, env) as Partial<TablerizerOptions>),
  )

/**
 * Valide la config résolue (schemas non vide, database_url présent).
 *
 * C'est la version Effect de l'ancien validateConfig() qui faisait
 * throw. Maintenant les erreurs sont dans le TYPE :
 *
 *   Avant : function validateConfig(c: Config): void    // throw caché
 *   Après : function validateConfig(c: Config): Effect<Config, ConfigValidationError>
 *
 * L'appelant VOIT que ça peut échouer. Impossible d'oublier.
 */
export const validateConfig = (
  config: TablerizerOptions,
): Effect.Effect<TablerizerOptions, ConfigValidationError> => {
  const issues: string[] = []

  if (!config.schemas || config.schemas.length === 0) {
    issues.push("At least one schema must be specified")
  }
  if (!config.database_url) {
    issues.push("Database URL must be provided")
  }
  if (config.schemas) {
    for (const schema of config.schemas) {
      if (!schema || schema.trim().length === 0) {
        issues.push("Schema names cannot be empty")
        break
      }
    }
  }

  return issues.length > 0
    ? Effect.fail(new ConfigValidationError({ issues }))
    : Effect.succeed(config)
}
