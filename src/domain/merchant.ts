/**
 * 商户名规范化与相似度（用于跨平台去重；M5 的商户记忆也复用规范化规则）。
 */

export function normalizeMerchantName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[（）()【】\[\]{}<>《》「」『』“”"'‘’·.,，。!！?？:：;；、\-_/\\|@#￥$%^&*+=~`]/g, '')
    .replace(/\s+/g, '');
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  if (s.length === 0) return set;
  if (s.length === 1) {
    set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** 字符 bigram Jaccard 相似度；一方包含另一方时给 0.8（如「美团外卖」与「美团外卖有限公司」） */
export function merchantSimilarity(a: string, b: string): number {
  const x = normalizeMerchantName(a);
  const y = normalizeMerchantName(b);
  if (!x || !y) return x === y ? 1 : 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.8;
  const A = bigrams(x);
  const B = bigrams(y);
  let inter = 0;
  for (const g of A) {
    if (B.has(g)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
