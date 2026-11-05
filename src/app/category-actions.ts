/**
 * 手动分类操作：修改交易分类，并把结果沉淀到商户记忆（下次同商户自动分类）。
 */

import type { AppDatabase } from '../data/db/database';
import { getTransaction, setTransactionCategory, upsertMerchantRule } from '../data/repository';
import { normalizeMerchantName } from '../domain/merchant';
import type { TransactionRow } from '../domain/types';

export function merchantKeyOf(tx: Pick<TransactionRow, 'counterparty' | 'description'>): string {
  return normalizeMerchantName(tx.counterparty) || normalizeMerchantName(tx.description);
}

export async function applyManualCategory(
  db: AppDatabase,
  txId: number,
  category: string,
  subcategory: string | null
): Promise<TransactionRow | null> {
  const tx = await getTransaction(db, txId);
  if (!tx) return null;

  const updated = await setTransactionCategory(db, txId, category, subcategory);
  const key = merchantKeyOf(tx);
  if (key) {
    await upsertMerchantRule(db, key, category, subcategory);
  }
  return updated;
}
