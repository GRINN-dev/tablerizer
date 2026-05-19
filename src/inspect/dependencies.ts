import { Effect } from "effect"
import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql/SqlError"
import * as queries from "../queries.js"

export interface FunctionDependency {
  readonly name: string
  readonly schema: string
  readonly calls: string[]
  readonly calledBy: string[]
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractBody(definition: string): string {
  const dollarMatch = definition.match(/\$([^$]*)\$([\s\S]*)\$\1\$/)
  if (dollarMatch) return dollarMatch[2]
  const singleQuoteMatch = definition.match(/AS\s+'([\s\S]*)'/i)
  if (singleQuoteMatch) return singleQuoteMatch[1]
  return definition
}

function stripNoise(body: string): string {
  return body
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
}

function findCalledFunctions(body: string, pattern: RegExp): Set<string> {
  const cleaned = stripNoise(body)
  const found = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(cleaned)) !== null) {
    found.add(match[1].toLowerCase())
  }
  return found
}

function buildCallPattern(knownNames: string[]): RegExp | null {
  if (knownNames.length === 0) return null
  return new RegExp(
    `\\b(${knownNames.map(escapeRegex).join("|")})\\s*\\(`,
    "gi",
  )
}

export const buildDependencyGraph = (
  schema: string,
): Effect.Effect<FunctionDependency[], SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const functions = yield* queries.getFunctions(schema)
    const nameSet = new Set(functions.map((f) => f.function_name.toLowerCase()))
    const knownNames = [...nameSet]

    const graph = new Map<string, FunctionDependency>()
    const pattern = buildCallPattern(knownNames)

    for (const fn of functions) {
      const key = fn.function_name.toLowerCase()
      const body = extractBody(fn.function_definition)
      const found = pattern ? findCalledFunctions(body, pattern) : new Set<string>()
      found.delete(key)
      graph.set(key, { name: fn.function_name, schema, calls: [...found], calledBy: [] })
    }

    for (const [, dep] of graph) {
      for (const callee of dep.calls) {
        graph.get(callee)?.calledBy.push(dep.name)
      }
    }

    return [...graph.values()]
  })
