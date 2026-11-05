import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import { listCategoryRules } from '../src/data/repository';
import { defaultRuleCount } from '../src/domain/rules/seed';
import {
  addRule,
  removeRule,
  resetRulesToDefault,
  saveRule,
  toggleRule,
  validateRuleInput,
} from '../src/app/rules-actions';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

const baseRule = {
  priority: 10,
  matchType: 'keyword' as const,
  pattern: '测试商户',
  category: '餐饮' as const,
  subcategory: '外卖',
  enabled: true,
};

describe('分类规则管理操作', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
  });

  it('输入校验：空模式、空分类、非法正则', () => {
    expect(validateRuleInput({ ...baseRule, pattern: '' })).toContain('匹配模式不能为空');
    expect(validateRuleInput({ ...baseRule, category: '' })).toContain('分类不能为空');
    expect(validateRuleInput({ ...baseRule, matchType: 'regex', pattern: '(' })).toContain('正则表达式无效');
    expect(validateRuleInput(baseRule)).toBeNull();
  });

  it('新增、编辑、启停、删除规则', async () => {
    const id = await addRule(db, baseRule);
    let rules = await listCategoryRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ pattern: '测试商户', category: '餐饮', enabled: true });

    await saveRule(db, id, { ...baseRule, priority: 5, category: '购物', subcategory: null });
    rules = await listCategoryRules(db);
    expect(rules[0]).toMatchObject({ priority: 5, category: '购物', subcategory: null });

    await toggleRule(db, id, false);
    rules = await listCategoryRules(db);
    expect(rules[0].enabled).toBe(false);

    await removeRule(db, id);
    expect(await listCategoryRules(db)).toHaveLength(0);
  });

  it('恢复默认规则', async () => {
    await addRule(db, baseRule);
    const count = await resetRulesToDefault(db);
    expect(count).toBe(defaultRuleCount());
    const rules = await listCategoryRules(db);
    expect(rules).toHaveLength(defaultRuleCount());
  });
});
