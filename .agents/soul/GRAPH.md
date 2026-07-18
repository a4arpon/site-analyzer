# GRAPH

Dependency / ownership map of the repo. Use to know what touches what before editing.

## Source modules (`src/`)
- `app.ts` — entrypoint. Parses `--site=` (required, exit 1 if missing) / `--rule=`. If `--rule` absent → prints `BUILTIN_SKILLS` JSON array (name/description/raw-GitHub url) and exits 0 (no audit — NO default pack). Otherwise loads pack via `loadRulePack`, discovers URLs, runs `auditMany`, prints `formatText` per URL.
- `config.ts` — SINGLE SOURCE of engine defaults: `EngineDefaults` (timeout, UA, concurrency, batch size, followRedirects) + `ScoreWeights` (P0=50/P1=30/P2=15/P3=4) + `AppConfig` (name `webalyzer`, UA string). Edit defaults here, not in engine.
- `crawler.ts` — owns `crawl()` + `fetchWithRetry()` + `CrawledPage` + `discoverUrls()` (sitemap-aware: robots.txt `Sitemap:` + `/sitemap.xml` + `/sitemap_index.xml`, recursive index parsing, depth-guarded to 5). Engine/app delegate here.
- `rules-loader.ts` — `loadRulePack(source)`: local path OR remote URL → JSON.parse + lightweight structural validation (metadata, ID pattern, key/id match, required fields, valid `check.type`). Throws clear errors.
- `engine.ts` — CORE. `RuleCheckerEngine`: orchestration, the 7 check-type impls (selector/header/regex/fetch/composite/jsonld/script), `extractSelectorValue` / `meetsThreshold` / `createFinding` / `calculateStats` (health score + `scoreToGrade`). `jsonld` is fully rule-driven (no hardcoded schema vocab): requiredFields/fieldTypes + relational requiredGroups/conditional/enumValues/patterns/numericRange/arrayItemTypes. Paths are array-aware (`offers.price` validates each element). `getPath` traverses arrays + `@graph`. `Semaphore` gates cross-batch concurrency. `auditMany` returns `Promise.all`.
- `display.ts` — `formatReport(result, type)` dispatcher: `info` (colorized why/fix/snippet) / `overview` (plain human) / `agent` (key=value token-opt) / `compact-agent` (pipe-delimited, fix≤80). Machine modes keep stdout clean.
- `types.ts` — `RuleT` = entire rule pack shape. Single source of truth for `rules/*.json` contract. Defines `Check`, `Finding`, `Threshold`, `RuleDefinition`, `Metadata`, enums.
- `rules.ts` — `OfficalRulesSDK` (read-only accessor over a pack) + `officialRules` singleton. Note misspelling "Offical".
- `updater.ts` — labeled home for future pack self-update; stub (`appUpdater()` returns "hello world").

## Rule packs (`rules/`)
- `e-commerce.json` — active pack, 5 SEO/agent rules (`SEO-01`..`SEO-04`, `AG-01`). `$schema: ./schema.json`.
- `schema.json` — JSON-Schema draft-07 validating pack format. Strict (`additionalProperties: false`). `$id: https://webalyzer.dev/schemas/rule-spec.json`.

## External deps (via Deno Node compat)
`htmlparser2` (parse), `css-select` (selectAll), `domhandler` (types). `inquirer` declared but unused so far.

## Skills (`.agents/skills/`)
caveman, copywriting (+evals/references), grill-me, handoff, ponytail, ponytail-audit, writing-guidelines.

## Soul (`.agents/soul/`)
AGENTS context: commands.md, memory.md, persona.md (user-owned), tasks.md (PRD).
