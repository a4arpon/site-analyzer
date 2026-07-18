# webalyzer

> Agent-native website auditor. Crawls a URL (sitemap-aware), runs a
> **pluggable JSON rule pack**, and emits a machine-first report with fix
> instructions per finding. Built for AI agents (Claude Code, Cursor,
> Codex, custom agents) — not humans.

**One line:** `webalyzer --site=<url> --rule=<pack.json>` → structured findings.

---

## Why Deno (not Node)

- **Zero-install, single binary.** `deno task dev` just runs. No `npm install`,
  no `node_modules` resolution dance, no lockfile hell for the *user*.
- **First-class TypeScript + URL imports + granular permissions.** `--allow-net`
  / `--allow-read` are explicit and safe by default — the agent knows exactly
  what the tool can touch.
- **`deno compile` → standalone binary** (`dist/web-analyzer`). Ship one file,
  no runtime dependency. Compiles today (`deno task build:compile`).
- **Built-in lint/format/typecheck** (`deno lint`, `deno fmt`, `deno check`)
  — no separate toolchain.
- Deps (`htmlparser2`, `css-select`, `domhandler`) are consumed via
  Deno's **Node compat**, declared in `package.json` but never `npm install`ed.
  `nodeModulesDir: "auto"` in `deno.json`.

Runtime: **Deno 2.x** (`deno --version` ≥ 2.9).

---

## Install / Run

```sh
# clone
git clone https://github.com/a4arpon/site-analyzer
cd site-analyzer

# run an audit (no build step needed)
deno task dev --site=https://example.com \
  --rule=./rules/e-commerce.json \
  --output-type=compact-agent
```

Deno install (one-time): https://deno.com/install

---

## Commands

```sh
# Audit a site. --rule is REQUIRED (no default pack).
deno task dev --site=<url> --rule=<local-or-remote-pack> [--output-type=<mode>]

# Compile a standalone binary (emits ./dist/web-analyzer)
deno task build:compile

# Quality gates
deno lint          # src/* + rules/*
deno fmt           # format
deno check src/app.ts   # typecheck entry
```

### Flags

| Flag | Required | Meaning |
|---|---|---|
| `--site=<url>` | **yes** | Website to audit. |
| `--rule=<path\|url>` | **yes** | Local path **or** remote URL to a JSON rule pack. If omitted, webalyzer prints suggested built-in skill packs (name/description/url) and exits — it runs **nothing** by default. |
| `--output-type=<mode>` | no | `overview` (plain human) · `info` (default, colorized agent report) · `agent` (token-optimized `key=value`) · `compact-agent` (heavily compressed, ~85% fewer tokens; progress→stderr). |

If the site exposes a sitemap (`robots.txt` `Sitemap:` or `/sitemap.xml`),
**all** URLs in it are crawled; else only the seed URL.

### Output modes (token cost, same audit)

```
info           full why/fix/snippet, colorized        ~800 words
agent          key=value lines, machine-parseable     ~600 words
compact-agent  pipe-delimited, fix≤80 chars         ~140 words   ← agent default
```

In `agent` / `compact-agent`, **stdout stays clean** (all progress →
stderr) so you can pipe it straight into an agent's context.

---

## How it works (for agents wiring this in)

```
src/app.ts          entry: parses --site/--rule/--output-type, loads pack,
                    discovers URLs, runs auditMany, prints report.
src/crawler.ts      fetch + retry + sitemap discovery (robots Sitemap:,
                    /sitemap.xml, /sitemap_index.xml, recursive index).
src/rules-loader.ts loadRulePack(src): local OR remote, JSON.parse,
                    structural validation against rules/schema.json.
src/engine.ts      RuleCheckerEngine: 7 check types, score, report.
src/display.ts      formatReport(result, type): 4 renderers.
src/config.ts       EngineDefaults + ScoreWeights (P0=50 P1=30 P2=15 P3=4).
src/types.ts        RuleT / Check / Finding types.
rules/e-commerce.json  bundled example pack (12 rules).
rules/schema.json    JSON-Schema (draft-07) for packs. $id webalyzer.dev.
```

**No business logic is hardcoded.** Every check — including JSON-LD
schema validation — is declared in the rule JSON. The engine just
interprets it. You (the pack author) own the accuracy.

---

## Authoring a rule pack

A pack = `{ metadata, rules }`. Rules keyed by ID
(`^[A-Z]{2,6}-\d{2,3}$`, e.g. `SEO-01`, `JSONLD-01`).

Full schema: `rules/schema.json`. Minimal shape:

```json
{
  "$schema": "./schema.json",
  "metadata": {
    "name": "My Pack",
    "version": "1.0.0",
    "createdBy": { "name": "you" },
    "updatedAt": "2026-07-19"
  },
  "rules": {
    "SEO-01": {
      "id": "SEO-01",
      "name": "Single H1",
      "category": "seo",
      "priority": "P0",
      "check": { "type": "selector", "selector": "h1", "threshold": { "min": 1, "max": 1 } },
      "fix": { "instruction": "Use exactly one <h1>.", "effort": "easy" }
    }
  }
}
```

### Check types

| `type` | What it does |
|---|---|
| `selector` | CSS-select DOM, assert count/attribute/length via `threshold`. |
| `header` | Assert an HTTP response header. |
| `regex` | Match a pattern against HTML or headers. |
| `fetch` | Fetch a URL (supports `{{baseUrl}}`), assert status. |
| `composite` | Combine sub-rules with `all`/`any`/`none` logic. |
| `jsonld` | **Validate schema.org JSON-LD** (see below). |
| `script` / `custom` | Not yet implemented (engine emits a finding). |

### JSON-LD checks (the core)

The `jsonld` type is **fully declarative** — the engine hardcodes
**zero** schema vocabulary. It supports arrays + `@graph` + array-valued
`@type` automatically. All assertions are optional:

```json
{
  "type": "jsonld",
  "jsonldType": "Product",            // required @type (string or array)
  "requireContextSchemaOrg": true,   // @context must include schema.org
  "requiredFields": ["name", "offers.price"],  // presence + non-empty
  "fieldTypes": {                       // per-path primitive type
    "name": "string",
    "offers.price": "number",
    "image": "url"
  },
  "requiredGroups": [                  // all members must co-exist
    ["offers.price", "offers.priceCurrency"]
  ],
  "conditional": [                   // if-then
    { "ifField": "review", "requireFields": ["review.author"] }
  ],
  "enumValues": {                    // allowed value sets
    "offers.availability": ["InStock", "OutOfStock", "PreOrder"]
  },
  "patterns": {                      // per-path regex / format
    "offers.priceCurrency": "^[A-Z]{3}$"
  },
  "numericRange": {                  // bounds
    "offers.price": { "exclusiveMin": true, "min": 0 }
  },
  "arrayItemTypes": {                // validate every element of a primitive array
    "offers": "number"
  }
}
```

Paths are **dotted + nested + array-aware**: `offers.price` validates
*every* offer whether `offers` is one object or an array of offers.
`a[0].b` indexes explicitly. This is enough to express **any**
schema.org / Google-rich-result constraint for **any** business type
(Product, LocalBusiness, Article, Event, Recipe, JobPosting, …).

→ Write one pack per vertical. The engine stays generic; you own coverage.

---

## Status

- [x] Pluggable local/remote rule packs
- [x] Sitemap-aware multi-URL crawl
- [x] 7 check types incl. relational JSON-LD validation
- [x] 4 output modes (overview / info / agent / compact-agent)
- [x] **Standalone binary** — `deno task build:compile` → `./dist/web-analyzer` (Deno-compiled, `--allow-net`/`--allow-read` baked in)
- [ ] JS-rendered SPA crawl (static HTML only for now — client-injected JSON-LD on SPAs is not yet visible)
- [ ] `script` / `custom` check types
- [ ] Per-host politeness / `robots.txt` Disallow compliance (currently only reads `Sitemap:`)

---

## License

MIT.
