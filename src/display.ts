import type { AuditResult } from "#src/engine.ts"
import type { Finding } from "#src/types.ts"

export type OutputType = "overview" | "info" | "agent" | "compact-agent"

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
}

const PRIORITY_COLOR: Record<string, string> = {
  P0: C.red,
  P1: C.yellow,
  P2: C.cyan,
  P3: C.dim,
}

// Dispatch by requested output type.
export function formatReport(
  result: AuditResult,
  type: OutputType = "info",
): string {
  switch (type) {
    case "overview":
      return formatOverview(result)
    case "agent":
      return formatAgent(result)
    case "compact-agent":
      return formatCompactAgent(result)
    case "info":
    default:
      return formatText(result)
  }
}

// Pure-text console report for AI agents. Includes the fix instruction per
// finding so an agent can act on it directly. No JSON/XML — just readable text.
export function formatText(result: AuditResult): string {
  const out: string[] = []
  const { stats } = result

  if (result.error) {
    out.push(`${C.red}✗ Audit error:${C.reset} ${result.error}`)
    return out.join("\n")
  }

  // Header
  out.push(`${C.bold}webalyzer audit${C.reset} → ${result.url}`)
  out.push(
    `Score ${C.bold}${stats.score}${C.reset}/100 (${gradeColor(stats.grade)}${
      stats.grade
    }${C.reset}) │ ${stats.failed} findings │ ${result.durationMs}ms`,
  )
  out.push(
    `  P0:${stats.p0} P1:${stats.p1} P2:${stats.p2} P3:${stats.p3} │ passed:${stats.passed}/${stats.total}`,
  )
  out.push("")

  if (result.findings.length === 0) {
    out.push(`${C.green}✓ No findings. Clean.${C.reset}`)
    return out.join("\n")
  }

  // Findings, ordered P0 → P3
  const ordered = [...result.findings].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  )
  for (const f of ordered) out.push(formatFinding(f))

  return out.join("\n")
}

// ───────────────────────────────────────────────────────────
// overview — simple human-facing summary. No ANSI color.
// ───────────────────────────────────────────────────────────
function formatOverview(result: AuditResult): string {
  const out: string[] = []
  const { stats } = result
  if (result.error) {
    out.push(`AUDIT FAILED: ${result.error}`)
    return out.join("\n")
  }
  out.push(`Webalyzer Audit — ${result.url}`)
  out.push(`Health: ${stats.score}/100 (Grade ${stats.grade})`)
  out.push(
    `Findings: ${stats.failed} (P0:${stats.p0} P1:${stats.p1} P2:${stats.p2} P3:${stats.p3}) │ Passed ${stats.passed}/${stats.total}`,
  )
  if (result.findings.length === 0) {
    out.push("Status: Clean. No issues found.")
    return out.join("\n")
  }
  out.push("")
  out.push("Top issues:")
  const ordered = [...result.findings].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  )
  for (const f of ordered) {
    out.push(`- [${f.priority}] ${f.title} (${f.ruleId})`)
  }
  return out.join("\n")
}

// ───────────────────────────────────────────────────────────
// agent — token-optimized, structured, no decorative color.
// One compact line per finding with action + fix.
// ───────────────────────────────────────────────────────────
function formatAgent(result: AuditResult): string {
  const out: string[] = []
  const { stats } = result
  if (result.error) {
    out.push(`ERR ${result.url} ${result.error}`)
    return out.join("\n")
  }
  out.push(
    `AUDIT url=${result.url} score=${stats.score} grade=${stats.grade} findings=${stats.failed} p0=${stats.p0} p1=${stats.p1} p2=${stats.p2} p3=${stats.p3} passed=${stats.passed}/${stats.total} ms=${result.durationMs}`,
  )
  if (result.findings.length === 0) {
    out.push("OK no findings")
    return out.join("\n")
  }
  const ordered = [...result.findings].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  )
  for (const f of ordered) {
    const snip = f.codeSnippet ? ` || fix_code=${JSON.stringify(f.codeSnippet)}` : ""
    const det = f.details && Object.keys(f.details).length
      ? ` || details=${JSON.stringify(f.details)}`
      : ""
    out.push(
      `FINDING id=${f.ruleId} pri=${f.priority} title=${JSON.stringify(f.title)} why=${JSON.stringify(f.why)} fix=${JSON.stringify(f.fix)} effort=${f.effort ?? "-"}${snip}${det}`,
    )
  }
  return out.join("\n")
}

// ───────────────────────────────────────────────────────────
// compact-agent — maximally compressed, minimal tokens.
// Delimited tokens, no prose, only essentials.
// ───────────────────────────────────────────────────────────
function formatCompactAgent(result: AuditResult): string {
  const { stats } = result
  if (result.error) {
    return `E|${result.url}|${result.error}`
  }
  if (result.findings.length === 0) {
    return `OK|${result.url}|${stats.score}|${stats.grade}`
  }
  const lines = result.findings
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .map((f) => {
      const fix = f.fix.length > 80 ? f.fix.slice(0, 80) : f.fix
      return `$|${f.priority}|${f.ruleId}|${f.title}|${fix}`
    })
  return [
    `R|${result.url}|${stats.score}|${stats.grade}|${stats.failed}|${stats.passed}/${stats.total}`,
    ...lines,
  ].join("\n")
}

function formatFinding(f: Finding): string {
  const color = PRIORITY_COLOR[f.priority] ?? C.reset
  const lines: string[] = []
  lines.push(
    `${color}[${f.priority}] ${f.ruleId}${C.reset} ${C.bold}${f.title}${C.reset}`,
  )
  lines.push(`  why: ${f.why}`)
  lines.push(`  fix: ${f.fix}`)
  if (f.codeSnippet) {
    lines.push(`  snippet:`)
    for (const ln of f.codeSnippet.split("\n")) lines.push(`    ${C.dim}${ln}${C.reset}`)
  }
  if (f.effort) lines.push(`  effort: ${f.effort}`)
  if (f.details && Object.keys(f.details).length > 0) {
    lines.push(`  details: ${JSON.stringify(f.details)}`)
  }
  return lines.join("\n")
}

function gradeColor(grade: string): string {
  if (grade === "A" || grade === "B") return C.green
  if (grade === "C" || grade === "D") return C.yellow
  return C.red
}

function priorityRank(p: string): number {
  return p === "P0" ? 0 : p === "P1" ? 1 : p === "P2" ? 2 : 3
}
