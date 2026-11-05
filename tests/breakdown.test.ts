import { describe, it, expect } from 'vitest';
import { breakdownKey, matchesBreakdown } from '../src/domain/breakdown';
import type { TransactionRow } from '../src/domain/types';

const row = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  id: 1,
  source: 'wechat',
  sourceTradeNo: null,
  tradeTime: '2026-10-01 10:00:00',
  counterparty: '盒马鲜生',
  description: '水果,蔬菜',
  direction: 'expense',
  amountCents: 15640,
  payMethod: '',
  status: '',
  category: '购物',
  subcategory: '生鲜',
  dedupKey: null,
  rawHash: 'h',
  note: '',
  isMirror: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('分类细分筛选', () => {
  it('按分类/子分类与渠道匹配', () => {
    expect(breakdownKey({ category: '购物', subcategory: '生鲜' })).toBe('购物|生鲜');
    expect(breakdownKey({ category: '餐饮', subcategory: null })).toBe('餐饮|');
    expect(matchesBreakdown(row(), { source: 'wechat', category: '购物', subcategory: '生鲜' })).toBe(true);
    expect(matchesBreakdown(row({ subcategory: '日用' }), { source: 'wechat', category: '购物', subcategory: '生鲜' })).toBe(false);
    expect(matchesBreakdown(row({ source: 'alipay' }), { source: 'wechat', category: '购物', subcategory: '生鲜' })).toBe(false);
  });

  it('未分类用原始用途匹配', () => {
    const uncategorized = row({ category: null, counterparty: '年终商户', description: '年货' });
    expect(matchesBreakdown(uncategorized, { source: 'wechat', category: '年货', subcategory: null })).toBe(true);
    expect(matchesBreakdown(uncategorized, { source: 'wechat', category: '其他', subcategory: null })).toBe(false);
  });
});
