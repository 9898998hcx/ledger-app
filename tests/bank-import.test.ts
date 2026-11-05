import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import { countTransactions, listImportBatches, listTransactions } from '../src/data/repository';
import { ensureDefaultRules } from '../src/domain/rules/seed';
import { importBankFile, importWechatFile } from '../src/domain/import';
import { computeMonthlyStats } from '../src/domain/stats';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const bankBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/bank-sample.csv', import.meta.url)))
);

describe('银行导入与跨平台镜像', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    await ensureDefaultRules(db);
  });

  it('导入银行流水：5 条入账并自动分类', async () => {
    const summary = await importBankFile(db, 'bank-sample.csv', bankBytes);
    expect(summary.source).toBe('bank');
    expect(summary.duplicateFile).toBe(false);
    expect(summary.totalRows).toBe(5);
    expect(summary.inserted).toBe(5);
    expect(await countTransactions(db)).toBe(5);

    const rows = await listTransactions(db);
    const byName = new Map(rows.map((r) => [r.counterparty, r]));
    expect(byName.get('美团外卖')?.category).toBe('餐饮');
    expect(byName.get('滴滴出行')?.category).toBe('交通');
    expect(byName.get('盒马鲜生')?.category).toBe('购物');

    const batches = await listImportBatches(db);
    expect(batches[0]).toMatchObject({ source: 'bank', insertedRows: 5, skippedRows: 0 });
  });

  it('后导入微信同笔消费：银行记录变为镜像，统计不重复', async () => {
    const wechatCsv = [
      '交易时间,交易对方,收/支,金额(元),交易单号,当前状态',
      '2026-10-01 12:35:00,美团外卖,支出,23.50,WX-MIRROR-1,支付成功',
    ].join('\n');
    const summary = await importWechatFile(db, 'wechat-mirror.csv', wechatCsv);
    expect(summary.inserted).toBe(1);

    const rows = await listTransactions(db);
    const bankMeituan = rows.filter((r) => r.source === 'bank' && r.counterparty === '美团外卖');
    expect(bankMeituan).toHaveLength(1);
    expect(bankMeituan[0].isMirror).toBe(true);

    const wechatMeituan = rows.filter((r) => r.source === 'wechat' && r.counterparty === '美团外卖');
    expect(wechatMeituan).toHaveLength(1);
    expect(wechatMeituan[0].isMirror).toBe(false);

    const stats = computeMonthlyStats(rows, '2026-10');
    // 银行支出：2350 + 1200 + 15640 + 500 = 19690（美团那笔被镜像排除，改由微信 2350 计数）
    expect(stats.expenseCents).toBe(19690);
    expect(stats.incomeCents).toBe(8888);
  });

  it('重复导入同一银行文件：直接跳过', async () => {
    const summary = await importBankFile(db, 'bank-sample.csv', bankBytes);
    expect(summary.duplicateFile).toBe(true);
    expect(await countTransactions(db)).toBe(6);
  });
});
