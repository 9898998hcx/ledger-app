/**
 * 读取 Excel（xlsx）为字符串行（仅 Web）。
 * 读取全部工作表，自动挑选包含微信账单表头的那一个；Node 测试使用 read-excel-file/node。
 */

import { Platform } from 'react-native';
import { pickSheetRows, xlsxSheetToRows, type SheetSource } from '../domain/parsers/xlsx-rows';

export async function readXlsxRows(
  bytes: Uint8Array,
  source: SheetSource = 'wechat'
): Promise<string[][]> {
  if (Platform.OS !== 'web') {
    throw new Error('Excel 解析目前仅支持 Web 端（移动端可导出 CSV 后导入）');
  }

  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const sheets = (await readXlsxFile(buffer as unknown as ArrayBuffer)) as {
    sheet: string;
    data: unknown[][];
  }[];

  const dateMode = source === 'wechat' ? 'local' : 'utc';
  return pickSheetRows(
    sheets.map((sheet) => ({
      name: sheet.sheet,
      rows: xlsxSheetToRows(sheet.data, dateMode),
    })),
    source
  );
}
