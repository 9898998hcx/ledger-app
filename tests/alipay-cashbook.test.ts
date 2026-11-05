import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { countTransactions } from '../src/data/repository';
import { importAlipayFile } from '../src/domain/import';
import { parseAlipayCsv } from '../src/domain/parsers/alipay';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const text = readFileSync(
  fileURLToPath(new URL('./fixtures/alipay-cashbook.csv', import.meta.url)),
  'utf8'
);

describe('支付宝记账本 CSV（记录时间/分类/收支类型/金额/备注）', () => {
  it('识别表头并解析：退款归收入、投资理财保持不计收支', () => {
    const result = parseAlipayCsv(text);
    expect(result.totalRows).toBe(5);
    expect(result.records).toHaveLength(5);
    expect(result.issues).toHaveLength(0);

    const expense = result.records[0];
    expect(expense).toMatchObject({
      direction: 'expense',
      amountCents: 2350,
      tradeTime: '2026-10-01 12:30:00',
    });
    expect(expense.counterparty).toContain('老乡鸡');

    const refund = result.records[3];
    expect(refund).toMatchObject({
      direction: 'income',
      category: '退款',
      amountCents: 1840,
      status: '退款',
    });

    const neutral = result.records[4];
    expect(neutral.direction).toBe('neutral');
    expect(neutral.amountCents).toBe(109892);
  });

  it('可导入记账本 CSV', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    const summary = await importAlipayFile(db, 'alipay-cashbook.csv', new TextEncoder().encode(text));
    expect(summary.source).toBe('alipay');
    expect(summary.inserted).toBe(5);
    expect(await countTransactions(db)).toBe(5);
  });
});
