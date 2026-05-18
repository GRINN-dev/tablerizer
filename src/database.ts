/**
 * Database layer for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. Context.Tag        → déclarer un service injectable
 *   2. Layer              → fournir l'implémentation d'un service
 *   3. acquireRelease     → gestion de ressources (comme try/finally)
 *   4. Effect.tryPromise  → wrapper une Promise dans un Effect
 */

import { Context, Effect, Layer, Data, pipe } from "effect"
import { SQL } from "bun"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERREUR TYPÉE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string
  readonly cause: unknown
}> {}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SERVICE : DatabaseConnection (Context.Tag)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CONCEPT — Context.Tag
//
// Un Tag déclare qu'un SERVICE existe, sans dire COMMENT le créer.
// C'est l'équivalent d'une interface dans un framework DI classique,
// mais avec une différence cruciale : c'est dans le TYPE.
//
// Quand une fonction a besoin de la DB, son type le dit :
//
//   Effect<User[], DatabaseError, DatabaseConnection>
//                                 ^^^^^^^^^^^^^^^^^^
//                                 "j'ai besoin de ce service"
//
// Si tu oublies de fournir le service → erreur de compilation.
// Pas de "container.resolve()" au runtime, pas de NullPointerException.
//
// Compare avec l'ancien code :
//   AVANT : function getUsers(db: DatabaseConnection) → dépendance en param
//   APRÈS : Effect<User[], Error, DatabaseConnection>  → dépendance dans le type
//
// La différence ? Avec Effect, la dépendance se PROPAGE automatiquement
// dans la composition. Tu n'as pas besoin de la passer manuellement
// à travers 10 couches d'appels.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class DatabaseConnection extends Context.Tag("DatabaseConnection")<
  DatabaseConnection,
  {
    readonly query: <T = any>(text: string, params?: any[]) => Effect.Effect<T[], DatabaseError>
  }
>() {}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER : BunSQLConnectionLive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CONCEPT — Layer
//
// Un Layer est une RECETTE pour construire un service.
// C'est le chaînon manquant entre "j'ai besoin de DatabaseConnection"
// et "voici comment la créer avec Bun SQL".
//
// L'avantage : tu peux swapper l'implémentation sans toucher au
// code métier. En test, on pourrait fournir un InMemoryLayer.
// En prod, on fournit BunSQLConnectionLive. Le code métier ne
// sait pas et ne se soucie pas de la différence.
//
// CONCEPT — Effect.acquireRelease
//
// Gère le cycle de vie d'une ressource en 2 phases :
//   1. acquire : créer/ouvrir la ressource
//   2. release : fermer/nettoyer la ressource (GARANTI, même en cas d'erreur)
//
// C'est comme try/finally, mais :
//   • le compilateur s'assure que release est défini
//   • la ressource est liée à un "scope" — elle vit tant que le scope existe
//   • pas de risque de fuites : la fermeture est automatique
//
// Dans notre cas :
//   acquire = new SQL(url) + SELECT 1 (vérification)
//   release = sql.close()
//
// Layer.scoped connecte acquireRelease au Layer :
// → la connexion est créée quand le Layer est construit
// → elle est fermée quand le programme se termine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const BunSQLConnectionLive = (
  connectionString: string,
): Layer.Layer<DatabaseConnection, DatabaseError> =>
  Layer.scoped(
    DatabaseConnection,
    pipe(
      // Phase 1 : ACQUIRE — créer la connexion
      //
      // Effect.tryPromise wrappe une Promise qui peut rejeter
      // en un Effect avec erreur typée.
      //
      //   AVANT : try { await sql.connect() } catch(e) { ??? }
      //   APRÈS : Effect.tryPromise({ try, catch })
      //
      // La différence : l'erreur est DANS le type, pas cachée.
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const sql = new SQL(connectionString)
            await sql.unsafe("SELECT 1")
            return sql
          },
          catch: (cause) =>
            new DatabaseError({
              message: `Connection failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            }),
        }),
        // Phase 2 : RELEASE — fermer la connexion
        // Garanti d'être appelé, même si le programme crash.
        // Effect.promise = comme tryPromise mais sans erreur attendue
        (sql) => Effect.promise(() => sql.close()),
      ),
      // Transformer la connexion SQL brute en service DatabaseConnection.
      // Effect.map transforme le résultat SANS affecter le cleanup :
      // la release function est déjà enregistrée dans le scope.
      Effect.map((sql) => ({
        query: <T = any>(text: string, params?: any[]) =>
          Effect.tryPromise({
            try: () => sql.unsafe(text, params) as Promise<T[]>,
            catch: (cause) =>
              new DatabaseError({
                message: `Query failed: ${cause instanceof Error ? cause.message : String(cause)}`,
                cause,
              }),
          }),
      })),
    ),
  )

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES DE DONNÉES (inchangés — ce sont de pures structures)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FunctionInfo {
  schema_name: string
  function_name: string
  function_signature: string
  function_definition: string
  return_type: string
  language: string
  volatility: string
  security_definer: boolean
  function_arguments: string
  function_type: string
  is_security_definer: boolean
  comment: string | null
}

export interface ColumnDefinition {
  column_name: string
  data_type: string
  not_null: boolean
  column_default: string | null
  comment: string | null
  ordinal_position: number
}

export interface ConstraintDefinition {
  constraint_name: string
  constraint_type: string
  definition: string
}

export interface IndexDefinition {
  index_name: string
  index_definition: string
  comment: string | null
}

export interface PartitionInfo {
  partition_strategy: string
  partition_key: string
}

export interface MaterializedViewInfo {
  schema_name: string
  matview_name: string
  definition: string
  owner: string
  comment: string | null
  is_populated: boolean
}

export interface TableData {
  table: string
  owner: string
  rls: {
    enabled: boolean
    force: boolean
    policies: Array<{
      policy: string
      cmd: string
      roles: string[] | null
      permissive: string
      using?: string | null
      with_check?: string | null
    }>
  }
  rbac: {
    table_grants: Array<{
      grantor: string
      grantee: string
      privilege: string
      is_grantable: boolean
    }>
    column_grants: Array<{
      column_name: string
      grantor: string
      grantee: string
      privilege: string
      is_grantable: boolean
    }>
  }
  triggers: Array<{
    trigger_name: string
    action_timing: string
    event_manipulation: string
    action_orientation: string
    action_statement: string
    action_condition: string | null
    action_order: number
  }>
  column_definitions: ColumnDefinition[]
  constraint_definitions: ConstraintDefinition[]
  index_definitions: IndexDefinition[]
  partition_info: PartitionInfo | null
  comment?: string
}
