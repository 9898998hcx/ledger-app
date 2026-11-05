import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { countTransactions } from '../src/data/repository';
import { importAlipayRows } from '../src/domain/import';
import { parseAlipayRows } from '../src/domain/parsers/alipay';
import { xlsBytesToSheetRows } from '../src/domain/parsers/xls-rows';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const bytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/alipay-sample.xls', import.meta.url)))
);

describe('支付宝旧版 .xls 导入', () => {
  it('读取 BIFF .xls 并解析：6 行 → 5 条有效 + 1 条状态跳过', () => {
    const rows = xlsBytesToSheetRows(bytes, 'alipay');
    expect(rows.length).toBeGreaterThan(0);
    const result = parseAlipayRows(rows);
    expect(result.totalRows).toBe(6);
    expect(result.records).toHaveLength(5);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
    expect(result.records[0]).toMatchObject({
      counterparty: '肯德基',
      direction: 'expense',
      amountCents: 2350,
      tradeTime: '2026-10-01 12:30:00',
    });
  });

  it('导入 .xls 数据', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    const summary = await importAlipayRows(db, 'alipay-sample.xls', xlsBytesToSheetRows(bytes, 'alipay'));
    expect(summary.source).toBe('alipay');
    expect(summary.inserted).toBe(5);
    expect(await countTransactions(db)).toBe(5);
  });
});
