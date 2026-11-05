/**
 * 文本编码工具：支付宝导出通常为 GBK，微信通常为 UTF-8。
 * 使用 TextDecoder（Web / Node 均支持 gbk 标签）。
 */

export type TextEncoding = 'utf-8' | 'gbk';

export interface DecodedCsv {
  text: string;
  encoding: TextEncoding;
}

export function decodeText(bytes: Uint8Array, encoding: TextEncoding): string {
  const label = encoding === 'gbk' ? 'gbk' : 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** 自动识别编码：先按严格 UTF-8 解码，失败则按 GBK */
export function decodeCsvBytes(bytes: Uint8Array): DecodedCsv {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    // 不是合法 UTF-8，尝试 GBK
  }
  try {
    return { text: decodeText(bytes, 'gbk'), encoding: 'gbk' };
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
  }
}
