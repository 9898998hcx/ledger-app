import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import { countTransactions, listImportBatches } from '../src/data/repository';
import { importAlipayFile } from '../src/domain/import';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');
const gbkBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/alipay-sample.gbk.csv', import.meta.url)))
);
const utf8Bytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/alipay-sample.csv', import.meta.url)))
);

describe('支付宝导入流程', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
  });

  it('导入 GBK 文件：6 条入库（含退款支出行），1 条状态跳过', async () => {
    const summary = await importAlipayFile(db, 'alipay-sample.gbk.csv', gbkBytes);
    expect(summary.source).toBe('alipay');
    expect(summary.duplicateFile).toBe(false);
    expect(summary.totalRows).toBe(7);
    expect(summary.inserted).toBe(6);
    expect(summary.skipped).toBe(1);
    expect(summary.errors.some((e) => e.includes('交易关闭'))).toBe(true);
    expect(await countTransactions(db)).toBe(6);

    const batches = await listImportBatches(db);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ source: 'alipay', totalRows: 7, insertedRows: 6, skippedRows: 1 });
  });

  it('同一内容的 UTF-8 版本视为重复文件（编码不同但内容一致）', async () => {
    const summary = await importAlipayFile(db, 'alipay-sample.csv', utf8Bytes);
    expect(summary.duplicateFile).toBe(true);
    expect(summary.inserted).toBe(0);
    expect(await countTransactions(db)).toBe(6);
    expect(await listImportBatches(db)).toHaveLength(1);
  });
});
