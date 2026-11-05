import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readXlsxFile from 'read-excel-file/node';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import { countTransactions } from '../src/data/repository';
import { importAlipayRows, importBankRows } from '../src/domain/import';
import { parseAlipayRows } from '../src/domain/parsers/alipay';
import { parseBankRows } from '../src/domain/parsers/bank';
import { pickSheetRows, xlsxSheetToRows, type SheetSource } from '../src/domain/parsers/xlsx-rows';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const alipayPath = fileURLToPath(new URL('./fixtures/alipay-sample.xlsx', import.meta.url));
const bankPath = fileURLToPath(new URL('./fixtures/bank-sample.xlsx', import.meta.url));

async function rowsOf(file: string, source: SheetSource): Promise<string[][]> {
  const sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: unknown[][] }[];
  const dateMode = source === 'wechat' ? 'local' : 'utc';
  return pickSheetRows(
    sheets.map((sheet) => ({
      name: sheet.sheet,
      rows: xlsxSheetToRows(sheet.data, dateMode),
    })),
    source
  );
}

describe('支付宝 Excel', () => {
  it('解析 6 行：5 条有效 + 1 条状态跳过', async () => {
    const rows = await rowsOf(alipayPath, 'alipay');
    const result = parseAlipayRows(rows);
    expect(result.totalRows).toBe(6);
    expect(result.records).toHaveLength(5);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
    expect(result.records[0]).toMatchObject({
      source: 'alipay',
      counterparty: '肯德基',
      description: '午餐',
      direction: 'expense',
      amountCents: 2350,
      tradeTime: '2026-10-01 12:30:00',
    });
    expect(result.records[2]).toMatchObject({ direction: 'income', amountCents: 8888 });
  });
});

describe('银行 Excel', () => {
  it('解析收入/支出分列的 3 行', async () => {
    const rows = await rowsOf(bankPath, 'bank');
    const result = parseBankRows(rows);
    expect(result.records).toHaveLength(3);
    expect(result.records[0]).toMatchObject({ direction: 'expense', amountCents: 4200, counterparty: '星巴克' });
    expect(result.records[1]).toMatchObject({ direction: 'income', amountCents: 500000, counterparty: '某公司' });
    expect(result.records[2]).toMatchObject({ direction: 'expense', amountCents: 2350, counterparty: '美团外卖' });
  });
});

describe('支付宝 / 银行 Excel 导入', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
  });

  it('导入支付宝 Excel（5 条）与银行 Excel（3 条）', async () => {
    const alipayRows = await rowsOf(alipayPath, 'alipay');
    const summary1 = await importAlipayRows(db, 'alipay-sample.xlsx', alipayRows);
    expect(summary1.source).toBe('alipay');
    expect(summary1.inserted).toBe(5);

    const bankRows = await rowsOf(bankPath, 'bank');
    const summary2 = await importBankRows(db, 'bank-sample.xlsx', bankRows);
    expect(summary2.source).toBe('bank');
    expect(summary2.inserted).toBe(3);

    expect(await countTransactions(db)).toBe(8);
  });

  it('重复导入同一 Excel 文件会被文件哈希拦截', async () => {
    const alipayRows = await rowsOf(alipayPath, 'alipay');
    const summary = await importAlipayRows(db, 'alipay-sample.xlsx', alipayRows);
    expect(summary.duplicateFile).toBe(true);
    expect(await countTransactions(db)).toBe(8);
  });
});
