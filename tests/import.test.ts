import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import { countTransactions, listImportBatches, listTransactions } from '../src/data/repository';
import { importWechatFile } from '../src/domain/import';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/wechat-sample.csv', import.meta.url)),
  'utf8'
);

describe('微信导入流程', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
  });

  it('首次导入：6 条入库（含退款支出行），1 条状态跳过，写导入批次', async () => {
    const summary = await importWechatFile(db, 'wechat-sample.csv', fixture);
    expect(summary.duplicateFile).toBe(false);
    expect(summary.totalRows).toBe(7);
    expect(summary.inserted).toBe(6);
    expect(summary.skipped).toBe(1);
    expect(summary.errors.some((e) => e.includes('交易关闭'))).toBe(true);
        expect(summary.batchId).not.toBeNull();

    expect(await countTransactions(db)).toBe(6);
    const batches = await listImportBatches(db);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      source: 'wechat',
      fileName: 'wechat-sample.csv',
      totalRows: 7,
      insertedRows: 6,
      skippedRows: 1,
    });
    expect(batches[0].errorMessage).toContain('交易关闭');
  });

  it('重复导入同一文件：直接跳过，不产生重复批次', async () => {
    const summary = await importWechatFile(db, 'wechat-sample.csv', fixture);
    expect(summary.duplicateFile).toBe(true);
    expect(summary.inserted).toBe(0);
    expect(await countTransactions(db)).toBe(6);
    expect(await listImportBatches(db)).toHaveLength(1);
  });

  it('文件内容变化但交易重复：按订单号去重，只插入新交易', async () => {
    const changed =
      fixture +
      '\n2026-10-08 09:30:00,商户消费,瑞幸咖啡,拿铁,支出,¥18.00,零钱,支付成功,WX202610080008,MW008,';
    const summary = await importWechatFile(db, 'wechat-sample-2.csv', changed);
    expect(summary.duplicateFile).toBe(false);
    expect(summary.totalRows).toBe(8);
    expect(summary.inserted).toBe(1);
    expect(summary.skipped).toBe(7); // 6 条重复 + 1 条状态跳过
    expect(summary.errors.some((e) => e.includes('跳过重复交易'))).toBe(true);
    expect(await countTransactions(db)).toBe(7);
  });

  it('交易按时间倒序查询', async () => {
    const rows = await listTransactions(db);
    expect(rows[0].counterparty).toBe('瑞幸咖啡');
    expect(rows[0].amountCents).toBe(1800);
    expect(rows[rows.length - 1].tradeTime).toBe('2026-10-01 12:30:00');
  });
});
