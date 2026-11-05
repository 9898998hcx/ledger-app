import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import {
  countTransactions,
  insertImportBatch,
  listImportBatches,
} from '../src/data/repository';
import { importWechatFile } from '../src/domain/import';
import { hashString } from '../src/domain/hash';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

function normalizeContent(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
}

const csv = [
  '交易时间,交易对方,收/支,金额(元),交易单号,当前状态',
  '2026-10-01 12:30:00,美团外卖,支出,23.50,WX-RETRY-1,支付成功',
].join('\n');

describe('失败导入批次允许重试', () => {
  it('旧的 0 行批次不阻止重新导入，且会被成功批次替换', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);

    // 模拟旧版本导入失败留下的 0 行批次（文件哈希相同）
    await insertImportBatch(db, {
      source: 'wechat',
      fileName: 'retry.csv',
      fileHash: hashString(normalizeContent(csv)),
      importedAt: new Date().toISOString(),
      totalRows: 0,
      insertedRows: 0,
      skippedRows: 0,
      errorMessage: '旧版解析失败：未找到表头',
    });
    expect(await listImportBatches(db)).toHaveLength(1);

    const summary = await importWechatFile(db, 'retry.csv', csv);
    expect(summary.duplicateFile).toBe(false);
    expect(summary.inserted).toBe(1);
    expect(await countTransactions(db)).toBe(1);

    const batches = await listImportBatches(db);
    expect(batches).toHaveLength(1);
    expect(batches[0].insertedRows).toBe(1);

    // 成功导入后，再导入同一文件才判定为重复
    const again = await importWechatFile(db, 'retry.csv', csv);
    expect(again.duplicateFile).toBe(true);
    expect(await countTransactions(db)).toBe(1);
  });
});
