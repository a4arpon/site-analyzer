import { log } from "node:console"
import { RuleCheckerEngine } from "#src/engine.ts"
import { formatReport, type OutputType } from "#src/display.ts"
import { AppConfig, EngineDefaults } from "#src/config.ts"
import { loadRulePack } from "#src/rules-loader.ts"
import { discoverUrls } from "#src/crawler.ts"
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
    name: "e-commerce",
    description:
      "Core SEO + agent-readiness checks for online stores (title, H1, meta, canonical, lang).",
    url: "https://raw.githubusercontent.com/a4arpon/site-analyzer/main/rules/e-commerce.json",
  },
  // Add more built-in packs here as they are authored in rules/.
]

const OUTPUT_TYPES: OutputType[] = ["overview", "info", "agent", "compact-agent"]

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
  log("Usage: deno task dev --site=<url> --rule=<local-or-remote-pack> [--output-type=<mode>]")
  log("  --site        target website to audit (required)")
  log("  --rule        path or URL to a rule pack (required)")
  log(`  --output-type ${OUTPUT_TYPES.join("|")} (default: info)`)
  Deno.exit(1)
}

const outputType: OutputType = (output as OutputType) ?? "info"
if (!OUTPUT_TYPES.includes(outputType)) {
  log(`Invalid --output-type "${output}". Use one of: ${OUTPUT_TYPES.join(", ")}`)
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
// agent knows precisely where to load skills from.
if (!rule) {
  if (machineMode) {
    Deno.stderr.writeSync(enc.encode("[WARN] No --rule provided. Nothing audited.\n"))
  } else {
    log("\x1b[33m[WARN]\x1b[0m No --rule provided. Nothing audited.")
  }
  log("Load a skill pack with --rule=<path-or-url>. Suggested built-in skills:")
  log(JSON.stringify(BUILTIN_SKILLS, null, 2))
  Deno.exit(0)
}

const pack: RuleT = await loadRulePack(rule)

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

// Discover URLs: sitemap-aware. Fall back to the seed URL if none found.
const urls = await discoverUrls(site, {
  userAgent: AppConfig.userAgent,
  timeoutMs: EngineDefaults.fetch.timeoutMs,
  retries: EngineDefaults.fetch.retries,
  onStatus: (m) => status(`\x1b[36m[INF]\x1b[0m ${m}`),
  onDebug: (m) => status(`\x1b[90m[DBG]\x1b[0m ${m}`),
})

const targets = urls.length > 0 ? urls : [site]

const results = await engine.auditMany(targets)

for (const result of results) {
  log(formatReport(result, outputType))
  log("")
}
