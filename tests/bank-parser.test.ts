import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeCsvBytes } from '../src/domain/encoding';
import { parseBankCsv } from '../src/domain/parsers/bank';

const signedFixture = readFileSync(
  fileURLToPath(new URL('./fixtures/bank-sample.csv', import.meta.url)),
  'utf8'
);
const incomeExpenseFixture = readFileSync(
  fileURLToPath(new URL('./fixtures/bank-income-expense.csv', import.meta.url)),
  'utf8'
);
const gbkBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/bank-sample.gbk.csv', import.meta.url)))
);

describe('银行 CSV 解析器', () => {
  it('带符号金额：负数为支出、正数为收入', () => {
    const result = parseBankCsv(signedFixture);
    expect(result.totalRows).toBe(5);
    expect(result.records).toHaveLength(5);
    expect(result.issues).toHaveLength(0);

    expect(result.records[0]).toMatchObject({
      source: 'bank',
      tradeTime: '2026-10-01 12:30:00',
      counterparty: '美团外卖',
      direction: 'expense',
      amountCents: 2350,
      payMethod: '手机银行',
    });
    expect(result.records[0].description).toContain('消费');
    expect(result.records[1].amountCents).toBe(1200);
    expect(result.records[2]).toMatchObject({ direction: 'income', amountCents: 8888, counterparty: '张三' });
    expect(result.records[3].amountCents).toBe(15640);
    expect(result.records[4].amountCents).toBe(500);
  });

  it('GBK 编码文件可正确解码并解析', () => {
    const { text, encoding } = decodeCsvBytes(gbkBytes);
    expect(encoding).toBe('gbk');
    expect(text).toContain('美团外卖');
    const result = parseBankCsv(text);
    expect(result.records).toHaveLength(5);
    expect(result.records[0].counterparty).toBe('美团外卖');
  });

  it('收入/支出分列格式', () => {
    const result = parseBankCsv(incomeExpenseFixture);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ direction: 'expense', amountCents: 4200, counterparty: '星巴克' });
    expect(result.records[1]).toMatchObject({ direction: 'income', amountCents: 500000, counterparty: '某公司' });
  });

  it('借贷标志格式', () => {
    const csv = [
      '交易日期,摘要,对方户名,金额,借贷标志',
      '2026-10-08,消费,商户A,10.00,借',
      '2026-10-09,退款,商户B,20.00,贷',
    ].join('\n');
    const result = parseBankCsv(csv);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ direction: 'expense', amountCents: 1000 });
    expect(result.records[1]).toMatchObject({ direction: 'income', amountCents: 2000 });
  });

  it('跳过前部元数据行', () => {
    const csv = ['说明行1', '说明行2', '交易日期,摘要,对方户名,交易金额', '2026-10-10,消费,商户C,-1.00'].join('\n');
    const result = parseBankCsv(csv);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].amountCents).toBe(100);
  });

  it('日期/金额异常时给出行号', () => {
    const csv = [
      '交易日期,摘要,对方户名,交易金额',
      'bad-date,消费,商户C,-1.00',
      '2026-10-10,消费,商户D,abc',
    ].join('\n');
    const result = parseBankCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.records).toHaveLength(0);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].message).toContain('交易日期无法解析');
    expect(result.issues[1].message).toContain('金额无法解析');
  });

  it('缺少表头时给出明确错误', () => {
    const result = parseBankCsv('foo,bar\n1,2');
    expect(result.issues[0].message).toContain('未找到银行流水表头');
  });
});
