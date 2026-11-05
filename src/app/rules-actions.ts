/**
 * 分类规则操作：新增、编辑、启停、删除、恢复默认。
 * 所有写操作都做输入校验（空模式/空分类/非法正则）。
 */

import type { AppDatabase } from '../data/db/database';
import {
  deleteAllCategoryRules,
  deleteCategoryRule,
  insertCategoryRule,
  setCategoryRuleEnabled,
  updateCategoryRule,
} from '../data/repository';
import { ensureDefaultRules } from '../domain/rules/seed';
import type { CategoryRule, MatchType } from '../domain/types';

export interface RuleInput {
  priority: number;
  matchType: MatchType;
  pattern: string;
  category: string;
  subcategory: string | null;
  enabled: boolean;
}

export function normalizeRuleInput(input: RuleInput): RuleInput {
  return {
    priority: Number.isFinite(input.priority) ? Math.round(input.priority) : 100,
    matchType: input.matchType === 'regex' ? 'regex' : 'keyword',
    pattern: input.pattern.trim(),
    category: input.category.trim(),
    subcategory: input.subcategory && input.subcategory.trim() ? input.subcategory.trim() : null,
    enabled: input.enabled,
  };
}

export function validateRuleInput(input: RuleInput): string | null {
  if (!input.category.trim()) return '分类不能为空';
  if (!input.pattern.trim()) return '匹配模式不能为空';
  if (!Number.isFinite(input.priority)) return '优先级必须是数字';
  if (input.matchType === 'regex') {
    try {
      new RegExp(input.pattern);
    } catch {
      return '正则表达式无效';
    }
  }
  return null;
}

export async function addRule(db: AppDatabase, input: RuleInput): Promise<number> {
  const error = validateRuleInput(input);
  if (error) throw new Error(error);
  const rule = normalizeRuleInput(input);
  return insertCategoryRule(db, rule);
}

export async function saveRule(db: AppDatabase, id: number, input: RuleInput): Promise<void> {
  const error = validateRuleInput(input);
  if (error) throw new Error(error);
  const rule = normalizeRuleInput(input);
  const full: CategoryRule = { id, ...rule };
  await updateCategoryRule(db, full);
}

export async function removeRule(db: AppDatabase, id: number): Promise<void> {
  await deleteCategoryRule(db, id);
}

export async function toggleRule(db: AppDatabase, id: number, enabled: boolean): Promise<void> {
  await setCategoryRuleEnabled(db, id, enabled);
}

/** 清空全部规则并重新写入默认规则，返回写入条数 */
export async function resetRulesToDefault(db: AppDatabase): Promise<number> {
  await deleteAllCategoryRules(db);
  return ensureDefaultRules(db);
}
