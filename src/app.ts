import { log } from "node:console"
import { RuleCheckerEngine } from "#src/engine.ts"
import { formatReport, type OutputType } from "#src/display.ts"
import { AppBranding, AppConfig, EngineDefaults } from "#src/config.ts"
import {
  loadRulePacks,
  mergeRulePacks,
  validatePack,
} from "#src/rules-loader.ts"
import { discoverUrls } from "#src/crawler.ts"
import { matchPath, parseSiteSpec } from "#src/site-spec.ts"
import { RuleT } from "#src/types.ts"
// Default pack, EMBEDDED so compiled binaries work from any cwd.
import corePack from "./assets/core.json" with { type: "json" }

// The bundled core pack, validated once at startup. Runs on every audit
// unless --no-default-rule is passed (or the user's --rule packs replace
// same-ID rules via merge, later pack wins).
function defaultPack(): RuleT {
  const pack = corePack as RuleT
  validatePack(pack, "<embedded src/assets/core.json>")
  return pack
}

// Built-in skill packs. Listed when no --rule is supplied so an agent knows
// exactly where to load skills from. URLs point at raw rule packs on the
// default branch of the official webalyzer repo.
interface BuiltInSkill {
  name: string
  description: string
  url: string
}

const BUILTIN_SKILLS: BuiltInSkill[] = [
  {
    name: "core",
    description:
      "Everything pack (DEFAULT — bundled in the binary): SEO + Open Graph + JSON-LD + accessibility (alt, labels, roles, landmarks, heading order, duplicate ids) + AI-agent navigability (llms.txt, clickable hooks, dead links, forms). 40 rules.",
    url:
      "https://raw.githubusercontent.com/a4arpon/site-analyzer/main/src/assets/core.json",
  },
  {
    name: "e-commerce",
    description:
      "Commerce add-on: Product/Offer/BreadcrumbList JSON-LD validity (price, currency, availability). Merges on top of the default core: --rule=<url or path>.",
    url:
      "https://raw.githubusercontent.com/a4arpon/site-analyzer/main/src/assets/e-commerce.json",
  },
  // Add more built-in packs here as they are authored in src/assets/.
]

const OUTPUT_TYPES: OutputType[] = [
  "overview",
  "info",
  "agent",
  "compact-agent",
]

function parseArgs(argv: string[]): {
  site?: string
  rule?: string
  output?: string
  noDefaultRule: boolean
} {
  const out: {
    site?: string
    rule?: string
    output?: string
    noDefaultRule: boolean
  } = { noDefaultRule: false }
  for (const arg of argv) {
    if (arg === "--no-default-rule") {
      out.noDefaultRule = true
      continue
    }
    const m = arg.match(/^--([\w-]+)=(.*)$/)
    if (!m) continue
    if (m[1] === "site") out.site = m[2]
    else if (m[1] === "rule") out.rule = m[2]
    else if (m[1] === "output-type") out.output = m[2]
  }
  return out
}

const { site, rule, output, noDefaultRule } = parseArgs(Deno.args)

if (!site) {
  log(
    "Usage: deno task dev --site=<url-or-spec> [--rule=<packs>] [--no-default-rule] [--output-type=<mode>]",
  )
  log("  --site        target website (required). Two forms:")
  log(
    "                  plain URL        → audit ONLY that page (no sitemap crawl)",
  )
  log("                  URL with a glob  → sitemap discovery + path filter")
  log("                  e.g. https://example.com/about")
  log("                  e.g. https://example.com/community-docs/*   (subtree)")
  log(
    "                  e.g. https://example.com/*                  (whole site)",
  )
  log("  --rule        comma-separated packs (optional): merged ON TOP of the")
  log("                  bundled core pack (src/assets/core.json, embedded in")
  log("                  the binary — no file on disk needed).")
  log("                  e.g. --rule=./src/assets/e-commerce.json")
  log("  --no-default-rule  exclude the bundled core pack. Without --rule this")
  log("                  prints suggested skill packs and exits (no audit).")
  log(`  --output-type ${OUTPUT_TYPES.join("|")} (default: info)`)
  log(`${AppBranding.maintainer} │ ${AppBranding.repo}`)
  Deno.exit(1)
}

let spec: ReturnType<typeof parseSiteSpec>
try {
  spec = parseSiteSpec(site)
} catch (err) {
  log(`Invalid --site: ${err instanceof Error ? err.message : String(err)}`)
  Deno.exit(1)
}

const outputType: OutputType = (output as OutputType) ?? "info"
if (!OUTPUT_TYPES.includes(outputType)) {
  log(
    `Invalid --output-type "${output}". Use one of: ${OUTPUT_TYPES.join(", ")}`,
  )
  Deno.exit(1)
}

// Machine-output modes: progress goes to stderr so stdout stays parseable.
const machineMode = outputType === "agent" || outputType === "compact-agent"
const enc = new TextEncoder()
const status = (msg: string) => {
  if (machineMode) Deno.stderr.writeSync(enc.encode(msg + "\n"))
  else log(msg)
}

// No rules to run at all (opted out of defaults, supplied none) → suggest
// built-in skill packs so the agent knows where to load skills from. In
// machine modes stdout stays PURE JSON (messages + branding → stderr).
if (!rule && noDefaultRule) {
  if (machineMode) {
    Deno.stderr.writeSync(
      enc.encode(
        "[WARN] --no-default-rule without --rule. Nothing audited.\n",
      ),
    )
    Deno.stderr.writeSync(
      enc.encode("Load a skill pack with --rule=<path-or-url>.\n"),
    )
    Deno.stderr.writeSync(
      enc.encode(
        `${AppBranding.tagline} ${AppBranding.maintainer} │ ${AppBranding.repo}\n`,
      ),
    )
  } else {
    log(
      "\x1b[33m[WARN]\x1b[0m --no-default-rule without --rule. Nothing audited.",
    )
    log(
      "Load a skill pack with --rule=<path-or-url>. Suggested built-in skills:",
    )
    log(
      `${AppBranding.tagline} ${AppBranding.maintainer} │ ${AppBranding.repo}`,
    )
  }
  log(JSON.stringify(BUILTIN_SKILLS, null, 2))
  Deno.exit(0)
}

// Pack resolution: bundled core first (unless opted out), then the user's
// --rule packs on top — later packs win on rule-ID collision.
let pack: RuleT
if (noDefaultRule) {
  pack = rule ? await loadRulePacks(rule) : defaultPack() // unreachable: gated above
} else if (rule) {
  const userPacks = await loadRulePacks(rule)
  pack = mergeRulePacks([defaultPack(), userPacks], [
    "<embedded core>",
    rule,
  ])
} else {
  pack = defaultPack()
}

const engine = new RuleCheckerEngine(pack, {
  concurrency: EngineDefaults.concurrency,
  cache: EngineDefaults.cache,
  fetch: {
    timeoutMs: EngineDefaults.fetch.timeoutMs,
    userAgent: AppConfig.userAgent,
  },
  // Silence engine's own stdout logging in machine modes (it uses node:console).
  logLevel: machineMode ? "silent" : "info",
})

// URL resolution:
//   no glob  → single page, skip ALL sitemap discovery (fast path)
//   glob     → sitemap discovery, filter by path pattern
let targets: string[]
if (!spec.glob) {
  targets = [spec.seedUrl]
  status(
    `\x1b[36m[INF]\x1b[0m Scope: single page (no sitemap crawl) → ${spec.seedUrl}`,
  )
} else {
  const discovered = await discoverUrls(spec.origin, {
    userAgent: AppConfig.userAgent,
    timeoutMs: EngineDefaults.fetch.timeoutMs,
    retries: EngineDefaults.fetch.retries,
    onStatus: (m) => status(`\x1b[36m[INF]\x1b[0m ${m}`),
    onDebug: (m) => status(`\x1b[90m[DBG]\x1b[0m ${m}`),
  })
  targets = discovered.filter((u) => {
    try {
      return matchPath(spec.pathPattern, new URL(u).pathname)
    } catch {
      return false
    }
  })
  status(
    `\x1b[36m[INF]\x1b[0m Scope filter "${spec.pathPattern}": matched ${targets.length} of ${discovered.length} sitemap URL(s)`,
  )
  if (targets.length === 0) {
    const warn =
      `[WARN] No sitemap URL matched scope "${spec.pathPattern}" (0 of ${discovered.length}). Nothing audited.`
    if (machineMode) Deno.stderr.writeSync(enc.encode(warn + "\n"))
    else log(`\x1b[33m${warn}\x1b[0m`)
    Deno.exit(0)
  }
}

const results = await engine.auditMany(targets)

for (const result of results) {
  log(formatReport(result, outputType))
  log("")
}
