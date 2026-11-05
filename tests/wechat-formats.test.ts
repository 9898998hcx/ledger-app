import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readSheet } from 'read-excel-file/node';
import { xlsxSheetToRows } from '../src/domain/parsers/xlsx-rows';
import { parseWechatRows, parseWechatText } from '../src/domain/parsers/wechat';

const xlsxPath = fileURLToPath(new URL('./fixtures/wechat-sample.xlsx', import.meta.url));
const text = readFileSync(
  fileURLToPath(new URL('./fixtures/wechat-text.txt', import.meta.url)),
  'utf8'
);

describe('微信 Excel 解析', () => {
  it('读取 xlsx 并解析出 6 条有效交易', async () => {
    const data = (await readSheet(xlsxPath)) as unknown as unknown[][];
    const rows = xlsxSheetToRows(data);
    const result = parseWechatRows(rows);
    expect(result.totalRows).toBe(7);
    expect(result.records).toHaveLength(6);
    expect(result.issues).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      source: 'wechat',
      counterparty: '美团外卖',
      description: '午餐',
      direction: 'expense',
      amountCents: 2350,
      tradeTime: '2026-10-01 12:30:00',
    });
    expect(result.records[2]).toMatchObject({ direction: 'income', amountCents: 8888 });
    expect(result.records[3].description).toBe('水果,蔬菜');
  });

  it('日期单元格为 Date 时也能格式化', () => {
    const rows = [
      ['交易时间', '交易对方', '收/支', '金额(元)'],
      [new Date(2026, 9, 1, 12, 30, 0), '测试商户', '支出', '10.00'],
    ];
    const textRows = xlsxSheetToRows(rows);
    expect(textRows[1][0]).toBe('2026-10-01 12:30:00');
  });
});

describe('微信 PDF 文本解析', () => {
  it('解析 5 行：4 条有效 + 1 条交易关闭跳过', () => {
    const result = parseWechatText(text);
    expect(result.totalRows).toBe(5);
    expect(result.records).toHaveLength(4);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
    expect(result.records[0]).toMatchObject({
      source: 'wechat',
      direction: 'expense',
      amountCents: 2350,
      sourceTradeNo: 'WX202610010001',
    });
    expect(result.records[0].counterparty).toContain('美团外卖');
    expect(result.records[2]).toMatchObject({ direction: 'income', amountCents: 8888 });
    expect(result.records[3].amountCents).toBe(15640);
  });

  it('同时出现收入/支出时报错', () => {
    const result = parseWechatText('2026-10-06 10:00:00 转账 张三 收入支出 100.00');
    expect(result.records).toHaveLength(0);
    expect(result.issues[0].message).toContain('收/支方向不明确');
  });
});
