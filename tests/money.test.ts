import { describe, it, expect } from 'vitest';
import { formatCents, parseAmountToCents } from '../src/domain/money';

describe('金额（整数分）', () => {
  it('元转分', () => {
    expect(parseAmountToCents('23.50')).toBe(2350);
    expect(parseAmountToCents('¥1,234.56')).toBe(123456);
    expect(parseAmountToCents('23.5')).toBe(2350);
    expect(parseAmountToCents('23')).toBe(2300);
    expect(parseAmountToCents('0.00')).toBe(0);
    expect(parseAmountToCents('￥ 12.30')).toBe(1230);
  });

  it('非法金额返回 null', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-1.00')).toBeNull();
    expect(parseAmountToCents('12.345')).toBeNull();
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
  });

  it('分转展示字符串', () => {
    expect(formatCents(123456)).toBe('1,234.56');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
  });
});
