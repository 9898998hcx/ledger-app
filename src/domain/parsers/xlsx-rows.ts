/**
 * Excel 单元格转文本 + 工作表选择（纯函数，供 Web 与 Node 测试复用）。
 */

import { isAlipayHeaderRow } from './alipay';
import { isBankHeaderRow } from './bank';
import { isWechatHeaderRow } from './wechat';

export type SheetSource = 'wechat' | 'alipay' | 'bank';
export type DateMode = 'local' | 'utc';

export function cellToText(cell: unknown, dateMode: DateMode = 'local'): string {
  if (cell == null) return '';
  if (cell instanceof Date) {
    const pad = (n: number): string => String(n).padStart(2, '0');
    if (dateMode === 'utc') {
      return `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())} ${pad(
        cell.getUTCHours()
      )}:${pad(cell.getUTCMinutes())}:${pad(cell.getUTCSeconds())}`;
    }
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())} ${pad(
      cell.getHours()
    )}:${pad(cell.getMinutes())}:${pad(cell.getSeconds())}`;
  }
  if (typeof cell === 'number') return String(cell);
  return String(cell);
}

export function xlsxSheetToRows(data: unknown[][], dateMode: DateMode = 'local'): string[][] {
  return data.map((row) => row.map((cell) => cellToText(cell, dateMode)));
}

export interface SheetRows {
  name: string;
  rows: string[][];
}

const HEADER_DETECTORS: Record<SheetSource, (cells: string[]) => boolean> = {
  wechat: isWechatHeaderRow,
  alipay: isAlipayHeaderRow,
  bank: isBankHeaderRow,
};

/** 从多个工作表中挑选最可能是该类账单的：优先含合法表头的前 40 行，其次首个非空表 */
export function pickSheetRows(sheets: SheetRows[], source: SheetSource): string[][] {
  const detect = HEADER_DETECTORS[source];
  const withHeader = sheets.find((sheet) =>
    sheet.rows.slice(0, 40).some((row) => detect(row))
  );
  if (withHeader) return withHeader.rows;

  const nonEmpty = sheets.find((sheet) => sheet.rows.some((row) => row.some((c) => c.trim() !== '')));
  return nonEmpty ? nonEmpty.rows : [];
}

/** 兼容旧调用：微信账单工作表选择 */
export function pickWechatSheetRows(sheets: SheetRows[]): string[][] {
  return pickSheetRows(sheets, 'wechat');
}
