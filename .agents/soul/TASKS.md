# TASKS — Feature PRD

This file is the working PRD for the site-analyzer ("SiteAgent") project.
Update it as scope changes. Preserved across model/session switches.

## Vision
A Deno CLI that audits any website against versioned, schema-validated JSON rule packs and reports SEO / agent-readiness / e-commerce findings — each finding carrying remediation instructions + code snippets so an LLM or dev can fix it. Rule packs are the product, not the code.

## Current state (verified)
- Working: crawl (`src/crawler.ts`) + DOM parse + rule eval engine (`src/engine.ts`), 7 check types (selector/header/regex/fetch/composite/jsonld/script), 12 SEO/agent/OG/JSON-LD rules live in `rules/e-commerce.json`. `jsonld` fully rule-driven (no static field assumptions).
- Health score + letter grade implemented (`calculateStats` + `scoreToGrade`, weights in `config.ts`).
- Report renderer `display.ts` (`formatReport`) — 4 modes: `info` (colorized), `overview` (plain), `agent` (key=value), `compact-agent` (pipe-delimited, ~83% token cut). `--output-type` CLI flag added.
- NOT implemented: `script` check type (sandboxed runner), `custom` check type, `js-execution` / `screenshot` / `mcp-bridge` engine features (declared in `types.ts` only).
- Product name unified to **webalyzer** (UA + schema `$id`). Repo dir still `site-analyzer`.
- No multi-page crawl (audits single URL). No JS rendering. No test suite.

## Planned work (proposed — confirm with user)
1. **Whole-site crawl** — link extraction + frontier, like squirrelscan/Ahrefs. Currently single-URL only. #1 gap vs benchmarks.
2. **`script` check type** — sandboxed Deno runner; schema says "export default fn returning Finding[] | null". Required before `script` rules work.
3. **Rule pack expansion** — add `agent`, `performance`, `structure`, `security`, `accessibility`, `e-commerce` categories beyond the 5 rules. Reuse `Impact`/`examples` fields already in the schema.
4. **Machine output formats** — `display.ts` is text-only. Add `json`/`llm` serializers if agents need structured input (currently text is fine).
5. **JS rendering** — headless browser for SPAs (`js-execution` feature from `types.ts`).
6. **Tests** — lightweight `Deno.test` suite; fixtures for `extractSelectorValue` heuristic + each check type.
7. **Pack validation CLI** — validate a pack against `schema.json` before audit.
8. **`updater.ts`** — implement pack self-update (currently stub).

## Open questions
- Is a published rule-pack registry / `updater.ts` (auto-update packs) in scope?
- Target users: end-devs running the binary, or LLM agents consuming findings via MCP bridge?
- Multi-page crawl priority vs `script` check type?

## NEXT (user-directed, immediate) — DONE
Implemented (2026-07-19):
- CLI: `deno task dev --site=<url> [--rule=<local|remote>]`.
- `src/rules-loader.ts`: `loadRulePack(source)` — local path OR remote URL, JSON.parse + structural validation (ID pattern, key/id, required fields, valid check.type).
- `src/crawler.ts`: `discoverUrls(site)` — robots.txt `Sitemap:` + `/sitemap.xml` + `/sitemap_index.xml`, recursive index parsing, depth-guarded. Falls back to seed URL if none found.
- `app.ts`: parses `--site`(required)/`--rule`. **No `--rule` → run nothing**, print `BUILTIN_SKILLS` JSON array (name/description/raw GitHub url) and exit 0. With `--rule` → loads pack, discovers URLs, runs `auditMany`, prints `formatText` per URL.
- Verified live: remote pack load + 84-URL sitemap crawl on sitemaps.org.

## TODO (next steps, not yet built)
- `--max-urls` flag (crawler supports `maxUrls` option; not exposed in CLI yet) to bound large sitemaps.
- Aggregate site-level report (per-category scores across all pages) beyond per-URL prints.
- Respect `robots.txt` crawl directives (Disallow / Crawl-delay) — currently only reads `Sitemap:`.
- Per-host politeness delay (concurrency is global, not per-host).
- Rule-pack validation CLI against full `rules/schema.json` (currently lightweight structural only).
- See `GOAL.md` for full product trajectory.
