import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { listTransactions } from '../src/data/repository';
import { ensureDefaultRules } from '../src/domain/rules/seed';
import { importWechatFile } from '../src/domain/import';
import { computeStats } from '../src/domain/stats';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/wechat-sample.csv', import.meta.url)),
  'utf8'
);

describe('导入时自动分类', () => {
  it('默认规则命中后无待分类交易', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    await ensureDefaultRules(db);

    const summary = await importWechatFile(db, 'wechat-classify.csv', fixture);
    expect(summary.inserted).toBe(6);

    const rows = await listTransactions(db);
    const byName = new Map(rows.map((r) => [r.counterparty, r]));
    expect(byName.get('美团外卖')?.category).toBe('餐饮');
    expect(byName.get('滴滴出行')?.category).toBe('交通');
    expect(byName.get('张三')?.category).toBe('人情往来');
    expect(byName.get('盒马鲜生')?.category).toBe('购物');
    expect(byName.get('某某')?.category).toBe('人情往来');

    expect(await listTransactions(db, { uncategorizedOnly: true })).toHaveLength(0);
  });

  it('退款收入行保留「退款」分类并计入收入', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    await ensureDefaultRules(db);

    const refundCsv = [
      '交易时间,交易类型,交易对方,商品,收/支,金额(元),当前状态,交易单号',
      '2026-10-08 10:00:00,小拉出行-退款,小拉出行,小拉出行,收入,21.36,已全额退款,WX-R1',
      '2026-10-08 10:00:00,商户消费,小拉出行,预付车费,支出,21.36,已全额退款,WX-R2',
    ].join('\n');
    const summary = await importWechatFile(db, 'refund.csv', refundCsv);
    expect(summary.inserted).toBe(2);

    const rows = await listTransactions(db, { source: 'wechat' });
    const income = rows.find((r) => r.direction === 'income');
    expect(income?.category).toBe('退款');

    const stats = computeStats(rows, '2026', '10');
    expect(stats.incomeCents).toBe(2136);
    expect(stats.expenseCents).toBe(2136);
    expect(stats.balanceCents).toBe(0);
  });
});
