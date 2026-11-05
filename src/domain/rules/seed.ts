/**
 * 默认分类规则种子：数据库为空时写入示例规则，已有规则则不重复写入。
 */

import type { AppDatabase } from '../../data/db/database';
import { insertCategoryRule, listCategoryRules } from '../../data/repository';
import defaultRules from './default-rules.json';

interface SeedRule {
  priority: number;
  matchType: 'keyword' | 'regex';
  pattern: string;
  category: string;
  subcategory: string | null;
}

const RULES = defaultRules as SeedRule[];

export async function ensureDefaultRules(db: AppDatabase): Promise<number> {
  const existing = await listCategoryRules(db);
  if (existing.length > 0) return 0;

  let count = 0;
  for (const rule of RULES) {
    await insertCategoryRule(db, {
      priority: rule.priority,
      matchType: rule.matchType,
      pattern: rule.pattern,
      category: rule.category,
      subcategory: rule.subcategory,
      enabled: true,
    });
    count++;
  }
  return count;
}

export function defaultRuleCount(): number {
  return RULES.length;
}
