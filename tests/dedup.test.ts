import { describe, it, expect } from 'vitest';
import {
  buildDedupKey,
  isSelfTransfer,
  isSimilarMerchant,
  isWithinOneDay,
  matchExisting,
} from '../src/domain/dedup';
import { merchantSimilarity, normalizeMerchantName } from '../src/domain/merchant';
import type { DedupInput } from '../src/domain/dedup';

const tx = (over: Partial<DedupInput> = {}): DedupInput => ({
  source: 'wechat',
  tradeTime: '2026-10-01 12:30:00',
  direction: 'expense',
  amountCents: 2350,
  counterparty: '美团外卖',
  ...over,
});

describe('商户名规范化与相似度', () => {
  it('规范化：去空格、标点、小写', () => {
    expect(normalizeMerchantName(' 美团 外卖(北京) ')).toBe('美团外卖北京');
  });

  it('相似度阈值判断', () => {
    expect(merchantSimilarity('美团外卖', '美团外卖')).toBe(1);
    expect(merchantSimilarity('美团外卖', '美团外卖有限公司')).toBeGreaterThanOrEqual(0.6);
    expect(isSimilarMerchant('美团外卖', '饿了么')).toBe(false);
    expect(merchantSimilarity('', '美团')).toBe(0);
  });
});

describe('时间去重窗口', () => {
  it('±1 天内算重复，超过 1 天不算', () => {
    expect(isWithinOneDay('2026-10-01 12:30:00', '2026-10-02 12:00:00')).toBe(true);
    expect(isWithinOneDay('2026-10-01 12:30:00', '2026-10-03 12:00:00')).toBe(false);
  });
});

describe('dedup_key 生成', () => {
  it('dedup_key 稳定且包含规范化商户名', () => {
    const a = buildDedupKey(tx());
    expect(a).toBe('d|expense|2350|2026-10-01|美团外卖');
    const b = buildDedupKey(tx({ counterparty: '美团外卖（北京）' }));
    expect(b).toBe('d|expense|2350|2026-10-01|美团外卖北京');
    expect(a).toContain('d|expense|2350|2026-10-01');
  });

  it('不同金额/方向/日期生成不同 key', () => {
    expect(buildDedupKey(tx())).not.toBe(buildDedupKey(tx({ amountCents: 2351 })));
    expect(buildDedupKey(tx())).not.toBe(buildDedupKey(tx({ direction: 'income' })));
    expect(buildDedupKey(tx())).not.toBe(buildDedupKey(tx({ tradeTime: '2026-10-02 12:30:00' })));
  });
});

describe('跨平台去重判定 matchExisting', () => {
  it('同源同金额不再按金额去重（避免误杀同日同额的不同订单）', () => {
    expect(matchExisting(tx(), { ...tx({ source: 'wechat' }), isMirror: false })).toBe('none');
  });

  it('已有银行记录，新支付平台记录 → newPrimary（旧记录标记镜像）', () => {
    const bank = { ...tx({ source: 'bank' as const }), isMirror: false };
    expect(matchExisting(tx(), bank)).toBe('newPrimary');
  });

  it('已有支付平台记录，新银行记录 → newMirror', () => {
    const bankNew = tx({ source: 'bank' as const });
    expect(matchExisting(bankNew, { ...tx(), isMirror: false })).toBe('newMirror');
  });

  it('同金额不同商户 → none', () => {
    expect(matchExisting(tx({ counterparty: '饿了么' }), { ...tx(), isMirror: false })).toBe('none');
  });

  it('同金额超过 1 天 → none', () => {
    expect(
      matchExisting(tx({ tradeTime: '2026-10-03 12:30:00' }), { ...tx(), isMirror: false })
    ).toBe('none');
  });

  it('已有记录本身是镜像 → none', () => {
    expect(matchExisting(tx(), { ...tx({ source: 'bank' as const }), isMirror: true })).toBe('none');
  });
});

describe('自己名下账户互转', () => {
  it('命中关键词返回 true', () => {
    expect(isSelfTransfer('张三', '转账到储蓄卡', ['储蓄卡'])).toBe(true);
    expect(isSelfTransfer('张三', '转账到储蓄卡', [])).toBe(false);
    expect(isSelfTransfer('商户', '日常消费', ['商户'])).toBe(true);
  });
});
