/**
 * 表头列查找：按列名（或正则）匹配，不依赖固定列顺序。
 */

export function findColumn(header: string[], candidates: (string | RegExp)[]): number {
  for (const c of candidates) {
    const idx = header.findIndex((h) => (typeof c === 'string' ? h === c : c.test(h)));
    if (idx >= 0) return idx;
  }
  return -1;
}
