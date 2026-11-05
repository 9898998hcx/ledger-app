import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBankText } from '../src/domain/parsers/bank-text';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/bank-text.txt', import.meta.url)),
  'utf8'
);

describe('银行账单文本解析（PDF / OCR）', () => {
  it('解析 fixture：5 行 5 笔', () => {
    const result = parseBankText(fixture);
    expect(result.totalRows).toBe(5);
    expect(result.records).toHaveLength(5);
    expect(result.issues).toHaveLength(0);
    expect(result.records[0]).toMatchObject({
      counterparty: 'Meituan',
      direction: 'expense',
      amountCents: 2350,
      tradeTime: '2026-10-01 12:30:00',
      source: 'bank',
    });
    expect(result.records[2]).toMatchObject({
      counterparty: 'Zhang San',
      direction: 'income',
      amountCents: 8888,
    });
    expect(result.records[3].amountCents).toBe(15640);
  });

  it('中文摘要 + 收支关键词方向', () => {
    const text = [
      '2026-10-06 08:00:00 工资 某公司 5000.00',
      '2026-10-07 09:00:00 支出 电费 100.00',
    ].join('\n');
    const result = parseBankText(text);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ direction: 'income', amountCents: 500000 });
    expect(result.records[1]).toMatchObject({ direction: 'expense', amountCents: 10000 });
  });

  it('同时出现收入/支出关键词时给出行号错误', () => {
    const result = parseBankText('2026-10-08 消费收入 100.00');
    expect(result.records).toHaveLength(0);
    expect(result.issues[0].message).toContain('收支方向不明确');
  });

  it('缺金额时报错，表头行自动忽略', () => {
    const result = parseBankText('表头说明\n2026-10-09 消费 商家');
    expect(result.totalRows).toBe(1);
    expect(result.records).toHaveLength(0);
    expect(result.issues[0].message).toContain('未找到金额');
  });

  it('支持斜杠/中文日期格式', () => {
    const result = parseBankText('2026/10/10 09:00 支出 商户A 10.00');
    expect(result.records[0].tradeTime).toBe('2026-10-10 09:00:00');
  });
});
