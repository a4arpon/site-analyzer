import { log } from "node:console"
import { RuleCheckerEngine } from "#src/engine.ts"
import { formatReport, type OutputType } from "#src/display.ts"
import { AppBranding, AppConfig, EngineDefaults } from "#src/config.ts"
import { loadRulePacks } from "#src/rules-loader.ts"
import { discoverUrls } from "#src/crawler.ts"
import { matchPath, parseSiteSpec } from "#src/site-spec.ts"
import { RuleT } from "#src/types.ts"

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
      "Everything pack: SEO + Open Graph + JSON-LD + accessibility (alt, labels, roles, landmarks, heading order, duplicate ids) + AI-agent navigability (llms.txt, clickable hooks, dead links, forms). 40 rules.",
    url:
      "https://raw.githubusercontent.com/a4arpon/site-analyzer/main/rules/core.json",
  },
  {
    name: "e-commerce",
    description:
      "Commerce add-on: Product/Offer/BreadcrumbList JSON-LD validity (price, currency, availability). Load together with core: --rule=core,e-commerce.",
    url:
      "https://raw.githubusercontent.com/a4arpon/site-analyzer/main/rules/e-commerce.json",
  },
  // Add more built-in packs here as they are authored in rules/.
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
} {
  const out: { site?: string; rule?: string; output?: string } = {}
  for (const arg of argv) {
    const m = arg.match(/^--([\w-]+)=(.*)$/)
    if (!m) continue
    if (m[1] === "site") out.site = m[2]
    else if (m[1] === "rule") out.rule = m[2]
    else if (m[1] === "output-type") out.output = m[2]
  }
  return out
}

const { site, rule, output } = parseArgs(Deno.args)

if (!site) {
  log(
    "Usage: deno task dev --site=<url-or-spec> --rule=<local-or-remote-pack> [--output-type=<mode>]",
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
  log(
    "  --rule        comma-separated paths or URLs to rule packs (required)",
  )
  log("                  e.g. ./rules/core.json")
  log("                  e.g. ./rules/core.json,./rules/e-commerce.json")
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

// No config supplied → run nothing. Suggest built-in skill packs so the
// agent knows precisely where to load skills from. In machine modes stdout
// stays PURE JSON (messages + branding go to stderr).
if (!rule) {
  if (machineMode) {
    Deno.stderr.writeSync(
      enc.encode("[WARN] No --rule provided. Nothing audited.\n"),
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
    log("\x1b[33m[WARN]\x1b[0m No --rule provided. Nothing audited.")
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

const pack: RuleT = await loadRulePacks(rule)

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
