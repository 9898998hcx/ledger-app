import { describe, it, expect } from 'vitest';
import { classify } from '../src/domain/classify';
import type { CategoryRule, MerchantRule } from '../src/domain/types';

const rule = (over: Partial<CategoryRule>): CategoryRule => ({
  id: 1,
  priority: 100,
  matchType: 'keyword',
  pattern: '',
  category: '其他',
  subcategory: null,
  enabled: true,
  ...over,
});

const input = (over: Partial<Parameters<typeof classify>[0]> = {}) => ({
  counterparty: '美团外卖',
  description: '午餐',
  direction: 'expense' as const,
  amountCents: 2350,
  ...over,
});

describe('分类引擎', () => {
  it('keyword 命中', () => {
    const result = classify(input(), [rule({ pattern: '美团', category: '餐饮', subcategory: '外卖' })], []);
    expect(result).toEqual({ category: '餐饮', subcategory: '外卖', matchedBy: 'rule' });
  });

  it('按 priority 升序，命中即停', () => {
    const rules = [
      rule({ id: 2, priority: 40, pattern: '超市', category: '购物' }),
      rule({ id: 1, priority: 10, pattern: '美团', category: '餐饮' }),
    ];
    expect(classify(input({ counterparty: '美团', description: '超市' }), rules, []).category).toBe('餐饮');
  });

  it('regex 匹配', () => {
    const result = classify(input({ counterparty: '滴滴出行', description: '快车' }), [
      rule({ matchType: 'regex', pattern: '滴滴|高德', category: '交通' }),
    ], []);
    expect(result.category).toBe('交通');
  });

  it('禁用规则跳过', () => {
    const rules = [
      rule({ id: 1, priority: 10, pattern: '美团', enabled: false }),
      rule({ id: 2, priority: 20, pattern: '美团', category: '餐饮' }),
    ];
    expect(classify(input(), rules, []).category).toBe('餐饮');
  });

  it('非法正则不崩溃并继续下一条', () => {
    const rules = [
      rule({ id: 1, priority: 10, matchType: 'regex', pattern: '(' }),
      rule({ id: 2, priority: 20, pattern: '美团', category: '餐饮' }),
    ];
    expect(classify(input(), rules, []).category).toBe('餐饮');
  });

  it('商户记忆兜底', () => {
    const merchants: MerchantRule[] = [
      {
        id: 1,
        merchantKey: '美团外卖',
        category: '餐饮',
        subcategory: '外卖',
        hitCount: 1,
        createdAt: '',
        updatedAt: '',
      },
    ];
    expect(classify(input(), [], merchants)).toEqual({
      category: '餐饮',
      subcategory: '外卖',
      matchedBy: 'merchant',
    });
  });

  it('未命中返回 null（进入待分类）', () => {
    expect(classify(input({ counterparty: '未知商户', description: '消费' }), [], [])).toEqual({
      category: null,
      subcategory: null,
      matchedBy: 'none',
    });
  });
});
