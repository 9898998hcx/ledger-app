/**
 * 纯字符串哈希（FNV-1a 32bit × 2），用于 raw_hash / 文件哈希。
 * 不依赖 crypto，Web / RN / Node 结果一致。
 */

function fnv1a32(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hashString(input: string): string {
  const a = fnv1a32(input, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a32(input, 0x7f4a7c15).toString(16).padStart(8, '0');
  return a + b;
}
