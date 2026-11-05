/**
 * 确定性去重：
 * - 跨平台：金额（分）+ 方向 + 交易时间 ±1 天 + 商户相似度 ≥ 0.6；
 * - 支付平台记录为主，银行记录标记为「资金来源镜像」（is_mirror=1，不计入收支统计）；
 * - 自己名下账户互转 → neutral。
 */

import { channelOf } from './channel';
import { merchantSimilarity, normalizeMerchantName } from './merchant';
import type { Direction, TradeSource } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DedupInput {
  source: TradeSource;
  tradeTime: string;
  direction: Direction;
  amountCents: number;
  counterparty: string;
  description?: string;
  status?: string;
  channel?: TradeSource;
}

export const MERCHANT_SIMILARITY_THRESHOLD = 0.6;

export function parseTradeTime(iso: string): number {
  return Date.parse(iso.replace(' ', 'T'));
}

export function isWithinOneDay(a: string, b: string): boolean {
  const ta = parseTradeTime(a);
  const tb = parseTradeTime(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= MS_PER_DAY;
}

export function isSimilarMerchant(a: string, b: string): boolean {
  return merchantSimilarity(a, b) >= MERCHANT_SIMILARITY_THRESHOLD;
}

/** 生成稳定的 dedup_key（同日同金额同方向同商户） */
export function buildDedupKey(
  input: Pick<DedupInput, 'direction' | 'amountCents' | 'tradeTime' | 'counterparty'>
): string {
  const date = input.tradeTime.slice(0, 10);
  return `d|${input.direction}|${input.amountCents}|${date}|${normalizeMerchantName(input.counterparty)}`;
}

export type DedupMatch = 'none' | 'duplicate' | 'newPrimary' | 'newMirror';

function effectiveChannel(input: DedupInput): TradeSource {
  if (input.channel) return input.channel;
  return channelOf({
    source: input.source,
    counterparty: input.counterparty,
    description: input.description ?? '',
    status: input.status ?? '',
  });
}

/**
 * 比较新记录与库中某条已有记录：
 * - duplicate：同源重复（订单号缺失时兜底）；
 * - newPrimary：已有的是银行镜像 → 新记录作为主记录，并把旧记录标记镜像；
 * - newMirror：已有的是支付平台记录，新记录（银行/后导入平台）标记镜像；
 * - none：不构成重复。
 *
 * 注意：同源记录不做金额去重（不同订单号 = 不同交易，避免误杀同日同额的多笔消费），
 * 同源重复只靠 source_trade_no / raw_hash 判断。
 * 银行流水若明确是微信/支付宝的钱款去向（channel 相同），跳过商户名相似度，
 * 按金额 + 方向 + ±1 天直接认定为同一笔，避免平台账单与银行流水重复计入。
 */
export function matchExisting(newTx: DedupInput, existing: DedupInput & { isMirror: boolean }): DedupMatch {
  if (existing.isMirror) return 'none';
  if (existing.source === newTx.source) return 'none';
  if (existing.direction !== newTx.direction || existing.amountCents !== newTx.amountCents) return 'none';
  if (!isWithinOneDay(existing.tradeTime, newTx.tradeTime)) return 'none';

  const newChannel = effectiveChannel(newTx);
  const existingChannel = effectiveChannel(existing);
  if (newChannel === existingChannel && newChannel !== 'bank') {
    if (existing.source === 'bank') return 'newPrimary';
    if (newTx.source === 'bank') return 'newMirror';
    return 'newMirror';
  }

  if (!isSimilarMerchant(existing.counterparty, newTx.counterparty)) return 'none';
  if (existing.source === 'bank') return 'newPrimary';
  if (newTx.source === 'bank') return 'newMirror';
  return 'newMirror'; // 微信 vs 支付宝：后导入者视为镜像
}

/** 自己名下账户互转识别（关键词来自设置，MVP 默认空列表） */
export function isSelfTransfer(
  counterparty: string,
  description: string,
  ownKeywords: string[]
): boolean {
  const text = `${counterparty} ${description}`.toLowerCase();
  return ownKeywords.some((k) => {
    const kw = k.trim().toLowerCase();
    return kw.length > 0 && text.includes(kw);
  });
}
