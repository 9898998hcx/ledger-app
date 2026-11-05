import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { listCategoryRules } from '../src/data/repository';
import { defaultRuleCount, ensureDefaultRules } from '../src/domain/rules/seed';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

describe('默认规则种子', () => {
  it('写入默认规则且幂等', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);

    const first = await ensureDefaultRules(db);
    expect(first).toBe(defaultRuleCount());
    expect(defaultRuleCount()).toBeGreaterThanOrEqual(20);
    expect(await listCategoryRules(db)).toHaveLength(defaultRuleCount());

    const second = await ensureDefaultRules(db);
    expect(second).toBe(0);
    expect(await listCategoryRules(db)).toHaveLength(defaultRuleCount());
  });
});
