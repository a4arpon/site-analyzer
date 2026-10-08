// Site spec: `--site` accepts either a plain URL (single-page audit, NO
// sitemap discovery) or a URL with a glob path (scoped crawl: discover via
// sitemap, keep only matching paths).
//
//   https://example.com/about            → audit that one page only
//   https://example.com/community-docs/* → sitemap discovery, subtree filter
//   https://example.com/*                → whole site
//
// Glob semantics: `*` and `**` BOTH cross `/` (subtree match), `?` matches
// exactly one char. Origin is fixed by the spec — only the path is matched.

export interface SiteSpec {
  origin: string // e.g. "https://example.com"
  seedUrl: string // exact page URL (used when glob === false)
  pathPattern: string // pathname glob, e.g. "/community-docs/*"
  glob: boolean // true → sitemap discovery + path filter
}

// Normalize + split a --site value into origin / seed / path pattern.
// Throws on unparseable input (no scheme after normalization, bad URL).
export function parseSiteSpec(spec: string): SiteSpec {
  const raw = spec.trim()
  if (!raw) throw new Error("--site is empty")

  // Allow "example.com/x" shorthand — assume https.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`--site is not a valid URL: "${spec}"`)
  }

  const glob = url.pathname.includes("*") || url.pathname.includes("?")
  const origin = url.origin

  if (!glob) {
    return {
      origin,
      seedUrl: url.toString(),
      pathPattern: url.pathname,
      glob: false,
    }
  }

  // Build seed URL by stripping globs (only used for diagnostics, not audit).
  return {
    origin,
    seedUrl: `${origin}${
      url.pathname.replace(/[*?]/g, "").replace(/\/$/, "") || "/"
    }`,
    pathPattern: url.pathname,
    glob: true,
  }
}

// Glob → regex matcher for URL pathnames.
// `*`/`**` = any chars INCLUDING `/`; `?` = one char. Anchored ^…$.
// (`**` needs no special-casing: it compiles to `.*.*` ≡ `.*`.)
export function matchPath(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const src = escaped
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${src}$`).test(path)
}
