import type { Document } from "domhandler"
import { EngineDefaults } from "#src/config.ts"

export interface CrawledPage {
  url: string
  html: string
  status: number
  headers: Record<string, string>
  loadTimeMs: number
  document?: Document
}

export interface CrawlOptions {
  timeoutMs?: number
  userAgent?: string
  followRedirects?: boolean
  retries?: number
  acceptEncoding?: string
  headers?: Record<string, string>
  onStatus?: (msg: string) => void
  onDebug?: (msg: string) => void
}

// Fetch a URL and return the raw page. Single source of crawl + retry logic
// (was duplicated inside engine.ts). Throws on network failure.
export async function crawl(
  url: string,
  opts: CrawlOptions = {},
): Promise<CrawledPage> {
  const timeoutMs = opts.timeoutMs ?? EngineDefaults.fetch.timeoutMs
  const userAgent = opts.userAgent ?? EngineDefaults.fetch.userAgent
  const followRedirects = opts.followRedirects ??
    EngineDefaults.fetch.followRedirects
  const retries = opts.retries ?? EngineDefaults.fetch.retries
  const acceptEncoding = opts.acceptEncoding ??
    EngineDefaults.fetch.acceptEncoding

  const headers = new Headers({
    "User-Agent": userAgent,
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": acceptEncoding,
    "Connection": "keep-alive",
    ...opts.headers,
  })

  const start = performance.now()
  const res = await fetchWithRetry(url, {
    headers,
    followRedirects,
    timeoutMs,
    retries,
    onDebug: opts.onDebug,
  })
  const html = await res.text()
  const loadTimeMs = Math.round(performance.now() - start)

  const headersMap: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    headersMap[key.toLowerCase()] = value
  })

  opts.onStatus?.(
    `Fetched ${url} → HTTP ${res.status} │ ${(html.length / 1024).toFixed(1)} KB │ ${loadTimeMs}ms`,
  )

  return { url, html, status: res.status, headers: headersMap, loadTimeMs }
}

async function fetchWithRetry(
  url: string,
  ctx: {
    headers: Headers
    followRedirects: boolean
    timeoutMs: number
    retries: number
    onDebug?: (msg: string) => void
  },
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs)
  try {
    const res = await fetch(url, {
      headers: ctx.headers,
      signal: controller.signal,
      redirect: ctx.followRedirects ? "follow" : "manual",
    })
    clearTimeout(timeout)
    return res
  } catch (err) {
    clearTimeout(timeout)
    if (attempt < ctx.retries) {
      ctx.onDebug?.(`fetch ${url} failed, retry ${attempt + 1}`)
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      return fetchWithRetry(url, ctx, attempt + 1)
    }
    throw err
  }
}

// ───────────────────────────────────────────────────────────
// Sitemap discovery (Screaming Frog-class)
// ───────────────────────────────────────────────────────────

export interface DiscoveryOptions {
  userAgent?: string
  timeoutMs?: number
  retries?: number
  onDebug?: (msg: string) => void
  onStatus?: (msg: string) => void
  maxUrls?: number
}

// Discover crawlable URLs for a site.
// 1. Read robots.txt `Sitemap:` directives.
// 2. Probe /sitemap.xml and /sitemap_index.xml.
// 3. Parse sitemap XML (including nested sitemap indexes).
// Returns [] if no sitemap found → caller should fall back to the seed URL.
export async function discoverUrls(
  site: string,
  opts: DiscoveryOptions = {},
): Promise<string[]> {
  const ua = opts.userAgent ?? "webalyzer/1.0"
  const origin = new URL(site).origin
  const seen = new Set<string>()
  const sitemapUrls: string[] = []

  // robots.txt Sitemap: directives
  try {
    const robots = await fetchText(`${origin}/robots.txt`, ua, opts)
    if (robots) {
      for (const line of robots.split(/\r?\n/)) {
        const m = line.match(/^\s*Sitemap:\s*(\S+)\s*$/i)
        if (m) sitemapUrls.push(m[1].trim())
      }
    }
  } catch {
    /* robots missing is fine */
  }

  // Common locations
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    const candidate = `${origin}${path}`
    if (!sitemapUrls.includes(candidate)) sitemapUrls.push(candidate)
  }

  // Parse each sitemap (recursively for indexes)
  for (const sm of sitemapUrls) {
    await parseSitemap(sm, ua, opts, seen)
  }

  let urls = [...seen]
  if (opts.maxUrls && opts.maxUrls > 0) urls = urls.slice(0, opts.maxUrls)
  opts.onStatus?.(`Discovered ${urls.length} URL(s) from sitemap(s)`)
  return urls
}

async function parseSitemap(
  url: string,
  ua: string,
  opts: DiscoveryOptions,
  seen: Set<string>,
  depth = 0,
): Promise<void> {
  if (depth > 5) return // guard against sitemap-index loops
  let xml: string
  try {
    xml = await fetchText(url, ua, opts)
  } catch {
    return // 404 or fetch error → skip this sitemap
  }
  if (!xml) return

  // Nested sitemap index: <loc> inside <sitemap>
  const nested = xml.match(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi)
  if (nested && nested.length > 0) {
    for (const block of nested) {
      const m = block.match(/<loc>([^<]+)<\/loc>/i)
      if (m) await parseSitemap(m[1].trim(), ua, opts, seen, depth + 1)
    }
    return
  }

  // URL set: <url><loc>...</loc></url>
  const locs = xml.match(/<loc>([^<]+)<\/loc>/gi) || []
  for (const loc of locs) {
    const m = loc.match(/<loc>([^<]+)<\/loc>/i)
    if (m) {
      const u = m[1].trim()
      try {
        seen.add(new URL(u).toString())
      } catch {
        /* skip malformed */
      }
    }
  }
}

async function fetchText(
  url: string,
  ua: string,
  opts: DiscoveryOptions,
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return ""
    return await res.text()
  } catch {
    clearTimeout(timeout)
    return ""
  }
}
