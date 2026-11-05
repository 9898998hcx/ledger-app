/**
 * CSV 文件下载（Web 端）。移动端返回 false，由调用方提示。
 */

import { Platform } from 'react-native';

export async function downloadCsv(fileName: string, content: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
