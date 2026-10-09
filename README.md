# webalyzer

> Agent-native website auditor. Crawls a URL (sitemap-aware), runs a
> **pluggable JSON rule pack**, and emits a machine-first report with fix
> instructions per finding. Built for AI agents (Claude Code, Cursor,
> Codex, custom agents) — not humans.

**One line:** `webalyzer --site=<url>` → structured findings (bundled core
pack runs by default; add `--rule=<pack.json>` for more, `--no-default-rule`
to opt out).

---

## Why Deno (not Node)

- **Zero-install, single binary.** `deno task dev` just runs. No `npm install`,
  no `node_modules` resolution dance, no lockfile hell for the *user*.
- **First-class TypeScript + URL imports + granular permissions.** `--allow-net`
  / `--allow-read` are explicit and safe by default — the agent knows exactly
  what the tool can touch.
- **`deno compile` → standalone binaries** (`dist/web-analyzer-qjs` + `dist/web-analyzer-v8`). Ship one file, no runtime dependency. Compiles today (`deno task build:compile`); the QuickJS variant is ~40% smaller.
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

# run an audit (no build step needed; bundled core pack runs by default)
deno task dev --site=https://example.com --output-type=compact-agent

# add a pack on top of the default core (packs merge, later wins)
deno task dev --site=https://shop.example.com \
  --rule=./src/assets/e-commerce.json

# audit ONLY your own pack (skip the default core)
deno task dev --site=https://example.com \
  --rule=./my-pack.json --no-default-rule
```

Deno install (one-time): https://deno.com/install

---

## Commands

```sh
# Audit. --rule is optional — bundled core pack runs by default.
deno task dev --site=<url-or-spec> [--rule=<packs>] [--no-default-rule] [--output-type=<mode>]

# Compile standalone binaries (embedded core pack travels with them)
deno task build:compile        # ./dist/web-analyzer-qjs (QuickJS)
deno task build:compile-v8     # ./dist/web-analyzer-v8 (V8)

# Quality gates
deno lint          # src/*
deno fmt           # format (src/* + src/assets/*)
deno check src/app.ts   # typecheck entry
```

### Flags

| Flag | Required | Meaning |
|---|---|---|
| `--site=<url-or-spec>` | **yes** | Target. Two forms below. |
| `--rule=<packs>` | no | One or more JSON rule packs, **comma-separated** (local paths or remote URLs). Packs are merged **on top of the bundled core pack** — later packs win on rule-ID collision. Omit it and the core pack runs alone. |
| `--no-default-rule` | no | Exclude the bundled core pack. With `--rule`, audits only your packs; without `--rule`, prints suggested built-in skill packs (name/description/url) and exits 0 — nothing is audited. |
| `--output-type=<mode>` | no | `overview` (plain human) · `info` (default, colorized agent report) · `agent` (token-optimized `key=value`) · `compact-agent` (heavily compressed, ~85% fewer tokens; progress→stderr). |

### Bundled packs

| Pack | Rules | Covers |
|---|---|---|
| `src/assets/core.json` | 40 | **The default pack — embedded in the binary, runs on every audit.** SEO (title/h1/meta/canonical) · Open Graph · JSON-LD presence · **accessibility** (alt, labels, aria refs, roles, landmarks, heading order, duplicate ids, zoom) · **AI-agent navigability** (llms.txt, robots/sitemap, clickable hooks, dead links, form submittability). |
| `src/assets/e-commerce.json` | 3 | Commerce add-on: Product / Offer / BreadcrumbList JSON-LD validity. Merges on top of the default core: `--rule=./src/assets/e-commerce.json` |
| `src/assets/business.json` | 8 | Business add-on: Organization JSON-LD completeness (url, sameAs, contactPoint, postal address) + visible contact/trust links (mailto, no freemail, contact/about/privacy pages). Merges on top of the default core: `--rule=./src/assets/business.json` |

### Site spec — scope what gets crawled

`--site` is a **spec, not just a URL**:

```sh
# Plain URL → audit ONLY that page. No robots.txt / sitemap probes at all.
--site=https://example.com/about

# Glob in the path → sitemap discovery + path filter (subtree).
# `*` and `**` both CROSS `/`; `?` = one char. Origin is fixed by the spec.
--site=https://example.com/community-docs/*    # everything under /community-docs/
--site=https://example.com/blog/*              # everything under /blog/
--site=https://example.com/*                   # whole site (explicit)

# Scheme optional: example.com/x  →  https://example.com/x
```

Matching applies to the **URL path only** (query strings ignored). If a glob
scope matches 0 sitemap URLs, webalyzer warns and exits 0 — it never silently
widens scope. Every report ends with an attribution footer
(`maintained by a4arpon │ github.com/a4arpon/site-analyzer`).

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
                    resolves scope (single page vs glob), runs auditMany,
                    prints report.
src/site-spec.ts    `--site` spec parser: plain URL = single page (no
                    sitemap crawl); glob = sitemap discovery + path filter.
                    `*`/`**` cross `/`; origin fixed, path-only match.
src/crawler.ts      fetch + retry + sitemap discovery (robots Sitemap:,
                    /sitemap.xml, /sitemap_index.xml, recursive index).
src/rules-loader.ts loadRulePacks(spec): local OR remote, comma-separated,
                    JSON.parse + structural validation, pack merge (later
                    pack wins on rule-ID collision).
src/engine.ts      RuleCheckerEngine: 10 check types, score, report.
src/display.ts      formatReport(result, type): 4 renderers.
src/config.ts       EngineDefaults + ScoreWeights (P0=50 P1=30 P2=15 P3=4).
src/types.ts        RuleT / Check / Finding types.
src/assets/core.json     the DEFAULT pack (40 rules: SEO + OG + JSON-LD +
                         a11y + AI-agent navigability). Embedded via JSON
                         import → ships inside compiled binaries.
src/assets/e-commerce.json  commerce add-on (3 rules: Product/Offer/Breadcrumb).
src/assets/business.json    business add-on (8 rules: Organization JSON-LD
                            completeness + contact/trust links).
src/assets/schema.json    JSON-Schema (draft-07) for packs. $id webalyzer.dev.
```

**No business logic is hardcoded.** Every check — including JSON-LD
schema validation — is declared in the rule JSON. The engine just
interprets it. You (the pack author) own the accuracy.

---

## Authoring a rule pack

A pack = `{ metadata, rules }`. Rules keyed by ID
(`^[A-Z]{2,6}-\d{2,3}$`, e.g. `SEO-01`, `JSONLD-01`).

Full schema: `src/assets/schema.json`. Minimal shape:

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
| `selector` | CSS-select DOM, assert count/attribute/length via `threshold`. Add an `each` block for **per-element** attribute assertions (see below). |
| `header` | Assert an HTTP response header. |
| `regex` | Match a pattern against HTML or headers (`threshold: {equals: false}` = must NOT match). |
| `fetch` | Fetch a URL (supports `{{baseUrl}}`), assert status. |
| `composite` | Combine sub-rules with `all`/`any`/`none` logic. |
| `jsonld` | **Validate schema.org JSON-LD** (see below). |
| `unique` | Duplicate-attribute detection (`[id]` → each `id` must be unique). |
| `pairing` | Cross-element reference integrity: `label[for]` → real id, `aria-labelledby` tokens → real ids (`{value}` interpolation, `requireAnyOf`, `tokenize`). |
| `sequence` | Document-order rules: heading hierarchy must not skip levels (`no-skip`). |
| `script` / `custom` | Not yet implemented (engine emits a finding). |

Counting checks (`unique`, `pairing`, `sequence`, `each`) default to
`threshold: {equals: 0}` — zero violations passes.

### Per-element assertions (`each`)

Plain selector checks join values; `each` validates **every matched
element separately** — allowed sets and patterns live in the pack, the
engine hardcodes no vocabulary:

```json
{
  "type": "selector",
  "selector": "[role]",
  "each": {
    "attribute": "role",
    "allowedValues": ["button", "navigation", "dialog"],
    "pattern": "^[a-z-]+$",
    "nonEmpty": true
  }
}
```

### Reference integrity + document order

```json
{
  "type": "pairing",
  "selector": "label[for]",
  "attribute": "for",
  "requireSelector": "[id='{value}']",   // {value} = the for attribute
  "tokenize": true                        // aria-labelledby id lists
},
{
  "type": "pairing",
  "selector": "input:not([aria-label]):not([title])",
  "attribute": "id",
  "requireAnyOf": ["label[for='{value}']"]  // any match passes
},
{
  "type": "sequence",
  "selector": "h1,h2,h3,h4,h5,h6",          // document order, no skips
  "sequenceRule": "no-skip"
},
{
  "type": "unique",
  "selector": "[id]",
  "attribute": "id"
}
```

### JSON-LD checks (the core)

The `jsonld` type is **fully declarative** — the engine hardcodes
**zero** schema vocabulary. It supports arrays + `@graph` + array-valued
`@type` automatically, and **collects nested objects**, so an `Offer`
inline inside `Product.offers` is individually addressable via
`jsonldType: "Offer"`. All assertions are optional:

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

- [x] Pluggable local/remote rule packs (comma-separated merge)
- [x] Sitemap-aware multi-URL crawl
- [x] 10 check types incl. relational JSON-LD, `unique`/`pairing`/`sequence`/`each`
- [x] Bundled packs: `core.json` (40 rules: SEO + a11y + agent-nav) + `e-commerce.json` (3) + `business.json` (8)
- [x] 4 output modes (overview / info / agent / compact-agent)
- [x] **Standalone binaries** — `deno task build:compile` → `./dist/web-analyzer-qjs` (QuickJS engine, ~60 MB) + `deno task build:compile-v8` → `./dist/web-analyzer-v8` (V8, ~100 MB); `--allow-net`/`--allow-read` baked in, default pack embedded
- [ ] JS-rendered SPA crawl (static HTML only for now — client-injected JSON-LD on SPAs is not yet visible)
- [ ] `script` / `custom` check types
- [ ] Per-host politeness / `robots.txt` Disallow compliance (currently only reads `Sitemap:`)

---

## License

MIT.
