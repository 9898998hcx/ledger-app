/**
 * PDF 文本提取（仅 Web）：使用 pdfjs-dist 解析页面文本，按 y 坐标聚合成行。
 * Worker 文件位于 public/pdf.worker.min.mjs。
 */

import { Platform } from 'react-native';

interface TextItem {
  str: string;
  transform: number[];
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (Platform.OS !== 'web') {
    throw new Error('PDF 解析目前仅支持 Web 端（移动端可导出 CSV 后导入）');
  }

  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const pdf = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const buckets = new Map<number, { x: number; str: string }[]>();

    for (const item of content.items as TextItem[]) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const list = buckets.get(y) ?? [];
      list.push({ x: item.transform[4], str: item.str });
      buckets.set(y, list);
    }

    const lines = [...buckets.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        items
          .sort((p, q) => p.x - q.x)
          .map((item) => item.str)
          .join(' ')
      );
    pages.push(lines.join('\n'));
  }

  return pages.join('\n');
}
