import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { exportTransactionsCsv, insertTransaction } from '../src/data/repository';
import type { NewTransaction } from '../src/domain/types';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

const sample = (over: Partial<NewTransaction> = {}): NewTransaction => ({
  source: 'wechat',
  sourceTradeNo: 'WX-EXPORT-1',
  tradeTime: '2026-10-01 12:30:00',
  counterparty: '盒马鲜生',
  description: '水果,蔬菜',
  direction: 'expense',
  amountCents: 15640,
  payMethod: '零钱',
  status: '支付成功',
  category: '购物',
  subcategory: '生鲜',
  dedupKey: null,
  rawHash: 'hash-export-1',
  note: '',
  ...over,
});

describe('导出 CSV', () => {
  it('包含表头、正确转义逗号，并标记镜像', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);

    await insertTransaction(db, sample());
    await insertTransaction(
      db,
      sample({ sourceTradeNo: 'BANK-EXPORT-1', rawHash: 'hash-export-2', source: 'bank', isMirror: true, counterparty: '盒马鲜生' })
    );

    const csv = await exportTransactionsCsv(db);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('交易时间');
    expect(lines[0]).toContain('分类');
    expect(csv).toContain('"水果,蔬菜"');
    expect(csv).toContain('购物');
    expect(csv).toContain('156.40');
    expect(csv).toContain('是');
    expect(lines).toHaveLength(3);
  });
});
