# MEMORY

Working notes for the webalyzer project. Preserved across model/session switches.
**North star:** `.agents/soul/GOAL.md` (product mission + phasing). **Research:** `.agents/soul/RESEARCH.md` (2026 SEO/AI-search/agent-commerce deep dive).

## What this is
A Deno CLI ("webalyzer") that audits a website against a declarative JSON rule pack and reports SEO / agent-readiness / e-commerce findings. It crawls a URL, parses HTML with `htmlparser2`, and runs rules of types: `selector`, `header`, `regex`, `fetch`, `composite`, `script` (latter two not implemented).

## Project goal (analyzed)
Build an automated website auditor that scores any site for machine-agent readability and SEO health, driven entirely by external rule packs (not code). Intended to grow into a productized "SiteAgent" CLI: rule packs are versioned, schema-validated, and shareable; findings carry remediation instructions (incl. code snippets + effort) so an LLM or dev can fix issues. Future engine features hinted in `types.ts` `EngineFeature`: `js-execution`, `screenshot`, `mcp-bridge` (not built).

## Hard-won facts (read before editing)
- Runtime is Deno, not Node — but `package.json` exists with npm deps (htmlparser2/css-select/domhandler/inquirer) used via Node compat. Do NOT `npm install`.
- Imports use `#src/` alias defined in `deno.json`. Keep it.
- Rule IDs must match `^[A-Z]{2,4}-\d{2,3}$`. `schema.json` is strict (`additionalProperties: false`). `$id` = `https://webalyzer.dev/schemas/rule-spec.json`.
- `script` and `custom` check types are NOT implemented yet — engine emits an "engineError" finding for `script`. `jsonld` IS implemented (rule-driven, ZERO hardcoded schema vocab): jsonldType / requireContextSchemaOrg / requiredFields / fieldTypes / requiredGroups (co-exist) / conditional (if-then) / enumValues / patterns (regex) / numericRange / arrayItemTypes. Paths array-aware (`offers.price` validates each element). Engine interprets faithfully; pack accuracy = pack author's job. JS rendering + corpus validation harness = deferred.
- ID pattern widened to `^[A-Z]{2,6}-\d{2,3}$` (allows `JSONLD-01`). Selector value heuristic in `extractSelectorValue` (engine.ts): meta tag → content; small `threshold.max` (≤10) → element count; else → text length. Non-obvious.
- `OfficalRulesSDK` in `rules.ts` is intentionally misspelled "Offical" — don't rename without updating usages.
- Engine defaults + score weights centralized in `src/config.ts` (`EngineDefaults`, `ScoreWeights` P0=50/P1=30/P2=15/P3=4). Crawl logic moved to `src/crawler.ts`. Report rendering in `src/display.ts` (`formatReport` with `info`/`overview`/`agent`/`compact-agent`). CLI flag `--output-type`.
- `build.js` and `app` binary in repo root are stale build artifacts (`.gitignore`d). Ignore them.
- Health score: start 100, subtract weighted penalty per finding, floor 0. Grade A(≥90)…F(<50).

## Conventions
- Code + skill prose use "caveman" ultra-compact style by default.
- Deno fmt: line width 80, no semicolons, 2-space indent.
- Skills available under `.agents/skills/`: caveman, copywriting, grill-me, handoff, ponytail, ponytail-audit, writing-guidelines.
