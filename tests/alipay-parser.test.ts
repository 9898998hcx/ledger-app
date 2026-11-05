import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAlipayCsv } from '../src/domain/parsers/alipay';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/alipay-sample.csv', import.meta.url)),
  'utf8'
);

describe('支付宝 CSV 解析器', () => {
  it('跳过前部 24 行元数据，解析 7 行数据', () => {
    const result = parseAlipayCsv(fixture);
    expect(result.totalRows).toBe(7);
    expect(result.records).toHaveLength(6);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
  });

  it('字段映射与金额转分', () => {
    const { records } = parseAlipayCsv(fixture);
    expect(records[0]).toMatchObject({
      source: 'alipay',
      sourceTradeNo: 'ALI202610010001',
      tradeTime: '2026-10-01 12:30:00',
      counterparty: '肯德基',
      description: '午餐',
      direction: 'expense',
      amountCents: 2350,
      payMethod: '余额宝',
      status: '交易成功',
    });
    expect(records[0].note).toContain('餐饮美食');
    expect(records[2].direction).toBe('income');
    expect(records[2].amountCents).toBe(8888);
    expect(records[3].description).toBe('水果,蔬菜');
    expect(records[3].amountCents).toBe(15640);
    expect(records[4]).toMatchObject({ direction: 'expense', status: '退款成功', amountCents: 3000 });
    expect(records[5].direction).toBe('neutral');
  });

  it('元数据行不会干扰（表头在前 40 行任意位置）', () => {
    const rows = ['说明行1', '说明行2', '交易时间,交易对方,收/支,金额', '2026-10-01 10:00:00,商户A,支出,10.00'];
    const { records } = parseAlipayCsv(rows.join('\n'));
    expect(records).toHaveLength(1);
    expect(records[0].amountCents).toBe(1000);
  });

  it('缺少金额列时报错', () => {
    const csv = '交易时间,交易对方,收/支\n2026-10-01 10:00:00,商户,支出';
    const { records, issues } = parseAlipayCsv(csv);
    expect(records).toHaveLength(0);
    expect(issues[0].message).toContain('未找到表头');
    expect(issues[0].message).toContain('金额');
  });

  it('完全没有表头时报错', () => {
    const { issues } = parseAlipayCsv('随便一行\n第二行');
    expect(issues[0].message).toContain('未找到表头');
  });
});
