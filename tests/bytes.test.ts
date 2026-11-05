import { describe, it, expect } from 'vitest';
import { base64ToBytes } from '../src/domain/bytes';
import { decodeText } from '../src/domain/encoding';

describe('base64 转字节', () => {
  it('解码 UTF-8 中文', () => {
    const bytes = base64ToBytes('5L2g5aW9');
    expect(decodeText(bytes, 'utf-8')).toBe('你好');
  });

  it('空字符串与 padding', () => {
    expect(base64ToBytes('').length).toBe(0);
    expect(decodeText(base64ToBytes('aGk='), 'utf-8')).toBe('hi');
  });
});
