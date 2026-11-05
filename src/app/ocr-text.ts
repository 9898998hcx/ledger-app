/**
 * 账单图片 OCR（仅 Web）：按需从 CDN 加载 tesseract.js（首次需联网），
 * 使用 chi_sim+eng 识别中文与数字，输出文本供银行文本解析器使用。
 */

import { Platform } from 'react-native';

const TESSERACT_URL = 'https://unpkg.com/tesseract.js@7.0.0/dist/tesseract.min.js';
const TESSERACT_WORKER = 'https://unpkg.com/tesseract.js@7.0.0/dist/worker.min.js';
const TESSERACT_CORE = 'https://unpkg.com/tesseract.js-core@7.0.0/';
const TESSDATA = 'https://tessdata.projectnaptha.com/4.0.0';

interface TesseractLike {
  createWorker: (langs: string, oem?: number, options?: Record<string, unknown>) => Promise<{
    recognize: (image: Uint8Array) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  }>;
}

async function loadTesseract(): Promise<TesseractLike> {
  const globalWindow = window as unknown as { Tesseract?: TesseractLike };
  if (globalWindow.Tesseract) return globalWindow.Tesseract;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('加载 OCR 引擎失败（首次使用需要联网下载）'));
    document.head.appendChild(script);
  });

  if (!globalWindow.Tesseract) throw new Error('OCR 引擎加载失败');
  return globalWindow.Tesseract;
}

export async function extractImageText(bytes: Uint8Array): Promise<string> {
  if (Platform.OS !== 'web') {
    throw new Error('图片 OCR 目前仅支持 Web 端（移动端可导出 CSV 后导入）');
  }

  const tesseract = await loadTesseract();
  const worker = await tesseract.createWorker('chi_sim+eng', 1, {
    workerPath: TESSERACT_WORKER,
    corePath: TESSERACT_CORE,
    langPath: TESSDATA,
  });

  try {
    const result = await worker.recognize(bytes);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}
