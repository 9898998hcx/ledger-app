import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import { migrate } from '../src/data/db/schema';
import { insertTransaction, listMerchantRules } from '../src/data/repository';
import { applyManualCategory, merchantKeyOf } from '../src/app/category-actions';
import { classify } from '../src/domain/classify';
import type { NewTransaction } from '../src/domain/types';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

const sample: NewTransaction = {
  source: 'wechat',
  sourceTradeNo: 'WX-CLASSIFY-1',
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
  rawHash: 'hash-classify-1',
  note: '',
};

describe('手动分类沉淀商户记忆', () => {
  it('修改分类后写入商户记忆，并可被分类引擎复用', async () => {
    const db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);

    const id = await insertTransaction(db, sample);
    const updated = await applyManualCategory(db, id, '餐饮', '外卖');
    expect(updated?.category).toBe('餐饮');

    const rules = await listMerchantRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      merchantKey: '美团外卖',
      category: '餐饮',
      subcategory: '外卖',
      hitCount: 1,
    });

    await applyManualCategory(db, id, '餐饮', '外卖');
    const rules2 = await listMerchantRules(db);
    expect(rules2[0].hitCount).toBe(2);

    const result = classify(
      { counterparty: '美团外卖', description: '晚餐', direction: 'expense', amountCents: 1000 },
      [],
      rules2
    );
    expect(result).toEqual({ category: '餐饮', subcategory: '外卖', matchedBy: 'merchant' });
  });

  it('商户 key 规范化', () => {
    expect(merchantKeyOf({ counterparty: '美团 外卖（北京）', description: '' })).toBe('美团外卖北京');
    expect(merchantKeyOf({ counterparty: '', description: '午餐' })).toBe('午餐');
  });
});
