import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeCsvBytes } from '../src/domain/encoding';

const utf8Bytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/alipay-sample.csv', import.meta.url)))
);
const gbkBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL('./fixtures/alipay-sample.gbk.csv', import.meta.url)))
);

describe('CSV 编码识别', () => {
  it('UTF-8 文件识别为 utf-8', () => {
    const result = decodeCsvBytes(utf8Bytes);
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toContain('支付宝交易记录明细查询');
  });

  it('GBK 文件识别为 gbk 且中文正确', () => {
    const result = decodeCsvBytes(gbkBytes);
    expect(result.encoding).toBe('gbk');
    expect(result.text).toContain('肯德基');
    expect(result.text).toContain('不计收支');
  });

  it('同一内容 UTF-8 与 GBK 解码结果一致', () => {
    expect(decodeCsvBytes(utf8Bytes).text).toBe(decodeCsvBytes(gbkBytes).text);
  });
});
