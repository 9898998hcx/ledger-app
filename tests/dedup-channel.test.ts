import { describe, it, expect } from 'vitest';
import { matchExisting } from '../src/domain/dedup';
import type { DedupInput } from '../src/domain/dedup';

const bankWechat: DedupInput = {
  source: 'bank',
  tradeTime: '2026-10-02 10:00:00',
  direction: 'income',
  amountCents: 1800,
  counterparty: '1000039801/微信红包',
  description: '消费退货 退款 1000039801/微信红包',
  status: '',
};

const wechatRow: DedupInput = {
  source: 'wechat',
  tradeTime: '2026-10-02 10:00:00',
  direction: 'income',
  amountCents: 1800,
  counterparty: '张三',
  description: '微信红包',
  status: '已存入零钱',
};

const bankGeneric: DedupInput = {
  source: 'bank',
  tradeTime: '2026-10-02 10:00:00',
  direction: 'income',
  amountCents: 1800,
  counterparty: '测试商户',
  description: '消费',
  status: '',
};

describe('银行流水按钱款去向去重', () => {
  it('银行流水归微信后，与微信账单同额同日只算一笔', () => {
    expect(matchExisting(wechatRow, { ...bankWechat, isMirror: false })).toBe('newPrimary');
    expect(matchExisting(bankWechat, { ...wechatRow, isMirror: false })).toBe('newMirror');
  });

  it('普通银行消费不按渠道强匹配', () => {
    expect(matchExisting(wechatRow, { ...bankGeneric, isMirror: false })).toBe('none');
  });
});
