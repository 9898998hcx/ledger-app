/**
 * 渠道归属：银行流水里如果明确是微信/支付宝的钱款去向，
 * 统计与筛选时归到对应渠道（数据本身仍保持 source=bank，便于跨平台去重）。
 */

import type { TradeSource, TransactionRow } from './types';

const WECHAT_RE = /微信|财付通|tenpay|零钱/i;
const ALIPAY_RE = /支付宝|alipay|余额宝/i;

export function channelOf(
  row: Pick<TransactionRow, 'source' | 'counterparty' | 'description' | 'status'>
): TradeSource {
  if (row.source !== 'bank') return row.source;
  const text = `${row.counterparty} ${row.description} ${row.status}`;
  if (ALIPAY_RE.test(text)) return 'alipay';
  if (WECHAT_RE.test(text)) return 'wechat';
  return 'bank';
}
