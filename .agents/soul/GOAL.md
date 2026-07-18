# GOAL — webalyzer

## One-line mission
Build an **agent-native site crawler + auditor** in the class of Screaming Frog SEO Spider / Netpeak Spider — but rebuilt for the AI era: it crawls whole sites (sitemap-aware), runs pluggable local/remote rule packs, and scores pages for both classic SEO and AI-agent-readiness, emitting machine-first reports.

## Why (the shift this is built for)
Search in 2026 is bifurcating:
- **Traditional SEO** still matters (technical health, rankings, backlinks) but clicks are falling — Google AI Overviews now appear on ~13–50%+ of queries and cut top-result CTR by up to 58% (Ahrefs).
- **GEO / AEO** (Generative Engine Optimization / Answer Engine Optimization) is the new layer: optimizing content so LLMs *cite* you inside synthesized answers. ChatGPT alone processes ~2.5B prompts/day, 65% search-like, with 96% lower CTR than Google. Discovery is moving from "blue links" to "cited answers."
- **Agentic commerce**: AI agents (ChatGPT Operator, Gemini, Claude Computer Use, Perplexity Checkout) now complete discovery→checkout on behalf of users. Zero-click commerce is real. Brands lose direct traffic but still sell — if their data is agent-readable.

## Product thesis
A tool that tells a business: "Here is exactly what AI engines and crawlers see, what they can't parse, and the precise fixes." For humans to act, and for agents to consume directly. The audit report is a deliverable for machines, not a dashboard for people.

## Target architecture (long-term, built step by step)
- **Crawler** — URL frontier, sitemap.xml + robots.txt discovery, polite concurrency, per-host delays, JS-render fallback, duplicate detection. (Screaming Frog equivalent.)
- **Rule engine** — pluggable packs loaded from `--rule=<local|remote url>`; checks: selector/header/regex/fetch/composite/script. Packs versioned + schema-validated.
- **Scorer** — 0–100 health per category (SEO, performance, security, agent-experience/AX), letter grade, CI exit codes.
- **Reporters** — text/JSON/llm/markdown. Agent-first.
- **Agent bridge** — MCP server exposing audit + findings as agent tools (UCP/MCP era). Future.
- **Self-update** — `updater.ts` pulls latest rule packs (squirrelscan-style `self update`).

## CLI shape (user-specified)
```
webalyzer --site=<url> --rule=<local-or-remote-pack>
```
- `--rule` accepts a local path OR a remote URL (fetched + schema-validated).
- If the site exposes a sitemap, crawl ALL urls in it (not just the seed).
- Single-page fallback when no sitemap.

## Reference products studied
- **Screaming Frog SEO Spider** / **Netpeak Spider** — desktop crawlers: whole-site crawl, 500+ inline checks, export to CSV/XLSX, JS rendering, sitemap/robots discovery, custom extracts.
- **squirrelscan.com** — agent-native audit: 262+ rules, 21 categories, health score + grade, 7 output formats (console/html/md/llm/json/xml/text), CLI+MCP+CI exit codes, cloud rendering + AI analysis.
- **Ahrefs Site Audit** — 170+ issues, whole-site crawl (170k URLs/min), JS execution, charts, internal-link suggestions, IndexNow.
- **GEO/AEO tooling** (Promptwatch, Superlines, omnius, Goodie) — AI-visibility monitoring, citation tracking, llms.txt generation.

## Non-negotiables (from research)
- Respect `robots.txt` (RFC 9309) + per-host crawl delay. Identify crawler in UA with contact. Polite by default.
- Allow AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended) — blocking them = AI invisibility.
- Support `llms.txt` + `sitemap.xml` discovery (robots `Sitemap:` directive + `/sitemap.xml`, `/sitemap_index.xml`).
- Render JS selectively (headless) — many AI crawlers time out on JS-heavy pages (<2.5s). Hybrid: static fetch first, render if body suspiciously small.
- Structured data (JSON-LD: Organization/Product/FAQ/Article) + semantic HTML + entity clarity raise citation odds.
- Google's official stance (May 2026): AEO/GEO "is still SEO" — no magic file guarantees citation; quality + clarity + authority win. Don't sell snake oil.

## Phasing (do not build all at once)
1. Pluggable `--rule` loading (local + remote) + sitemap-aware crawl. ← NEXT.
2. Rule-pack marketplace / versioning + validation CLI.
3. Category scores (perf/security/AX) beyond SEO.
4. JS rendering.
5. `script` check type (sandboxed runner).
6. Machine output formats (json/llm/markdown).
7. MCP server (agent bridge).
8. Self-update + cloud enrichment.

See `TASKS.md` for the active PRD and `memory.md` for hard-won facts.
