/**
 * 分类细分筛选：点击柱形图的某一项后，用分类/子分类（未分类用原始用途）+ 渠道筛选明细。
 */

import { purposeOf } from './purpose';
import type { TradeSource, TransactionRow } from './types';

export interface BreakdownSelection {
  source: TradeSource;
  category: string;
  subcategory: string | null;
}

export function breakdownKey(item: { category: string; subcategory: string | null }): string {
  return `${item.category}|${item.subcategory ?? ''}`;
}

export function matchesBreakdown(row: TransactionRow, selection: BreakdownSelection): boolean {
  if (row.source !== selection.source) return false;
  const category = row.category || purposeOf(row);
  if (category !== selection.category) return false;
  if (selection.subcategory && row.subcategory !== selection.subcategory) return false;
  return true;
}
