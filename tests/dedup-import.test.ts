import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { createSqlJsDatabase } from '../src/data/db/sqljs';
import type { AppDatabase } from '../src/data/db/database';
import { migrate } from '../src/data/db/schema';
import {
  clearData,
  countTransactions,
  findDedupCandidates,
  insertTransaction,
  listTransactions,
} from '../src/data/repository';
import { buildDedupKey, matchExisting } from '../src/domain/dedup';
import { importWechatFile } from '../src/domain/import';
import type { NewTransaction } from '../src/domain/types';

const wasmDir = path.resolve(process.cwd(), 'node_modules/sql.js/dist');

const bankTx = (over: Partial<NewTransaction> = {}): NewTransaction => ({
  source: 'bank',
  sourceTradeNo: null,
  tradeTime: '2026-10-01 12:40:00',
  counterparty: '美团外卖',
  description: '消费',
  direction: 'expense',
  amountCents: 2350,
  payMethod: '招商银行储蓄卡',
  status: '成功',
  category: null,
  subcategory: null,
  dedupKey: null,
  rawHash: 'bank-hash-1',
  note: '',
  ...over,
});

describe('跨平台去重（集成）', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = await createSqlJsDatabase({ locateFile: (file) => path.join(wasmDir, file) });
    await migrate(db);
  });

  it('已有微信记录时，银行同金额记录判定为镜像', async () => {
    const csv = [
      '交易时间,交易对方,收/支,金额(元),交易单号,当前状态',
      '2026-10-01 12:30:00,美团外卖,支出,23.50,WX100,支付成功',
    ].join('\n');
    await importWechatFile(db, 'wechat-dedup.csv', csv);
    expect(await countTransactions(db)).toBe(1);

    const candidates = await findDedupCandidates(db, 'expense', 2350, '2026-10-01 12:40:00');
    expect(candidates).toHaveLength(1);
    expect(matchExisting(bankTx(), candidates[0])).toBe('newMirror');

    await insertTransaction(db, { ...bankTx(), isMirror: true, dedupKey: buildDedupKey(bankTx()) });
    expect(await countTransactions(db)).toBe(2);

    const all = await listTransactions(db);
    expect(all.filter((t) => t.isMirror)).toHaveLength(1);
    const counted = await listTransactions(db, { excludeMirror: true });
    expect(counted).toHaveLength(1);
    expect(counted[0].source).toBe('wechat');
  });

  it('已有银行记录时，导入同金额微信记录会把银行记录标记为镜像', async () => {
    await insertTransaction(
      db,
      bankTx({
        tradeTime: '2026-10-05 18:00:00',
        counterparty: '滴滴出行',
        amountCents: 1200,
        rawHash: 'bank-hash-2',
      })
    );

    const csv = [
      '交易时间,交易对方,收/支,金额(元),交易单号,当前状态',
      '2026-10-05 18:05:00,滴滴出行,支出,12.00,WX200,支付成功',
    ].join('\n');
    const summary = await importWechatFile(db, 'wechat-dedup-2.csv', csv);
    expect(summary.inserted).toBe(1);

    const counted = await listTransactions(db, { excludeMirror: true });
    const didi = counted.filter((r) => r.counterparty === '滴滴出行');
    expect(didi).toHaveLength(1);
    expect(didi[0].source).toBe('wechat');

    const mirrorBank = (await listTransactions(db)).filter(
      (r) => r.source === 'bank' && r.counterparty === '滴滴出行'
    );
    expect(mirrorBank).toHaveLength(1);
    expect(mirrorBank[0].isMirror).toBe(true);
  });

  it('同金额不同商户或超过一天不误判', async () => {
    await insertTransaction(
      db,
      bankTx({
        counterparty: '星巴克',
        tradeTime: '2026-10-06 09:00:00',
        amountCents: 4200,
        rawHash: 'bank-hash-3',
      })
    );

    const candidates = await findDedupCandidates(db, 'expense', 4200, '2026-10-06 10:00:00');
    expect(candidates).toHaveLength(1);
    const wechatCoffee: NewTransaction = {
      ...bankTx({ counterparty: '瑞幸咖啡', amountCents: 4200 }),
      source: 'wechat',
      rawHash: 'wx-hash-3',
    };
    expect(matchExisting(wechatCoffee, candidates[0])).toBe('none');

    const far = await findDedupCandidates(db, 'expense', 4200, '2026-10-08 09:00:00');
    expect(far).toHaveLength(0);
  });

  it('清空数据', async () => {
    await clearData(db);
    expect(await countTransactions(db)).toBe(0);
  });
});
