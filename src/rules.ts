import { Category, Priority, RuleDefinition, RuleT } from "#src/types.ts"
import ecommerceRules from "../rules/e-commerce.json" with { type: "json" }

class OfficalRulesSDK {
  private pack: RuleT

  constructor(pack: RuleT) {
    this.pack = pack
  }

  get metadata() {
    return this.pack.metadata
  }

  get rules(): RuleDefinition[] {
    return Object.values(this.pack.rules)
  }

  getRule(id: string): RuleDefinition | undefined {
    return this.pack.rules[id]
  }

  getByPriority(p: Priority): RuleDefinition[] {
    return this.rules.filter((r) => r.priority === p && !r.disabled)
  }

  getByCategory(c: Category): RuleDefinition[] {
    return this.rules.filter((r) => r.category === c && !r.disabled)
  }
}

export const officialRules = new OfficalRulesSDK(ecommerceRules as RuleT)
