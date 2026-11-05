/**
 * 原始用途：优先商品说明/备注，其次交易对方；永远不丢失「这笔钱花在哪」。
 */

import type { TransactionRow } from './types';

export function purposeOf(
  row: Pick<TransactionRow, 'description' | 'counterparty'>
): string {
  const description = row.description.trim();
  if (description) return description;
  const counterparty = row.counterparty.trim();
  return counterparty || '未注明用途';
}
