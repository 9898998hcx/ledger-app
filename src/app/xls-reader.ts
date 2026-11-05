/**
 * 读取旧版 Excel（.xls）为字符串行（仅 Web）。
 */

import { Platform } from 'react-native';
import { xlsBytesToSheetRows } from '../domain/parsers/xls-rows';
import type { SheetSource } from '../domain/parsers/xlsx-rows';

export async function readXlsRows(
  bytes: Uint8Array,
  source: SheetSource = 'wechat'
): Promise<string[][]> {
  if (Platform.OS !== 'web') {
    throw new Error('Excel 解析目前仅支持 Web 端（移动端可导出 CSV 后导入）');
  }
  return xlsBytesToSheetRows(bytes, source);
}
