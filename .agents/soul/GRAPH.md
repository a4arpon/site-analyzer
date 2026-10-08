# GRAPH

Dependency / ownership map of the repo. Use to know what touches what before editing.

## Source modules (`src/`)
- `app.ts` — entrypoint. Parses `--site=` (required, exit 1 if missing) / `--rule=` (comma-separated packs merge) / `--output-type=` / `--no-default-rule` (bare flag). Site spec via `site-spec.ts`: plain URL = single page (NO sitemap probes); glob = sitemap discovery + path filter (`*` crosses `/`; 0 matches → warn, exit 0, never widens scope). **Default pack**: `defaultPack()` imports `src/assets/core.json` as a JSON module (embedded in compiled binaries, validated once) and runs on every audit — `--rule` packs merge ON TOP (via `mergeRulePacks`, later wins); `--no-default-rule` excludes core. `--no-default-rule` + no `--rule` → prints `BUILTIN_SKILLS` JSON array (stdout pure JSON in machine modes; messages→stderr) and exits 0. Otherwise runs `auditMany`, prints `formatReport` per URL.
- `config.ts` — SINGLE SOURCE of engine defaults: `EngineDefaults` (timeout, UA, concurrency, batch size, followRedirects) + `ScoreWeights` (P0=50/P1=30/P2=15/P3=4) + `AppConfig` (name `webalyzer`, UA string) + `AppBranding` (maintainer `a4arpon`, github + repo URLs → every report footer, usage text, skill suggestion). Edit defaults here, not in engine.
- `site-spec.ts` — `parseSiteSpec` + `matchPath`: the `--site` spec language. Glob→regex (metachars escaped, `*`→`.*` crosses `/`, `?`→`.`, anchored). Origin fixed by spec; pathname-only match; scheme optional (`example.com/x` → https). Single-page fast path means `discoverUrls` is never called.
- `crawler.ts` — owns `crawl()` + `fetchWithRetry()` + `CrawledPage` + `discoverUrls()` (sitemap-aware: robots.txt `Sitemap:` + `/sitemap.xml` + `/sitemap_index.xml`, recursive index parsing, depth-guarded to 5). Engine/app delegate here.
- `rules-loader.ts` — `loadRulePacks(spec)`: comma-separated sources → `loadRulePack(source)` each (local path OR remote URL → JSON.parse + lightweight structural validation: metadata, ID pattern, key/id match, required fields, valid `check.type`). `mergeRulePacks`: rules union (later pack wins on ID collision, warns), metadata from first pack. Throws clear errors.
- `engine.ts` — CORE. `RuleCheckerEngine`: orchestration, the 10 check-type impls (selector/header/regex/fetch/composite/jsonld/unique/pairing/sequence/script), `extractSelectorValue` / `meetsThreshold` / `createFinding` / `calculateStats` (health score + `scoreToGrade`). `jsonld` is fully rule-driven (no hardcoded schema vocab): requiredFields/fieldTypes + relational requiredGroups/conditional/enumValues/patterns/numericRange/arrayItemTypes. Paths are array-aware (`offers.price` validates each element); nested objects collected deeply (inline Offer in Product.offers addressable). Counting types (unique/pairing/sequence) + `each` per-element assertions default `threshold:{equals:0}` — vocabularies live in packs. Numeric `threshold.equals` on selector = element-count mode (makes `{equals:0}` = "match nothing"). `Semaphore` gates cross-batch concurrency. `auditMany` returns `Promise.all`. DOM parse cached per page; element-count log debug-gated.
- `display.ts` — `formatReport(result, type)` dispatcher: `info` (colorized why/fix/snippet) / `overview` (plain human) / `agent` (key=value token-opt) / `compact-agent` (pipe-delimited, fix≤80). Machine modes keep stdout clean. Every report ends with attribution footer from `AppBranding` (colorized for info, `BY=/#|` for machine modes).
- `types.ts` — `RuleT` = entire rule pack shape. Single source of truth for `rules/*.json` contract. Defines `Check`, `Finding`, `Threshold`, `RuleDefinition`, `Metadata`, enums.
- `rules.ts` — `OfficalRulesSDK` (read-only accessor over a pack) + `officialRules` singleton. Note misspelling "Offical".
- `updater.ts` — labeled home for future pack self-update; stub (`appUpdater()` returns "hello world").

## Rule packs (`src/assets/`, moved from retired `rules/`)
- `core.json` — the DEFAULT pack (40 rules), embedded via JSON import in `app.ts`, runs unless `--no-default-rule`: SEO-01..04, OG-01..04, AG-01, JSONLD-01/03 (carried over) + AXS-01..18 (accessibility: alt, labels, aria refs, tabindex, dup ids, heading order, landmarks, roles, zoom) + AG-02..12 (agent navigability: clickable hooks, llms.txt/robots/sitemap fetch, dead links, form names, WebSite JSON-LD, noopener). `$schema: ./schema.json`.
- `e-commerce.json` — commerce add-on, 3 rules: JSONLD-02 Product (enriched: price+currency group, currency pattern), JSONLD-04 Offer (price>0, ISO currency, availability enum), JSONLD-05 BreadcrumbList. Merges ON TOP of default core: `--rule=./src/assets/e-commerce.json`.
- `schema.json` — JSON-Schema draft-07 validating pack format. Strict (`additionalProperties: false`). `$id: https://webalyzer.dev/schemas/rule-spec.json`.

## External deps (via Deno Node compat)
`htmlparser2` (parse), `css-select` (selectAll), `domhandler` (types). `inquirer` declared but unused so far.

## Skills (`.agents/skills/`)
caveman, copywriting (+evals/references), grill-me, handoff, ponytail, ponytail-audit, writing-guidelines.

## Soul (`.agents/soul/`)
AGENTS context: commands.md, memory.md, persona.md (user-owned), tasks.md (PRD).
