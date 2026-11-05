/**
 * 记账 App 领域类型（纯类型，不依赖 Expo / React Native）
 */

export type TradeSource = 'wechat' | 'alipay' | 'bank';
export type Direction = 'income' | 'expense' | 'neutral';
export type MatchType = 'keyword' | 'regex';

/** 解析器输出的统一交易记录（未入库） */
export interface NewTransaction {
  source: TradeSource;
  sourceTradeNo: string | null;
  /** "YYYY-MM-DD HH:mm:ss"（保持文件中的本地时间，不做时区转换） */
  tradeTime: string;
  counterparty: string;
  description: string;
  direction: Direction;
  /** 整数分，>= 0 */
  amountCents: number;
  payMethod: string;
  status: string;
  category: string | null;
  subcategory: string | null;
  dedupKey: string | null;
  rawHash: string;
  note: string;
  /** 资金来源镜像（银行记录被支付平台记录覆盖时标记，不计入收支统计） */
  isMirror?: boolean;
}

/** 数据库中的交易行 */
export interface TransactionRow extends NewTransaction {
  id: number;
  isMirror: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: number;
  source: TradeSource;
  fileName: string;
  fileHash: string;
  importedAt: string;
  totalRows: number;
  insertedRows: number;
  skippedRows: number;
  errorMessage: string | null;
}

export interface MerchantRule {
  id: number;
  merchantKey: string;
  category: string;
  subcategory: string | null;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRule {
  id: number;
  priority: number;
  matchType: MatchType;
  pattern: string;
  category: string;
  subcategory: string | null;
  enabled: boolean;
}
