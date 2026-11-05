/**
 * 统计引擎（纯函数）：
 * - 只统计当月、非镜像、非 neutral 的交易；
 * - 收入/支出按 direction 汇总，结余 = 收入 − 支出；
 * - 分类支出按从高到低排序。
 */

import { channelOf } from './channel';
import { purposeOf } from './purpose';
import type { TradeSource, TransactionRow } from './types';

export interface CategoryStat {
  category: string;
  totalCents: number;
  count: number;
}

export interface DetailStat {
  category: string;
  subcategory: string | null;
  totalCents: number;
  count: number;
}

export interface MonthlyStats {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: CategoryStat[];
  byDetail: DetailStat[];
}

export interface PeriodStats {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: CategoryStat[];
  byDetail: DetailStat[];
}

/** 按年份 / 月份（含全部）统计收支与分类明细 */
export function computeStats(
  rows: TransactionRow[],
  year: string | 'all' = 'all',
  month: string | 'all' = 'all'
): PeriodStats {
  const inPeriod = filterByPeriod(rows, year, month);
  const counted = inPeriod.filter((r) => !r.isMirror && r.direction !== 'neutral');

  let incomeCents = 0;
  let expenseCents = 0;
  const byCategoryMap = new Map<string, { totalCents: number; count: number }>();
  const byDetailMap = new Map<
    string,
    { category: string; subcategory: string | null; totalCents: number; count: number }
  >();

  for (const row of counted) {
    if (row.direction === 'income') {
      incomeCents += row.amountCents;
    } else if (row.direction === 'expense') {
      expenseCents += row.amountCents;
      // 未分类支出不再归入「其他」，改用原始用途（备注/商品说明/交易对方）
      const category = row.category || purposeOf(row);
      const subcategory = row.category ? row.subcategory || null : null;

      const categoryItem = byCategoryMap.get(category) ?? { totalCents: 0, count: 0 };
      categoryItem.totalCents += row.amountCents;
      categoryItem.count += 1;
      byCategoryMap.set(category, categoryItem);

      const detailKey = `${category}|${subcategory ?? ''}`;
      const detailItem =
        byDetailMap.get(detailKey) ?? { category, subcategory, totalCents: 0, count: 0 };
      detailItem.totalCents += row.amountCents;
      detailItem.count += 1;
      byDetailMap.set(detailKey, detailItem);
    }
  }

  const byCategory: CategoryStat[] = [...byCategoryMap.entries()]
    .map(([category, value]) => ({ category, totalCents: value.totalCents, count: value.count }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const byDetail: DetailStat[] = [...byDetailMap.values()].sort(
    (a, b) => b.totalCents - a.totalCents
  );

  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    byCategory,
    byDetail,
  };
}

/** 兼容按月统计的旧接口 */
export function computeMonthlyStats(rows: TransactionRow[], month: string): MonthlyStats {
  const stats = computeStats(rows, month.slice(0, 4), month.slice(5, 7));
  return { month, ...stats };
}

/** 收入分类细分：仅收入，按分类 + 子分类；未分类按原始用途 */
export function computeIncomeBreakdown(
  rows: TransactionRow[],
  year: string | 'all' = 'all',
  month: string | 'all' = 'all'
): DetailStat[] {
  const map = new Map<string, DetailStat>();
  for (const row of filterByPeriod(rows, year, month)) {
    if (row.isMirror || row.direction !== 'income') continue;
    const category = row.category || purposeOf(row);
    const subcategory = row.category ? row.subcategory || null : null;
    const key = `${category}|${subcategory ?? ''}`;
    const item = map.get(key) ?? { category, subcategory, totalCents: 0, count: 0 };
    item.totalCents += row.amountCents;
    item.count += 1;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** 从交易中提取出现过的月份（倒序） */
export function monthsOf(rows: TransactionRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const month = row.tradeTime.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) set.add(month);
  }
  return [...set].sort().reverse();
}

/** 从交易中提取出现过的年份（倒序） */
export function yearsOf(rows: TransactionRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const ym = row.tradeTime.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym.slice(0, 4));
  }
  return [...set].sort().reverse();
}

/** 全部月份选项（01-12）：支出/收入/统计的月份筛选固定展示 12 个月 */
export const ALL_MONTHS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
] as const;

/** 指定年份下出现过的月份（升序，两位）；year = 'all' 时返回全部月份 */
export function monthsOfYear(rows: TransactionRow[], year: string | 'all'): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const ym = row.tradeTime.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    if (year !== 'all' && ym.slice(0, 4) !== year) continue;
    set.add(ym.slice(5, 7));
  }
  return [...set].sort();
}

/** 按年份 / 月份筛选（year: 'YYYY' | 'all'，month: 'MM' | 'all'） */
export function filterByPeriod(
  rows: TransactionRow[],
  year: string | 'all',
  month: string | 'all'
): TransactionRow[] {
  return rows.filter((row) => {
    if (year !== 'all' && !row.tradeTime.startsWith(`${year}-`)) return false;
    if (month !== 'all' && row.tradeTime.slice(5, 7) !== month) return false;
    return true;
  });
}

/** 收入记录：direction = income，排除镜像，按年份/月份筛选 */
export function selectIncome(
  rows: TransactionRow[],
  year: string | 'all' = 'all',
  month: string | 'all' = 'all'
): TransactionRow[] {
  return filterByPeriod(rows, year, month).filter(
    (row) => row.direction === 'income' && !row.isMirror
  );
}

/** 按来源筛选：全部 = 微信 + 支付宝（不含银行卡）；银行单独查看 */
export function filterBySource(
  rows: TransactionRow[],
  source: TradeSource | 'all'
): TransactionRow[] {
  if (source === 'all') return rows.filter((row) => row.source !== 'bank');
  if (source === 'bank') return rows.filter((row) => row.source === 'bank');
  return rows.filter((row) => channelOf(row) === source);
}

export interface SourceTotal {
  source: TradeSource;
  incomeCents: number;
  expenseCents: number;
  count: number;
}

/** 指定期间各渠道（微信/支付宝/银行）的收入、支出合计 */
export function computeSourceTotals(
  rows: TransactionRow[],
  year: string | 'all' = 'all',
  month: string | 'all' = 'all'
): SourceTotal[] {
  const sources: TradeSource[] = ['wechat', 'alipay', 'bank'];
  const map = new Map<TradeSource, { incomeCents: number; expenseCents: number; count: number }>();

  for (const row of filterByPeriod(rows, year, month)) {
    if (row.isMirror || row.direction === 'neutral') continue;
    const channel = channelOf(row);
    const item = map.get(channel) ?? { incomeCents: 0, expenseCents: 0, count: 0 };
    if (row.direction === 'income') item.incomeCents += row.amountCents;
    else if (row.direction === 'expense') item.expenseCents += row.amountCents;
    item.count += 1;
    map.set(channel, item);
  }

  return sources.map((source) => ({
    source,
    ...(map.get(source) ?? { incomeCents: 0, expenseCents: 0, count: 0 }),
  }));
}

export interface PeriodTotals {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

/** 指定期间的收入/支出合计（排除镜像与中性） */
export function computePeriodTotals(
  rows: TransactionRow[],
  year: string | 'all' = 'all',
  month: string | 'all' = 'all'
): PeriodTotals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const row of filterByPeriod(rows, year, month)) {
    if (row.isMirror || row.direction === 'neutral') continue;
    if (row.direction === 'income') incomeCents += row.amountCents;
    else if (row.direction === 'expense') expenseCents += row.amountCents;
  }
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents };
}

export interface CounterpartyStat {
  counterparty: string;
  totalCents: number;
  count: number;
  category: string | null;
  subcategory: string | null;
  purpose: string;
}

/** 资金去向：指定期间支出按交易对方汇总（排除镜像与中性），从高到低取前 N */
export function computeTopCounterpartiesForPeriod(
  rows: TransactionRow[],
  year: string | 'all' = 'all',
  month: string | 'all' = 'all',
  limit = 5
): CounterpartyStat[] {
  const map = new Map<
    string,
    {
      totalCents: number;
      count: number;
      category: string | null;
      subcategory: string | null;
      purpose: string;
    }
  >();
  for (const row of filterByPeriod(rows, year, month)) {
    if (row.isMirror || row.direction !== 'expense') continue;
    const key = row.counterparty || row.description || '未知商户';
    const current =
      map.get(key) ?? {
        totalCents: 0,
        count: 0,
        category: row.category,
        subcategory: row.subcategory,
        purpose: purposeOf(row),
      };
    current.totalCents += row.amountCents;
    current.count += 1;
    map.set(key, current);
  }
  return [...map.entries()]
    .map(([counterparty, value]) => ({ counterparty, ...value }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, limit);
}

/** 兼容按月份统计的旧接口 */
export function computeTopCounterparties(
  rows: TransactionRow[],
  month: string,
  limit = 5
): CounterpartyStat[] {
  return computeTopCounterpartiesForPeriod(rows, month.slice(0, 4), month.slice(5, 7), limit);
}
