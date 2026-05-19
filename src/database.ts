/**
 * Database layer for Tablerizer — Effect-TS version
 *
 * CONCEPTS EFFECT INTRODUITS :
 *   1. @effect/sql     → SqlClient, le service standard pour les queries
 *   2. @effect/sql-pg  → PgClient, l'implémentation PostgreSQL
 *   3. Layer.Layer     → le Layer est fourni par PgClient.layer()
 *
 * AVANT (notre code custom) :
 *   • DatabaseConnection — un Context.Tag fait main
 *   • PostgresConnectionLive — un Layer fait main avec acquireRelease
 *   • DatabaseError — une erreur custom
 *
 * APRÈS (@effect/sql) :
 *   • SqlClient.SqlClient — le Tag standard fourni par Effect
 *   • PgClient.layer()    — le Layer standard fourni par @effect/sql-pg
 *   • SqlError            — l'erreur standard fournie par @effect/sql
 *
 * Pourquoi c'est mieux ?
 *   • Plus besoin de gérer connect/disconnect manuellement
 *   • Connection pooling intégré
 *   • Compatible avec tout l'écosystème Effect (migrations, schemas, etc.)
 *   • On réutilise du code testé par la communauté
 */

import { Redacted } from "effect"
import * as PgClient from "@effect/sql-pg/PgClient"
import type { Layer } from "effect/Layer"
import type { SqlError } from "@effect/sql/SqlError"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RE-EXPORTS pour simplifier les imports dans le reste du code
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export { SqlClient } from "@effect/sql"
export { SqlError } from "@effect/sql/SqlError"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER : makeDbLayer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CONCEPT — PgClient.layer
//
// PgClient.layer() est l'équivalent de notre ancien
// PostgresConnectionLive, mais en MIEUX :
//   • Connection pooling automatique
//   • Gestion du cycle de vie (acquireRelease) intégrée
//   • Compatible avec les transactions, les streams, etc.
//
// Le Layer fournit DEUX services :
//   PgClient (spécifique PostgreSQL — listen/notify, json, etc.)
//   SqlClient (générique — queries, transactions)
//
// Notre code n'utilise que SqlClient, ce qui le rend portable :
// on pourrait théoriquement swapper pour MySQL/SQLite sans
// toucher aux queries.
//
// CONCEPT — Redacted
//
// L'URL de connexion contient un mot de passe. Effect utilise
// Redacted pour empêcher qu'il apparaisse dans les logs :
//   Redacted.make("postgres://user:pass@host/db")
//   → affiche "<redacted>" au lieu du mot de passe
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const makeDbLayer = (
  connectionString: string,
): Layer<PgClient.PgClient | import("@effect/sql").SqlClient.SqlClient, SqlError> => {
  const url = new URL(connectionString)
  const sslMode = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl")
  const ssl = sslMode === "require" || sslMode === "prefer" || sslMode === "true"
    ? { rejectUnauthorized: false }
    : sslMode === "verify-full"
      ? true
      : undefined

  return PgClient.layer({
    url: Redacted.make(connectionString),
    ssl,
  })
}

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
