import type { Route, Tab } from "./model.js"

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "")
  if (!path) return { _tag: "SchemaList" }

  const parts = path.split("/")

  if (parts[0] === "schemas" && parts.length === 2) {
    return { _tag: "SchemaDetail", name: parts[1], tab: "tables" }
  }
  if (parts[0] === "schemas" && parts.length === 3) {
    const tab = parts[2] as Tab
    if (tab === "tables" || tab === "functions" || tab === "dependencies") {
      return { _tag: "SchemaDetail", name: parts[1], tab }
    }
  }
  if (parts[0] === "schemas" && parts[1] && parts[2] === "tables" && parts[3]) {
    return { _tag: "TableDetail", schema: parts[1], table: parts[3] }
  }
  if (parts[0] === "schemas" && parts[1] && parts[2] === "functions" && parts[3]) {
    return { _tag: "FunctionDetail", schema: parts[1], fn: parts[3] }
  }

  return { _tag: "SchemaList" }
}

export function routeToHash(route: Route): string {
  switch (route._tag) {
    case "SchemaList":
      return "#/"
    case "SchemaDetail":
      return `#/schemas/${route.name}/${route.tab}`
    case "TableDetail":
      return `#/schemas/${route.schema}/tables/${route.table}`
    case "FunctionDetail":
      return `#/schemas/${route.schema}/functions/${route.fn}`
  }
}
