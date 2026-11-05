/**
 * 分类引擎（纯函数）：
 * 1. category_rules 按 priority 升序匹配（keyword 包含 / regex），命中即停；
 * 2. merchant_rules 用规范化商户名精确匹配；
 * 3. 都未命中则返回 null（进入待分类）。
 */

import { normalizeMerchantName } from './merchant';
import type { CategoryRule, Direction, MerchantRule } from './types';

export interface ClassifyInput {
  counterparty: string;
  description: string;
  direction: Direction;
  amountCents: number;
}

export interface ClassifyResult {
  category: string | null;
  subcategory: string | null;
  matchedBy: 'rule' | 'merchant' | 'none';
}

export function classify(
  input: ClassifyInput,
  rules: CategoryRule[],
  merchantRules: MerchantRule[]
): ClassifyResult {
  const text = `${input.counterparty} ${input.description}`.toLowerCase();

  const sorted = rules.filter((r) => r.enabled).slice().sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (rule.matchType === 'keyword') {
      if (text.includes(rule.pattern.toLowerCase())) {
        return { category: rule.category, subcategory: rule.subcategory, matchedBy: 'rule' };
      }
    } else {
      try {
        if (new RegExp(rule.pattern, 'i').test(text)) {
          return { category: rule.category, subcategory: rule.subcategory, matchedBy: 'rule' };
        }
      } catch {
        // 非法正则忽略，不影响后续规则
      }
    }
  }

  const key = normalizeMerchantName(input.counterparty);
  if (key) {
    const hit = merchantRules.find((r) => r.merchantKey === key);
    if (hit) {
      return { category: hit.category, subcategory: hit.subcategory, matchedBy: 'merchant' };
    }
  }

  return { category: null, subcategory: null, matchedBy: 'none' };
}
