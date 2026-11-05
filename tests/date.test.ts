import { describe, it, expect } from 'vitest';
import { monthOf, normalizeDateTime } from '../src/domain/date';

describe('日期规范化', () => {
  it('标准格式原样返回', () => {
    expect(normalizeDateTime('2026-10-01 12:30:00')).toBe('2026-10-01 12:30:00');
  });

  it('支持斜杠/短时间/单数字', () => {
    expect(normalizeDateTime('2026/10/01 12:30')).toBe('2026-10-01 12:30:00');
    expect(normalizeDateTime('2026-1-2 3:04:05')).toBe('2026-01-02 03:04:05');
  });

  it('非法日期返回 null', () => {
    expect(normalizeDateTime('2026-13-01 00:00:00')).toBeNull();
    expect(normalizeDateTime('2026-02-30 10:00:00')).toBeNull();
    expect(normalizeDateTime('abc')).toBeNull();
    expect(normalizeDateTime(null)).toBeNull();
  });

  it('支持紧凑日期（银行导出常见 YYYYMMDD）', () => {
    expect(normalizeDateTime('20261001')).toBe('2026-10-01 00:00:00');
    expect(normalizeDateTime('20261001123045')).toBe('2026-10-01 12:30:45');
    expect(normalizeDateTime('20261001 00:00:00')).toBe('2026-10-01 00:00:00');
    expect(normalizeDateTime('20261301')).toBeNull();
  });

  it('取年月', () => {
    expect(monthOf('2026-10-01 12:30:00')).toBe('2026-10');
    expect(monthOf('bad')).toBeNull();
  });
});
