export type Priority = "P0" | "P1" | "P2" | "P3"
export type Category =
  | "agent"
  | "seo"
  | "performance"
  | "structure"
  | "security"
  | "accessibility"
  | "e-commerce"
  | "custom"
export type JsonLdFieldType =
  | "string"
  | "number"
  | "url"
  | "boolean"
  | "date"
export type CheckType =
  | "selector"
  | "header"
  | "regex"
  | "fetch"
  | "script"
  | "composite"
  | "custom"
  | "jsonld"
export type Effort = "trivial" | "easy" | "moderate" | "hard" | "complex"
export type ImpactLevel = "critical" | "high" | "moderate" | "low" | "none"
export type AgentImpact = "blocking" | "degraded" | "minor" | "none"
export type PerfImpact = "blocking" | "slow" | "minor" | "none"
export type ConversionImpact =
  | "direct-loss"
  | "indirect-loss"
  | "friction"
  | "none"
export type Scope = "page" | "site" | "root"
export type CompositeLogic = "all" | "any" | "none"
export type EngineFeature =
  | "dom-parser"
  | "js-execution"
  | "screenshot"
  | "mcp-bridge"

export type CreatedBy = {
  name: string
  email?: string
  url?: string
  organization?: string
}

export type Requires = {
  engine?: string
  features?: EngineFeature[]
}

export type Metadata = {
  name: string
  slug?: string
  description?: string
  version: string
  category?: Category
  tags?: string[]
  createdBy: CreatedBy
  updatedAt: string // ISO 8601: YYYY-MM-DD
  license?: string
  homepage?: string
  requires?: Requires
}

export type Threshold = {
  min?: number
  max?: number
  equals?: string | number | boolean
  contains?: string
  statusCode?: number
  ratio?: number
}

export type Check = {
  type: CheckType
  target?: string
  selector?: string
  attribute?: string
  headerName?: string
  url?: string
  pattern?: string
  script?: string
  rules?: string[]
  compositeLogic?: CompositeLogic
  threshold?: Threshold
  scope?: Scope
  // jsonld check (generic, fully rule-driven — no static assumptions)
  jsonldType?: string
  requireContextSchemaOrg?: boolean
  requiredFields?: string[]
  fieldTypes?: Record<string, JsonLdFieldType>
}

export type Fix = {
  instruction: string
  codeSnippet?: string
  reference?: string
  effort?: Effort
  automated?: boolean
}

export type Impact = {
  seo?: ImpactLevel
  agent?: AgentImpact
  performance?: PerfImpact
  conversion?: ConversionImpact
}

export type Example = {
  case?: string
  input?: string
  expected?: "pass" | "fail"
}

export type RuleDefinition = {
  id: string
  name: string
  description?: string
  category: Category
  priority: Priority
  check: Check
  fix?: Fix
  impact?: Impact
  examples?: Example[]
  disabled?: boolean
  notes?: string
}

// Root type — this is RuleT, the shape of your entire JSON file
export type RuleT = {
  $schema?: string
  metadata: Metadata
  rules: Record<string, RuleDefinition>
}

export type Finding = {
  ruleId: string
  priority: Priority
  title: string
  why: string
  fix: string
  codeSnippet?: string
  effort?: Effort
  affectedUrls: string[]
  details?: Record<string, unknown>
}
