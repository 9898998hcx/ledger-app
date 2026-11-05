import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import readXlsxFile from 'read-excel-file/node';
import { pickWechatSheetRows, xlsxSheetToRows } from '../src/domain/parsers/xlsx-rows';
import { parseWechatRows } from '../src/domain/parsers/wechat';

const ledgerPath = fileURLToPath(new URL('./fixtures/wechat-ledger.xlsx', import.meta.url));

describe('真实格式微信 Excel（多 sheet / 15 行说明 / 表头变体）', () => {
  it('自动挑中正确工作表并解析出 4 条有效交易', async () => {
    const sheets = (await readXlsxFile(ledgerPath)) as unknown as Array<{
      sheet: string;
      data: unknown[][];
    }>;
    const rows = pickWechatSheetRows(
      sheets.map((sheet) => ({ name: sheet.sheet, rows: xlsxSheetToRows(sheet.data) }))
    );
    expect(rows.length).toBeGreaterThan(15);

    const result = parseWechatRows(rows);
    expect(result.totalRows).toBe(5);
    expect(result.records).toHaveLength(4);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('交易关闭');
    expect(result.records[0]).toMatchObject({
      counterparty: '美团外卖',
      description: '午餐',
      direction: 'expense',
      amountCents: 2350,
      tradeTime: '2026-10-01 12:30:00',
      sourceTradeNo: 'LEDGER001',
    });
    expect(result.records[1]).toMatchObject({ direction: 'income', amountCents: 8888 });
    expect(result.records[2].amountCents).toBe(15640);
  });

  it('方向来自「类型」列（支出/收入）', () => {
    const rows = [
      ['日期', '类型', '商户', '金额'],
      ['2026-10-07 10:00:00', '支出', '测试商户', '10.00'],
      ['2026-10-08 10:00:00', '收入', '测试商户', '20.00'],
    ];
    const result = parseWechatRows(rows);
    expect(result.records[0].direction).toBe('expense');
    expect(result.records[1].direction).toBe('income');
  });

  it('缺少金额列时给出明确提示', () => {
    const result = parseWechatRows([['日期', '类型', '商户'], ['2026-10-07 10:00:00', '支出', '商户']]);
    expect(result.records).toHaveLength(0);
    expect(result.issues[0].message).toContain('未找到表头');
  });
});
