import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseWechatCsv } from '../src/domain/parsers/wechat';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/wechat-sample.csv', import.meta.url)),
  'utf8'
);

describe('微信 CSV 解析器', () => {
  it('解析 fixture：7 行数据，6 条入库，1 条状态跳过', () => {
    const result = parseWechatCsv(fixture);
    expect(result.totalRows).toBe(7);
    expect(result.records).toHaveLength(6);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
  });

  it('退款收入行归入收入并标记退款分类', () => {
    const csv = [
      '交易时间,交易对方,收/支,金额(元),当前状态,交易单号',
      '2026-10-08 10:00:00,小拉出行,收入,21.36,已全额退款,WX-REFUND-1',
    ].join('\n');
    const result = parseWechatCsv(csv);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      direction: 'income',
      category: '退款',
      status: '已全额退款',
      amountCents: 2136,
    });
  });

  it('字段映射与金额转分', () => {
    const { records } = parseWechatCsv(fixture);
    expect(records[0]).toMatchObject({
      source: 'wechat',
      sourceTradeNo: 'WX202610010001',
      tradeTime: '2026-10-01 12:30:00',
      counterparty: '美团外卖',
      description: '午餐',
      direction: 'expense',
      amountCents: 2350,
      payMethod: '零钱',
      status: '支付成功',
    });
    expect(records[1].amountCents).toBe(1200);
    expect(records[2].direction).toBe('income');
    expect(records[2].amountCents).toBe(8888);
    expect(records[3].description).toBe('水果,蔬菜');
    expect(records[3].amountCents).toBe(15640);
    expect(records[4]).toMatchObject({ direction: 'expense', status: '已退款', amountCents: 3000 });
    expect(records[5].direction).toBe('neutral');
  });

  it('列顺序打乱也能按表头匹配', () => {
    const csv = [
      '金额(元),收/支,交易时间,交易对方,商品,当前状态,交易单号',
      '¥10.00,支出,2026-10-09 10:00:00,测试商户,测试商品,支付成功,T001',
    ].join('\n');
    const { records, issues } = parseWechatCsv(csv);
    expect(issues).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      amountCents: 1000,
      direction: 'expense',
      counterparty: '测试商户',
      sourceTradeNo: 'T001',
    });
  });

  it('金额与日期异常时给出行号', () => {
    const csv = [
      '交易时间,交易对方,收/支,金额(元)',
      '2026-10-01 10:00:00,商户A,支出,abc',
      'not-a-date,商户B,支出,10.00',
    ].join('\n');
    const { records, issues, totalRows } = parseWechatCsv(csv);
    expect(totalRows).toBe(2);
    expect(records).toHaveLength(0);
    expect(issues).toHaveLength(2);
    expect(issues[0].rowNumber).toBe(2);
    expect(issues[0].message).toContain('金额无法解析');
    expect(issues[1].rowNumber).toBe(3);
    expect(issues[1].message).toContain('交易时间无法解析');
  });

  it('缺少表头时给出明确错误', () => {
    const { records, issues, totalRows } = parseWechatCsv('foo,bar\n1,2');
    expect(records).toHaveLength(0);
    expect(totalRows).toBe(0);
    expect(issues[0].message).toContain('未找到表头');
  });
});
