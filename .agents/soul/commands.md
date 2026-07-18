# Reusable Commands

Verified commands for this repo. Runtime is **Deno** (`deno 2.9.3`) — never `node`/`npm`.

## Run
- Audit a URL: `deno task dev <url>` (e.g. `deno task dev https://example.com`). `dev` grants `--allow-net`. URL required; no `--` separator.
- Compile standalone binary → `./dist/web-analyzer` (gitignored): `deno task build:compile`

## Verify
- Typecheck a single entry: `deno check src/app.ts`
- Lint (scopes: `./src/*` and `./rules/*` only): `deno lint`
- Format (line width 80, no semicolons, spaces): `deno fmt`

## Notes
- No test suite / `test` task defined yet.
- `package.json` deps are consumed via Deno Node compat (`nodeModulesDir: "auto"`). No `npm install` needed.
- `unstable: ["tsgo"]` set — typecheck uses the Go TS backend.
