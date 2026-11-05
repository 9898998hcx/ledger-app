/**
 * 旧版 Excel（.xls，BIFF）读取：使用 SheetJS 解析。
 * 同时兜底部分支付宝导出的「.xls 实际是 HTML 表格」的情况。
 */

import * as XLSX from 'xlsx';
import { pickSheetRows, xlsxSheetToRows, type SheetSource, type SheetRows } from './xlsx-rows';

function workbookSheets(workbook: XLSX.WorkBook, dateMode: 'local' | 'utc'): SheetRows[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
    }) as unknown[][];
    return { name, rows: xlsxSheetToRows(data, dateMode) };
  });
}

export function xlsBytesToSheetRows(bytes: Uint8Array, source: SheetSource = 'wechat'): string[][] {
  const dateMode = source === 'wechat' ? 'local' : 'utc';

  try {
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    if (workbook.SheetNames.length > 0) {
      return pickSheetRows(workbookSheets(workbook, dateMode), source);
    }
  } catch {
    // 继续尝试 HTML / 文本兜底
  }

  let text = '';
  for (const encoding of ['gbk', 'utf-8']) {
    try {
      const decoded = new TextDecoder(encoding).decode(bytes);
      if (decoded.trim()) {
        text = decoded;
        break;
      }
    } catch {
      // 浏览器不支持该编码时继续
    }
  }
  if (!text.trim()) return [];

  try {
    const workbook = XLSX.read(text, { type: 'string', cellDates: true });
    return pickSheetRows(workbookSheets(workbook, dateMode), source);
  } catch {
    return [];
  }
}
