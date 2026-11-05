import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import {
  clearData,
  countTransactions,
  hasFileHash,
  insertCategoryRule,
  insertImportBatch,
  insertTransaction,
  listCategoryRules,
  listImportBatches,
  listMerchantRules,
  listTransactions,
  setTransactionCategory,
  transactionExists,
  upsertMerchantRule,
} from '../src/data/repository';
import type { NewTransaction } from '../src/domain/types';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

const sample = (over: Partial<NewTransaction> = {}): NewTransaction => ({
  source: 'wechat',
  sourceTradeNo: 'WX001',
  tradeTime: '2026-10-01 12:30:00',
  counterparty: '美团外卖',
  description: '午餐',
  direction: 'expense',
  amountCents: 2350,
  payMethod: '零钱',
  status: '支付成功',
  category: null,
  subcategory: null,
  dedupKey: null,
  rawHash: 'hash-wx-001',
  note: '',
  ...over,
});

describe('数据层（sql.js 内存 SQLite）', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
  });

  it('建表成功且初始为空', async () => {
    expect(await countTransactions(db)).toBe(0);
  });

  it('插入交易并按时间倒序查询', async () => {
    await insertTransaction(db, sample());
    await insertTransaction(
      db,
      sample({
        sourceTradeNo: 'WX002',
        tradeTime: '2026-10-02 08:00:00',
        rawHash: 'hash-wx-002',
        amountCents: 1200,
      })
    );
    const rows = await listTransactions(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].sourceTradeNo).toBe('WX002');
    expect(rows[0].amountCents).toBe(1200);
    expect(rows[1].amountCents).toBe(2350);
  });

  it('按订单号或 raw_hash 判断重复', async () => {
    expect(await transactionExists(db, 'wechat', 'WX001', 'whatever')).toBe(true);
    expect(await transactionExists(db, 'wechat', null, 'hash-wx-002')).toBe(true);
    expect(await transactionExists(db, 'wechat', 'NOPE', 'nope')).toBe(false);
  });

  it('未分类筛选与手动修改分类', async () => {
    const before = await listTransactions(db, { uncategorizedOnly: true });
    expect(before).toHaveLength(2);
    await setTransactionCategory(db, before[0].id, '餐饮', '午餐');
    const after = await listTransactions(db, { uncategorizedOnly: true });
    expect(after).toHaveLength(1);
    const byCategory = await listTransactions(db, { category: '餐饮' });
    expect(byCategory).toHaveLength(1);
  });

  it('商户记忆 upsert 累加 hit_count', async () => {
    await upsertMerchantRule(db, '美团外卖', '餐饮', '外卖');
    await upsertMerchantRule(db, '美团外卖', '餐饮', '外卖');
    const rules = await listMerchantRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0].hitCount).toBe(2);
    expect(rules[0].category).toBe('餐饮');
  });

  it('分类规则与导入批次', async () => {
    await insertCategoryRule(db, {
      priority: 10,
      matchType: 'keyword',
      pattern: '美团',
      category: '餐饮',
      subcategory: '外卖',
      enabled: true,
    });
    expect(await listCategoryRules(db)).toHaveLength(1);

    await insertImportBatch(db, {
      source: 'wechat',
      fileName: 'wechat-sample.csv',
      fileHash: 'hash-file-001',
      importedAt: new Date().toISOString(),
      totalRows: 3,
      insertedRows: 2,
      skippedRows: 1,
      errorMessage: null,
    });
    expect(await listImportBatches(db)).toHaveLength(1);
    expect(await hasFileHash(db, 'wechat', 'hash-file-001')).toBe(true);
    expect(await hasFileHash(db, 'alipay', 'hash-file-001')).toBe(false);
  });

  it('清空交易与导入记录（默认保留规则）', async () => {
    await clearData(db);
    expect(await countTransactions(db)).toBe(0);
    expect(await listImportBatches(db)).toHaveLength(0);
    expect(await listCategoryRules(db)).toHaveLength(1);
    expect(await listMerchantRules(db)).toHaveLength(1);
  });
});
