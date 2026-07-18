import { RuleT } from "#src/types.ts"

// Loads a rule pack from a local path or a remote URL, parses JSON, and runs
// lightweight structural validation against the pack contract (see
// rules/schema.json for the full spec). We do NOT pull a full JSON-Schema
// validator dependency — just the hard constraints an agent would miss.
//
// Usage:
//   loadRulePack("./rules/e-commerce.json")
//   loadRulePack("https://example.com/my-pack.json")

const ID_PATTERN = /^[A-Z]{2,6}-\d{2,3}$/
const CHECK_TYPES = [
  "selector",
  "header",
  "regex",
  "fetch",
  "script",
  "composite",
  "custom",
  "jsonld",
]

export async function loadRulePack(source: string): Promise<RuleT> {
  const raw = await readSource(source)
  let pack: unknown
  try {
    pack = JSON.parse(raw)
  } catch (e) {
    throw new Error(
      `Rule pack at "${source}" is not valid JSON: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }
  validatePack(pack, source)
  return pack as RuleT
}

async function readSource(source: string): Promise<string> {
  // Remote URL
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, {
      headers: { "User-Agent": "webalyzer/1.0 (+https://github.com/a4arpon/webalyzer)" },
    })
    if (!res.ok) {
      throw new Error(
        `Failed to fetch rule pack "${source}": HTTP ${res.status}`,
      )
    }
    return await res.text()
  }

  // Local path (Deno FS)
  try {
    return await Deno.readTextFile(source)
  } catch (e) {
    throw new Error(
      `Failed to read rule pack "${source}": ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }
}

function validatePack(pack: unknown, source: string): void {
  if (typeof pack !== "object" || pack === null) {
    throw new Error(`Rule pack "${source}" must be a JSON object`)
  }
  const p = pack as Record<string, unknown>

  if (typeof p.metadata !== "object" || p.metadata === null) {
    throw new Error(`Rule pack "${source}" missing "metadata" object`)
  }
  const meta = p.metadata as Record<string, unknown>
  for (const key of ["name", "version", "createdBy", "updatedAt"] as const) {
    if (!(key in meta)) {
      throw new Error(`Rule pack "${source}" metadata missing "${key}"`)
    }
  }

  if (typeof p.rules !== "object" || p.rules === null) {
    throw new Error(`Rule pack "${source}" missing "rules" object`)
  }
  const rules = p.rules as Record<string, Record<string, unknown>>

  for (const [id, rule] of Object.entries(rules)) {
    if (!ID_PATTERN.test(id)) {
      throw new Error(
        `Rule pack "${source}": rule id "${id}" must match ^[A-Z]{2,6}-\\d{2,3}$`,
      )
    }
    if (rule.id !== id) {
      throw new Error(
        `Rule pack "${source}": rule key "${id}" must equal its "id" field ("${rule.id}")`,
      )
    }
    for (const key of ["name", "category", "priority", "check"] as const) {
      if (!(key in rule)) {
        throw new Error(`Rule pack "${source}": rule "${id}" missing "${key}"`)
      }
    }
    const check = rule.check as Record<string, unknown>
    if (typeof check.type !== "string" || !CHECK_TYPES.includes(check.type)) {
      throw new Error(
        `Rule pack "${source}": rule "${id}" has invalid check.type "${check.type}"`,
      )
    }
  }
}
