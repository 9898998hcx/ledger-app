import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { countTransactions } from '../src/data/repository';
import { importBankRows } from '../src/domain/import';
import { parseBankRows } from '../src/domain/parsers/bank';
import { xlsBytesToSheetRows } from '../src/domain/parsers/xls-rows';
import { channelOf } from '../src/domain/channel';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const bytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/bank-ccb.xls', import.meta.url)))
);

describe('建设银行 .xls（紧凑日期 YYYYMMDD）', () => {
  it('解析 4 行并识别微信/支付宝去向', () => {
    const rows = xlsBytesToSheetRows(bytes, 'bank');
    const result = parseBankRows(rows);
    expect(result.totalRows).toBe(4);
    expect(result.records).toHaveLength(4);
    expect(result.issues).toHaveLength(0);

    expect(result.records[0]).toMatchObject({
      tradeTime: '2026-10-01 00:00:00',
      direction: 'expense',
      amountCents: 2350,
    });
    expect(result.records[1]).toMatchObject({
      tradeTime: '2026-10-02 00:00:00',
      direction: 'income',
      amountCents: 1800,
    });
    expect(result.records[1].counterparty).toContain('微信红包');
    expect(channelOf(result.records[1])).toBe('wechat');

    expect(result.records[2].counterparty).toContain('支付宝');
    expect(channelOf(result.records[2])).toBe('alipay');

    expect(channelOf(result.records[0])).toBe('bank');
  });

  it('可导入银行 .xls', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    const rows = xlsBytesToSheetRows(bytes, 'bank');
    const summary = await importBankRows(db, 'bank-ccb.xls', rows);
    expect(summary.source).toBe('bank');
    expect(summary.inserted).toBe(4);
    expect(await countTransactions(db)).toBe(4);
  });
});
