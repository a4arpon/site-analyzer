import { selectAll } from "css-select"
import type { AnyNode, Document, Element } from "domhandler"
import { DomUtils, parseDocument } from "htmlparser2"
import { log } from "node:console"
import type {
  Check,
  Finding,
  Priority,
  RuleDefinition,
  RuleT,
  Threshold,
} from "#src/types.ts"
import { EngineDefaults, ScoreWeights } from "#src/config.ts"
import { crawl, type CrawledPage } from "#src/crawler.ts"

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AuditResult {
  url: string
  findings: Finding[]
  stats: {
    total: number
    passed: number
    failed: number
    skipped: number
    p0: number
    p1: number
    p2: number
    p3: number
    score: number // 0..100 health score
    grade: string // A..F letter grade
  }
  durationMs: number
  error?: string
}

export interface EngineOptions {
  fetch?: {
    timeoutMs?: number
    userAgent?: string
    maxRedirects?: number
    retries?: number
    headers?: Record<string, string>
  }
  concurrency?: number
  cache?: boolean
  followRedirects?: boolean
  ruleBatchSize?: number
  logLevel?: "silent" | "error" | "warn" | "info" | "debug"
}

// ═══════════════════════════════════════════════════════════════
// Logger (ANSI color kept on — terminal-friendly)
// ═══════════════════════════════════════════════════════════════

type LogLevel = "silent" | "error" | "warn" | "info" | "debug"

const LEVEL_MAP: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

class Logger {
  private level: number

  constructor(level: LogLevel = "info") {
    this.level = LEVEL_MAP[level]
  }

  private ts(): string {
    return new Date().toISOString().split("T")[1].slice(0, 12)
  }

  private emit(label: string, color: string, msg: string) {
    log(`\x1b[${color}m[${label}]\x1b[0m ${this.ts()} ${msg}`)
  }

  error(msg: string) {
    if (this.level >= 1) this.emit("ERR", "31", msg)
  }
  warn(msg: string) {
    if (this.level >= 2) this.emit("WRN", "33", msg)
  }
  info(msg: string) {
    if (this.level >= 3) this.emit("INF", "36", msg)
  }
  debug(msg: string) {
    if (this.level >= 4) this.emit("DBG", "90", msg)
  }
  success(msg: string) {
    if (this.level >= 3) this.emit("OK ", "32", msg)
  }
  rulePass(id: string, name: string) {
    if (this.level >= 3) {
      log(`  \x1b[32m✓\x1b[0m \x1b[90m[${id}]\x1b[0m ${name}`)
    }
  }
  ruleFail(id: string, name: string, reason: string) {
    if (this.level >= 2) {
      log(
        `  \x1b[31m✗\x1b[0m \x1b[90m[${id}]\x1b[0m ${name} \x1b[31m→ ${reason}\x1b[0m`,
      )
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Semaphore — gates cross-batch concurrency
// ═══════════════════════════════════════════════════════════════

class Semaphore {
  private permits: number
  private queue: (() => void)[] = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (this.permits <= 0) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.permits--
    try {
      return await fn()
    } finally {
      this.permits++
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RuleCheckerEngine
// ═══════════════════════════════════════════════════════════════

export class RuleCheckerEngine {
  private rules: RuleT
  private options: Required<EngineOptions>
  private pageCache: Map<string, CrawledPage>
  private abortControllers: Map<string, AbortController>
  private semaphore: Semaphore
  private logger: Logger

  constructor(rules: RuleT, options: EngineOptions = {}) {
    this.rules = rules
    this.options = {
      fetch: {
        timeoutMs: EngineDefaults.fetch.timeoutMs,
        userAgent: EngineDefaults.fetch.userAgent,
        maxRedirects: EngineDefaults.fetch.maxRedirects,
        retries: EngineDefaults.fetch.retries,
        headers: {},
        ...options.fetch,
      },
      concurrency: Math.max(
        1,
        Math.min(20, options.concurrency ?? EngineDefaults.concurrency),
      ),
      cache: options.cache ?? EngineDefaults.cache,
      followRedirects: options.followRedirects ?? EngineDefaults.followRedirects,
      ruleBatchSize: Math.max(
        1,
        Math.min(50, options.ruleBatchSize ?? EngineDefaults.ruleBatchSize),
      ),
      logLevel: options.logLevel ?? EngineDefaults.logLevel,
    }

    this.pageCache = new Map()
    this.abortControllers = new Map()
    this.semaphore = new Semaphore(this.options.concurrency)
    this.logger = new Logger(this.options.logLevel)

    const enabled = this.enabledRules.length
    const disabled = this.ruleCount - enabled
    this.logger.info(
      `Engine ready │ pack: \x1b[1m${rules.metadata.name}\x1b[0m v${rules.metadata.version} │ rules: ${enabled} enabled${
        disabled > 0 ? `, ${disabled} disabled` : ""
      }`,
    )
  }

  // ───────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────

  async audit(url: string): Promise<AuditResult> {
    const start = performance.now()
    this.logger.info(`Auditing \x1b[1m${url}\x1b[0m …`)

    try {
      const page = await this.crawlCached(url)
      const findings = await this.checkPage(page)
      const duration = Math.round(performance.now() - start)
      const stats = this.calculateStats(findings)

      this.logger.success(
        `Audit done │ score ${stats.score} (${stats.grade}) │ ${stats.failed} findings │ ${duration}ms`,
      )

      return { url, findings, stats, durationMs: duration }
    } catch (err) {
      const duration = Math.round(performance.now() - start)
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Audit failed: ${msg}`)
      return {
        url,
        findings: [],
        stats: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          p0: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          score: 0,
          grade: "F",
        },
        durationMs: duration,
        error: msg,
      }
    }
  }

  auditMany(urls: string[]): Promise<AuditResult[]> {
    return Promise.all(
      urls.map((url) => this.semaphore.acquire(() => this.audit(url))),
    )
  }

  abortAll(): void {
    this.logger.warn("Aborting all in-flight requests …")
    for (const controller of this.abortControllers.values()) {
      controller.abort()
    }
    this.abortControllers.clear()
  }

  clearCache(): void {
    this.logger.debug("Page cache cleared")
    this.pageCache.clear()
  }

  get metadata() {
    return this.rules.metadata
  }

  get ruleCount(): number {
    return Object.keys(this.rules.rules).length
  }

  get enabledRules(): RuleDefinition[] {
    return Object.values(this.rules.rules).filter((r) => !r.disabled)
  }

  // ───────────────────────────────────────────────────────────
  // Crawl (delegates to crawler.ts)
  // ───────────────────────────────────────────────────────────

  private async crawlCached(url: string): Promise<CrawledPage> {
    if (this.options.cache && this.pageCache.has(url)) {
      this.logger.debug(`Cache hit: ${url}`)
      return this.pageCache.get(url)!
    }
    const page = await crawl(url, {
      timeoutMs: this.options.fetch.timeoutMs,
      userAgent: this.options.fetch.userAgent,
      followRedirects: this.options.followRedirects,
      retries: this.options.fetch.retries,
      headers: this.options.fetch.headers,
      onStatus: (m) => this.logger.success(m),
      onDebug: (m) => this.logger.debug(m),
    })
    if (this.options.cache) this.pageCache.set(url, page)
    return page
  }

  // ───────────────────────────────────────────────────────────
  // Rule execution
  // ───────────────────────────────────────────────────────────

  private async checkPage(page: CrawledPage): Promise<Finding[]> {
    const enabledRules = this.enabledRules
    const allFindings: Finding[] = []

    this.logger.info(`Checking ${enabledRules.length} rules …`)

    const batchSize = this.options.ruleBatchSize
    const batchCount = Math.ceil(enabledRules.length / batchSize)

    for (let i = 0; i < enabledRules.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1
      const batch = enabledRules.slice(i, i + batchSize)

      this.logger.debug(
        `Rule batch ${batchNum}/${batchCount} (${batch.length} rules)`,
      )

      const batchResults = await Promise.all(
        batch.map((rule) => this.checkSingleRule(rule, page)),
      )
      allFindings.push(...batchResults.flat())
    }

    return allFindings
  }

  private async checkSingleRule(
    rule: RuleDefinition,
    page: CrawledPage,
  ): Promise<Finding[]> {
    if (rule.disabled) return []

    // Scope guard: "root" rules only run on the root URL
    if (rule.check.scope === "root") {
      const pageOrigin = new URL(page.url).origin
      const ruleBase = this.rules.metadata.homepage || pageOrigin
      if (!page.url.startsWith(ruleBase)) {
        this.logger.debug(`[${rule.id}] skipped (root scope)`)
        return []
      }
    }

    try {
      let findings: Finding[] = []

      switch (rule.check.type) {
        case "selector":
          findings = this.checkSelector(rule, page)
          break
        case "header":
          findings = this.checkHeader(rule, page)
          break
        case "regex":
          findings = this.checkRegex(rule, page)
          break
        case "fetch":
          findings = await this.checkFetch(rule, page)
          break
        case "composite":
          findings = this.checkComposite(rule, page)
          break
        case "jsonld":
          findings = this.checkJsonLd(rule, page)
          break
        case "script":
          findings = this.checkScript(rule, page)
          break
        case "custom":
          findings = []
          break
        default:
          findings = []
      }

      if (findings.length === 0) {
        this.logger.rulePass(rule.id, rule.name)
      } else {
        const reasons = findings
          .map((f) =>
            f.details?.actualValue ?? f.details?.matchedCount ?? "fail"
          )
          .join(", ")
        this.logger.ruleFail(rule.id, rule.name, reasons)
      }

      return findings
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[${rule.id}] crashed: ${msg}`)
      return [
        this.createFinding(rule, page.url, {
          engineError: `Rule execution failed: ${msg}`,
        }),
      ]
    }
  }

  // ───────────────────────────────────────────────────────────
  // Check implementations
  // ───────────────────────────────────────────────────────────

  private checkSelector(rule: RuleDefinition, page: CrawledPage): Finding[] {
    const check = rule.check
    if (!check.selector) {
      this.logger.warn(`[${rule.id}] missing selector`)
      return []
    }

    const doc = this.getParsedDocument(page)
    const elements = selectAll(check.selector, doc)

    this.logger.debug(
      `[${rule.id}] selector "${check.selector}" matched ${elements.length} node(s)`,
    )

    const value = this.extractSelectorValue(elements, check)
    const passes = this.meetsThreshold(value, check.threshold)

    if (passes) return []

    return [
      this.createFinding(rule, page.url, {
        selector: check.selector,
        attribute: check.attribute,
        matchedCount: elements.length,
        actualValue: String(value).slice(0, 200),
      }),
    ]
  }

  private checkHeader(rule: RuleDefinition, page: CrawledPage): Finding[] {
    const check = rule.check
    if (!check.headerName) return []

    const headerValue = page.headers[check.headerName.toLowerCase()] || ""
    const passes = this.meetsThreshold(headerValue, check.threshold)

    this.logger.debug(
      `[${rule.id}] header "${check.headerName}" = "${headerValue.slice(0, 60)}"`,
    )

    return passes ? [] : [
      this.createFinding(rule, page.url, {
        header: check.headerName,
        actualValue: headerValue,
      }),
    ]
  }

  private checkRegex(rule: RuleDefinition, page: CrawledPage): Finding[] {
    const check = rule.check
    if (!check.pattern) return []

    const regex = new RegExp(check.pattern)
    const haystack = check.target === "headers"
      ? JSON.stringify(page.headers)
      : page.html
    const matches = regex.test(haystack)

    const expectMatch = check.threshold?.equals !== false
    const passes = matches === expectMatch

    this.logger.debug(
      `[${rule.id}] regex /${check.pattern}/ → ${matches} (expect ${expectMatch})`,
    )

    return passes ? [] : [
      this.createFinding(rule, page.url, {
        pattern: check.pattern,
        matched: matches,
      }),
    ]
  }

  private async checkFetch(
    rule: RuleDefinition,
    page: CrawledPage,
  ): Promise<Finding[]> {
    const check = rule.check
    if (!check.url) return []

    const baseOrigin = new URL(page.url).origin
    const targetUrl = check.url.replace(/\{\{\s*baseUrl\s*\}\}/g, baseOrigin)

    this.logger.info(`[${rule.id}] fetching ${targetUrl} …`)

    try {
      const res = await fetch(targetUrl, {
        headers: { "User-Agent": this.options.fetch.userAgent },
        redirect: this.options.followRedirects ? "follow" : "manual",
      })
      const expectedStatus = check.threshold?.statusCode ?? 200
      const passes = this.meetsThreshold(res.status, {
        statusCode: expectedStatus,
      })

      this.logger.debug(`[${rule.id}] fetch → HTTP ${res.status}`)

      return passes ? [] : [
        this.createFinding(rule, page.url, {
          fetchedUrl: targetUrl,
          status: res.status,
        }),
      ]
    } catch {
      return [
        this.createFinding(rule, page.url, {
          fetchedUrl: targetUrl,
          error: "Fetch failed or timed out",
        }),
      ]
    }
  }

  private checkComposite(rule: RuleDefinition, page: CrawledPage): Finding[] {
    const check = rule.check
    if (!check.rules || check.rules.length === 0) return []

    this.logger.debug(
      `[${rule.id}] composite (${check.rules.length} sub-rules)`,
    )

    const subFindings: Finding[] = []
    const subResults = new Map<string, boolean>()

    for (const subId of check.rules) {
      const subRule = this.rules.rules[subId]
      if (!subRule || subRule.disabled) {
        subResults.set(subId, true)
        continue
      }

      const findings = this.checkSingleRuleSync(subRule, page)
      subResults.set(subId, findings.length === 0)
      subFindings.push(...findings)
    }

    const logic = check.compositeLogic ?? "all"
    let passes = false

    if (logic === "all") passes = Array.from(subResults.values()).every(Boolean)
    else if (logic === "any") {
      passes = Array.from(subResults.values()).some(Boolean)
    } else if (logic === "none") {
      passes = Array.from(subResults.values()).every((v) => !v)
    }

    this.logger.debug(`[${rule.id}] composite logic=${logic} → ${passes}`)

    return passes ? [] : subFindings
  }

  private checkJsonLd(rule: RuleDefinition, page: CrawledPage): Finding[] {
    const check = rule.check
    const doc = this.getParsedDocument(page)

    const scripts = selectAll("script[type='application/ld+json']", doc)
    this.logger.debug(
      `[${rule.id}] found ${scripts.length} ld+json block(s)`,
    )

    if (scripts.length === 0) {
      return [this.createFinding(rule, page.url, {
        jsonldError: "no application/ld+json script block found",
      })]
    }

    // Collect + normalize all nodes from all blocks (unwrap arrays, @graph).
    const nodes: unknown[] = []
    const parseErrors: string[] = []
    for (const s of scripts) {
      const raw = DomUtils.textContent(s).trim()
      if (!raw) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Some blocks are double-string-encoded.
        try {
          parsed = JSON.parse(
            raw.replace(/^['"]|['"]$/g, "").replace(/\\"/g, '"'),
          )
        } catch (e) {
          parseErrors.push(e instanceof Error ? e.message : String(e))
          continue
        }
      }
      this.collectNodes(parsed, nodes)
    }

    if (parseErrors.length > 0) {
      return [this.createFinding(rule, page.url, {
        jsonldError: `invalid JSON in ld+json: ${parseErrors.join("; ")}`,
      })]
    }

    if (nodes.length === 0) {
      return [this.createFinding(rule, page.url, {
        jsonldError: "ld+json blocks present but contained no objects",
      })]
    }

    // Optionally require schema.org @context.
    if (check.requireContextSchemaOrg) {
      const anyCtx = nodes.some((n) => this.hasSchemaOrgContext(n))
      if (!anyCtx) {
        return [this.createFinding(rule, page.url, {
          jsonldError: "@context is not schema.org",
        })]
      }
    }

    // If a specific @type is required, restrict to matching nodes.
    let targets = nodes
    if (check.jsonldType) {
      targets = nodes.filter(
        (n) =>
          typeof n === "object" && n !== null &&
          this.matchType((n as Record<string, unknown>)["@type"], check.jsonldType!),
      )
      if (targets.length === 0) {
        return [this.createFinding(rule, page.url, {
          jsonldError: `no schema node with @type "${check.jsonldType}"`,
        })]
      }
    }

    // Validate required fields + types against each target node.
    const findings: Finding[] = []
    const requiredFields = check.requiredFields ?? []
    const fieldTypes = check.fieldTypes ?? {}

    if (requiredFields.length > 0) {
      for (const node of targets) {
        for (const path of requiredFields) {
          const val = this.getPath(node, path)
          if (this.isEmpty(val)) {
            findings.push(this.createFinding(rule, page.url, {
              jsonldField: path,
              jsonldError: `missing or empty field "${path}"`,
            }))
            continue
          }
          const expected = fieldTypes[path]
          if (expected && !this.matchesType(val, expected)) {
            findings.push(this.createFinding(rule, page.url, {
              jsonldField: path,
              jsonldError: `field "${path}" failed type check (expected ${expected})`,
              actualValue: String(Array.isArray(val) ? JSON.stringify(val) : val).slice(0, 200),
            }))
          }
        }
      }
    }

    return findings
  }

  // Unwrap a parsed JSON value into a flat list of schema nodes.
  private collectNodes(value: unknown, out: unknown[]): void {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const v of value) this.collectNodes(v, out)
      return
    }
    const obj = value as Record<string, unknown>
    if ("@graph" in obj && Array.isArray(obj["@graph"])) {
      for (const g of obj["@graph"]) this.collectNodes(g, out)
    }
    out.push(obj)
  }

  // @type may be a string or an array of strings.
  private matchType(actual: unknown, expected: string): boolean {
    if (typeof actual === "string") return actual === expected
    if (Array.isArray(actual)) return actual.includes(expected)
    return false
  }

  private hasSchemaOrgContext(n: unknown): boolean {
    if (typeof n !== "object" || n === null) return false
    const ctx = (n as Record<string, unknown>)["@context"]
    if (typeof ctx === "string") return ctx.includes("schema.org")
    if (Array.isArray(ctx)) return ctx.some((c) => typeof c === "string" && c.includes("schema.org"))
    return false
  }

  // Dotted-path getter. Supports "a.b.c" and "a[0].b".
  private getPath(root: unknown, path: string): unknown {
    const parts = path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean)
    let cur: unknown = root
    for (const p of parts) {
      if (cur === null || typeof cur !== "object") return undefined
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur
  }

  private isEmpty(v: unknown): boolean {
    return v === undefined || v === null || v === "" ||
      (Array.isArray(v) && v.length === 0)
  }

  private matchesType(v: unknown, type: string): boolean {
    switch (type) {
      case "string":
        return typeof v === "string" && v.trim().length > 0
      case "number":
        return typeof v === "number" && isFinite(v)
      case "boolean":
        return typeof v === "boolean"
      case "url":
        if (typeof v !== "string") return false
        try {
          const u = new URL(v)
          return u.protocol === "http:" || u.protocol === "https:"
        } catch {
          return false
        }
      case "date":
        if (typeof v !== "string") return false
        return !isNaN(Date.parse(v))
      default:
        return true
    }
  }

  private checkScript(rule: RuleDefinition, page: CrawledPage): Finding[] {
    this.logger.warn(`[${rule.id}] script-type rules not yet implemented`)
    return [
      this.createFinding(rule, page.url, {
        note:
          "Script-type rules require a sandboxed runner (not yet implemented)",
      }),
    ]
  }

  // ───────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────

  private getParsedDocument(page: CrawledPage): Document {
    if (page.document) {
      this.logger.debug("DOM cache hit")
      return page.document
    }

    this.logger.info("Parsing DOM …")
    const start = performance.now()
    const doc = parseDocument(page.html)
    const elapsed = Math.round(performance.now() - start)
    const elCount = selectAll("*", doc).length
    this.logger.success(`DOM parsed │ ${elCount} elements │ ${elapsed}ms`)

    if (this.options.cache) page.document = doc
    return doc
  }

  /**
   * Extract the value to test from selected elements.
   * Priority:
   * 1. If `attribute` is set → joined attribute values
   * 2. If threshold max <= 10 (and no attribute) → element count
   * 3. Otherwise → joined text content length
   */
  private extractSelectorValue(
    elements: AnyNode[],
    check: Check,
  ): number | string {
    if (check.attribute) {
      const vals = elements
        .filter((n): n is Element => n.type === "tag")
        .map((el) => DomUtils.getAttributeValue(el, check.attribute!) || "")
      return vals.join(" ").trim()
    }

    // Meta tags without explicit attribute → default to "content"
    const tagEls = elements.filter((n): n is Element => n.type === "tag")
    if (tagEls.length > 0 && tagEls[0].name === "meta") {
      return tagEls
        .map((el) => DomUtils.getAttributeValue(el, "content") || "")
        .join(" ")
        .trim()
    }

    // Heuristic: small threshold max → count elements, else → text length
    const thresholdMax = Math.max(
      check.threshold?.min ?? 0,
      check.threshold?.max ?? 0,
    )
    if (thresholdMax > 0 && thresholdMax <= 10) {
      return elements.length
    }

    const text = elements.map((el) => DomUtils.textContent(el)).join("").trim()
    return text.length
  }

  /**
   * Threshold evaluator.
   * FOOTGUN: for a non-numeric string value with a numeric threshold, this
   * compares the STRING LENGTH, not the content. Rule authors: a rule like
   * {equals: "https://..."} against a meta content string will match on length
   * alone and silently pass. Use `contains`/`equals` with string thresholds
   * only when length comparison is intended, or set an explicit `attribute`.
   */
  private meetsThreshold(
    value: number | string | boolean,
    threshold?: Threshold,
  ): boolean {
    if (!threshold) return true

    const strValue = String(value)

    if (threshold.equals !== undefined) {
      return value === threshold.equals || strValue === String(threshold.equals)
    }
    if (threshold.contains !== undefined) {
      return strValue.includes(threshold.contains)
    }

    const numValue = typeof value === "number" ? value : Number(value)
    const isNaNString = typeof value === "string" && isNaN(numValue)
    const compareVal = isNaNString ? strValue.length : numValue

    if (threshold.min !== undefined && compareVal < threshold.min) return false
    if (threshold.max !== undefined && compareVal > threshold.max) return false
    if (
      threshold.statusCode !== undefined && compareVal !== threshold.statusCode
    ) {
      return false
    }
    if (threshold.ratio !== undefined && compareVal < threshold.ratio) {
      return false
    }

    return true
  }

  private createFinding(
    rule: RuleDefinition,
    url: string,
    details: Record<string, unknown>,
  ): Finding {
    return {
      ruleId: rule.id,
      priority: rule.priority,
      title: rule.name,
      why: rule.description || "No description provided",
      fix: rule.fix?.instruction || "No fix provided",
      codeSnippet: rule.fix?.codeSnippet,
      effort: rule.fix?.effort,
      affectedUrls: [url],
      details,
    }
  }

  private checkSingleRuleSync(
    rule: RuleDefinition,
    page: CrawledPage,
  ): Finding[] {
    if (rule.check.type === "selector") return this.checkSelector(rule, page)
    if (rule.check.type === "header") return this.checkHeader(rule, page)
    if (rule.check.type === "regex") return this.checkRegex(rule, page)
    return []
  }

  private calculateStats(findings: Finding[]) {
    const counts: Record<Priority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
    for (const f of findings) counts[f.priority]++

    const total = this.enabledRules.length
    const failed = findings.length
    const passed = total - failed

    // Start at 100, subtract weighted points per finding, floor at 0.
    const penalty = findings.reduce(
      (sum, f) => sum + (ScoreWeights[f.priority] ?? 0),
      0,
    )
    const score = Math.max(0, 100 - penalty)
    const grade = scoreToGrade(score)

    return {
      total,
      passed,
      failed,
      skipped: this.ruleCount - total,
      p0: counts.P0,
      p1: counts.P1,
      p2: counts.P2,
      p3: counts.P3,
      score,
      grade,
    }
  }
}

// Shared grade helper (also used by display.ts).
export function scoreToGrade(score: number): string {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  if (score >= 50) return "E"
  return "F"
}
