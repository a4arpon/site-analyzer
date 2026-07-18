# AGENTS.md

Deno CLI ("webalyzer") that audits a website against a JSON rule pack and reports SEO / agent-readiness / e-commerce findings. It crawls a URL, parses the HTML with `htmlparser2`, and runs declarative rules (`selector`, `header`, `regex`, `fetch`, `composite`, `script`) defined in `rules/*.json`. **The audit report is consumed by AI agents, not humans** — output includes fix instructions per finding.

## Stack & tooling (verified)
- Runtime: **Deno** (`deno 2.9.3`). All commands use the `deno` CLI, not `node`/`npm` despite `package.json` existing.
- `package.json` declares npm deps (`htmlparser2`, `css-select`, `domhandler`, `inquirer`) but they are consumed via Deno's Node compat. `nodeModulesDir: "auto"` in `deno.json`. No `npm install` step is required to run or typecheck.
- Formatting/linting is **Deno's** (`deno fmt` / `deno lint`), configured in `deno.json`. `.zed/settings.json` also wires the Zed editor to Deno's formatter. Line width 80, no semicolons, spaces (not tabs).
- `"unstable": ["tsgo"]` is set — typecheck uses the `tsgo` (Go TS) backend.

## Commands
- Run an audit: `deno task dev --site=<url> --rule=<local-or-remote-pack> [--output-type=<mode>]`. `dev` grants `--allow-net` + `--allow-read` (read for local rule packs). `--site` is required (the website to audit). `--rule` is **required**: a local path OR a remote URL to a JSON rule pack. There is NO default pack — if `--rule` is omitted, webalyzer runs nothing and prints a JSON array of suggested built-in skill packs (name/description/url pointing at raw GitHub rule packs) so an agent knows exactly where to load skills from. If the site exposes a sitemap (robots.txt `Sitemap:` or `/sitemap.xml`), ALL urls in it are crawled; otherwise just the seed URL.
  - `--output-type`: `overview` (plain human summary, no color) | `info` (default, ANSI-colored agent report with why/fix/snippet) | `agent` (token-optimized `key=value` lines, logs→stderr) | `compact-agent` (heavily compressed pipe-delimited tokens, fix truncated to 80 chars, ~80% fewer tokens; progress→stderr). In `agent`/`compact-agent` modes stdout stays clean for machine parsing.
  - e.g. `deno task dev --site=https://example.com --rule=https://example.com/my-pack.json`
  - e.g. `deno task dev --site=https://example.com --rule=./rules/e-commerce.json --output-type=compact-agent`
  - with no `--rule`: prints suggested skills and exits 0 (no audit).
- Compile a standalone binary: `deno task build:compile` → emits `./dist/web-analyzer` (`.gitignore`d).
- Lint: `deno lint` — scopes are `./src/*` and `./rules/*` only.
- Format: `deno fmt`.
- Typecheck: `deno check src/app.ts` (or any entry).
- No test task is defined; there is no test suite yet.

## Architecture
- Entrypoint: `src/app.ts` — reads URL from `Deno.args[0]`, builds `RuleCheckerEngine`, prints `formatText(result)`.
- `src/config.ts` — **single source of engine defaults + score weights**. `EngineDefaults` (timeout, UA, concurrency, batch size) and `ScoreWeights` (P0=50, P1=30, P2=15, P3=4). `AppConfig` holds product name (`webalyzer`) + User-Agent. Edit defaults here, not in engine.
- `src/crawler.ts` — owns `crawl()` + `fetchWithRetry()` + `CrawledPage` type + `discoverUrls()` (sitemap-aware URL discovery: robots.txt `Sitemap:` + `/sitemap.xml` + `/sitemap_index.xml`, recursive sitemap-index parsing, depth-guarded). Engine/app delegates to it. Single home for fetch/retry/timeout/sitemap logic.
- `src/rules-loader.ts` — `loadRulePack(source)`: loads a pack from a local path OR a remote URL, `JSON.parse`s it, and runs lightweight structural validation (metadata fields, rule-ID pattern `^[A-Z]{2,4}-\d{2,3}$`, key/id match, required check fields, valid `check.type`). Throws clear errors on bad packs.
- `src/app.ts` — `BUILTIN_SKILLS`: catalog of suggested rule packs (name/description/url → raw GitHub URLs). When `--rule` is absent, webalyzer prints this array as JSON and exits 0 (no audit). This is the agent-discovery mechanism for "where do I load skills".
- `src/engine.ts` — orchestration + the 6 check type implementations + `extractSelectorValue` / `meetsThreshold` / `createFinding` / `calculateStats`. `calculateStats` computes a 0–100 health score (start 100, subtract `ScoreWeights` per finding, floor 0) + letter grade via `scoreToGrade`. `auditMany` is non-async (returns `Promise.all`).
- `src/display.ts` — `formatReport(result, type)`: dispatcher over four renderers. `formatText` = `info` (colorized, why/fix/snippet). `formatOverview` = plain human summary (no color). `formatAgent` = token-optimized `key=value` lines. `formatCompactAgent` = heavily compressed pipe-delimited tokens (`R|...` header, `$|pri|id|title|fix` per finding, fix truncated to 80 chars). Machine modes emit progress to stderr only.
- `src/rules.ts` — `OfficalRulesSDK`, a read-only accessor over a rule pack (spelled "Offical" in the source — do not "fix" the spelling without renaming usages).
- `src/updater.ts` — labeled home for the future pack self-update feature (currently a stub returning a placeholder). Not built.
- Rule packs: `rules/e-commerce.json` (active pack, 12 SEO/agent/OG/JSON-LD rules) and `rules/schema.json` (JSON-Schema draft-07 validating the pack format; `$id` is `https://webalyzer.dev/schemas/rule-spec.json`).

## Rule pack format gotchas
- Rule IDs MUST match `^[A-Z]{2,6}-\d{2,3}$` (e.g. `SEO-01`, `JSONLD-01`). `schema.json` enforces this and `additionalProperties: false`.
- A rule's `check.type` drives evaluation. Implemented: `selector`, `header`, `regex`, `fetch`, `composite`, `jsonld`. `script` and `custom` are **not implemented** (engine emits an "engineError" finding for `script`).
- `jsonld` check (fully rule-driven, no static assumptions): `jsonldType` (required `@type`), `requireContextSchemaOrg` (bool), `requiredFields` (dotted/nested paths like `offers.price`), `fieldTypes` (per-path `string|number|url|boolean|date`). Paths are **array-aware**: `offers.price` validates every element whether `offers` is an object or an array. Relational assertions (all declarative, engine hardcodes no schema): `requiredGroups` (fields that must co-exist, e.g. price+priceCurrency), `conditional` (if-then: if `review` present require `review.author`), `enumValues` (allowed-value sets, e.g. availability), `patterns` (per-path regex/format, e.g. `^[A-Z]{3}$` for currency), `numericRange` (min/max/exclusiveMin, e.g. price>0), `arrayItemTypes` (validate every element of a primitive array). The engine unwraps arrays + `@graph`. No field names are hardcoded — everything comes from the rule.
- `scope: "root"` rules only run when the audited URL starts with `metadata.homepage` (falls back to the URL's origin).
- `scope: "root"` rules only run when the audited URL starts with `metadata.homepage` (falls back to the URL's origin).
- Selector value extraction heuristic (`extractSelectorValue` in `engine.ts`): if `attribute` set → attribute values; else if meta tag → its `content`; else for small `threshold.max` (≤10) → element count; else → text length. Counter-intuitive — check before changing rule thresholds.
- `meetsThreshold` footgun: for a non-numeric string with a numeric threshold, it compares **string length**, not content. A rule like `{equals: "https://..."}` against a meta string matches on length alone. Use `contains`/`equals` with string thresholds only when length comparison is intended.
- `{{baseUrl}}` in a `fetch` check URL is interpolated with the page origin.

## Conventions
- Imports use the `#src/` alias (`deno.json` `imports`), e.g. `import { RuleT } from "#src/types.ts"`. Keep that, don't switch to relative `../` paths.
- JSON rule files use a `with { type: "json" }` import assertion (Deno 2 syntax).
- Product name is **webalyzer** (was "SiteAgent" in early code). Keep UA + schema `$id` in sync.
- Code comments and skill prose use the project's own "caveman" terse style; the `caveman` skill is in ultra mode by default per user instruction.
