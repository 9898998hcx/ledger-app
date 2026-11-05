import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { countTransactions, listImportBatches } from '../src/data/repository';
import { importAlipayText } from '../src/domain/import';
import { parseAlipayText } from '../src/domain/parsers/alipay';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const text = readFileSync(
  fileURLToPath(new URL('./fixtures/alipay-text.txt', import.meta.url)),
  'utf8'
);

describe('支付宝 PDF 文本解析', () => {
  it('解析 6 行：5 条有效 + 1 条状态跳过', () => {
    const result = parseAlipayText(text);
    expect(result.totalRows).toBe(6);
    expect(result.records).toHaveLength(5);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
    expect(result.records[0]).toMatchObject({
      source: 'alipay',
      amountCents: 2350,
      direction: 'expense',
      tradeTime: '2026-10-01 12:30:00',
    });
    expect(result.records[0].counterparty).toContain('肯德基');
    expect(result.records[0].sourceTradeNo).toBe('2026100122001234567890');
    expect(result.records[2]).toMatchObject({ direction: 'income', amountCents: 8888 });
  });

  it('支付宝 PDF 文本可导入（5 条）', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
    const summary = await importAlipayText(db, 'alipay-sample.pdf', text);
    expect(summary.source).toBe('alipay');
    expect(summary.inserted).toBe(5);
    expect(await countTransactions(db)).toBe(5);
    expect(await listImportBatches(db)).toHaveLength(1);
  });
});
