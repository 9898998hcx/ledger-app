/**
 * 仓储层：交易 / 导入批次 / 分类规则 / 商户记忆的 SQL 读写。
 * 只依赖 AppDatabase 接口，不依赖 Expo / React Native，可在 Node 中测试。
 */

import type { AppDatabase, SqlValue } from './db/database';
import { csvEscape } from '../domain/csv';
import type {
  CategoryRule,
  ImportBatch,
  MerchantRule,
  NewTransaction,
  TradeSource,
  TransactionRow,
} from '../domain/types';

const nowIso = (): string => new Date().toISOString();

type RawRow = Record<string, unknown>;

function mapTransactionRow(row: RawRow): TransactionRow {
  return {
    id: Number(row.id),
    source: row.source as TradeSource,
    sourceTradeNo: (row.source_trade_no as string | null) ?? null,
    tradeTime: String(row.trade_time ?? ''),
    counterparty: String(row.counterparty ?? ''),
    description: String(row.description ?? ''),
    direction: row.direction as TransactionRow['direction'],
    amountCents: Number(row.amount_cents ?? 0),
    payMethod: String(row.pay_method ?? ''),
    status: String(row.status ?? ''),
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    dedupKey: (row.dedup_key as string | null) ?? null,
    rawHash: String(row.raw_hash ?? ''),
    note: String(row.note ?? ''),
    isMirror: Number(row.is_mirror ?? 0) === 1,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function insertTransaction(db: AppDatabase, tx: NewTransaction): Promise<number> {
  const ts = nowIso();
  await db.run(
    `INSERT INTO transactions
       (source, source_trade_no, trade_time, counterparty, description, direction, amount_cents,
        pay_method, status, category, subcategory, dedup_key, raw_hash, note, is_mirror, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.source,
      tx.sourceTradeNo,
      tx.tradeTime,
      tx.counterparty,
      tx.description,
      tx.direction,
      tx.amountCents,
      tx.payMethod,
      tx.status,
      tx.category,
      tx.subcategory,
      tx.dedupKey,
      tx.rawHash,
      tx.note,
      tx.isMirror ? 1 : 0,
      ts,
      ts,
    ]
  );
  const rows = await db.all<{ id: number }>('SELECT last_insert_rowid() AS id');
  return Number(rows[0]?.id ?? 0);
}

/** 同源订单号或同源 raw_hash 已存在则视为重复 */
export async function transactionExists(
  db: AppDatabase,
  source: TradeSource,
  sourceTradeNo: string | null,
  rawHash: string
): Promise<boolean> {
  if (sourceTradeNo) {
    const byNo = await db.all<{ id: number }>(
      'SELECT id FROM transactions WHERE source = ? AND source_trade_no = ? LIMIT 1',
      [source, sourceTradeNo]
    );
    if (byNo.length > 0) return true;
  }
  const byHash = await db.all<{ id: number }>(
    'SELECT id FROM transactions WHERE source = ? AND raw_hash = ? LIMIT 1',
    [source, rawHash]
  );
  return byHash.length > 0;
}

export interface TransactionFilter {
  month?: string; // "YYYY-MM"
  source?: TradeSource;
  category?: string;
  uncategorizedOnly?: boolean;
  /** 排除资金来源镜像（统计口径用） */
  excludeMirror?: boolean;
}

export async function listTransactions(
  db: AppDatabase,
  filter: TransactionFilter = {}
): Promise<TransactionRow[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (filter.month) {
    where.push('substr(trade_time, 1, 7) = ?');
    params.push(filter.month);
  }
  if (filter.source) {
    where.push('source = ?');
    params.push(filter.source);
  }
  if (filter.category) {
    where.push('category = ?');
    params.push(filter.category);
  }
  if (filter.uncategorizedOnly) {
    where.push("(category IS NULL OR category = '')");
  }
  if (filter.excludeMirror) {
    where.push('is_mirror = 0');
  }
  const sql =
    'SELECT * FROM transactions' +
    (where.length > 0 ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY trade_time DESC, id DESC';
  const rows = await db.all<RawRow>(sql, params);
  return rows.map(mapTransactionRow);
}

export async function getTransaction(db: AppDatabase, id: number): Promise<TransactionRow | null> {
  const rows = await db.all<RawRow>('SELECT * FROM transactions WHERE id = ? LIMIT 1', [id]);
  return rows.length > 0 ? mapTransactionRow(rows[0]) : null;
}

/** 查找同方向同金额、时间在 ±windowDays 天内的非镜像交易（跨平台去重候选） */
export async function findDedupCandidates(
  db: AppDatabase,
  direction: TransactionRow['direction'],
  amountCents: number,
  tradeTime: string,
  windowDays = 1
): Promise<TransactionRow[]> {
  const rows = await db.all<RawRow>(
    `SELECT * FROM transactions
     WHERE direction = ? AND amount_cents = ? AND is_mirror = 0
       AND abs(julianday(trade_time) - julianday(?)) <= ?
     ORDER BY id ASC`,
    [direction, amountCents, tradeTime, windowDays]
  );
  return rows.map(mapTransactionRow);
}

/** 标记某条交易为资金来源镜像（可同时写入 dedup_key） */
export async function markTransactionMirror(
  db: AppDatabase,
  id: number,
  dedupKey?: string | null
): Promise<void> {
  await db.run(
    `UPDATE transactions
     SET is_mirror = 1, dedup_key = COALESCE(?, dedup_key), updated_at = ?
     WHERE id = ?`,
    [dedupKey ?? null, nowIso(), id]
  );
}

/** 手动修改分类，返回修改后的交易（M5 会同时写入商户记忆） */
export async function setTransactionCategory(
  db: AppDatabase,
  id: number,
  category: string,
  subcategory: string | null
): Promise<TransactionRow | null> {
  await db.run('UPDATE transactions SET category = ?, subcategory = ?, updated_at = ? WHERE id = ?', [
    category,
    subcategory,
    nowIso(),
    id,
  ]);
  return getTransaction(db, id);
}

export async function countTransactions(db: AppDatabase): Promise<number> {
  const rows = await db.all<{ c: number }>('SELECT COUNT(*) AS c FROM transactions');
  return Number(rows[0]?.c ?? 0);
}

// ---------- 商户记忆 ----------

export async function upsertMerchantRule(
  db: AppDatabase,
  merchantKey: string,
  category: string,
  subcategory: string | null
): Promise<void> {
  const ts = nowIso();
  await db.run(
    `INSERT INTO merchant_rules (merchant_key, category, subcategory, hit_count, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(merchant_key) DO UPDATE SET
       category = excluded.category,
       subcategory = excluded.subcategory,
       hit_count = merchant_rules.hit_count + 1,
       updated_at = excluded.updated_at`,
    [merchantKey, category, subcategory, ts, ts]
  );
}

export async function listMerchantRules(db: AppDatabase): Promise<MerchantRule[]> {
  const rows = await db.all<RawRow>('SELECT * FROM merchant_rules ORDER BY hit_count DESC, id ASC');
  return rows.map((r) => ({
    id: Number(r.id),
    merchantKey: String(r.merchant_key ?? ''),
    category: String(r.category ?? ''),
    subcategory: (r.subcategory as string | null) ?? null,
    hitCount: Number(r.hit_count ?? 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }));
}

// ---------- 分类规则 ----------

export async function insertCategoryRule(
  db: AppDatabase,
  rule: Omit<CategoryRule, 'id'>
): Promise<number> {
  await db.run(
    `INSERT INTO category_rules (priority, match_type, pattern, category, subcategory, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rule.priority, rule.matchType, rule.pattern, rule.category, rule.subcategory, rule.enabled ? 1 : 0]
  );
  const rows = await db.all<{ id: number }>('SELECT last_insert_rowid() AS id');
  return Number(rows[0]?.id ?? 0);
}

export async function listCategoryRules(db: AppDatabase): Promise<CategoryRule[]> {
  const rows = await db.all<RawRow>(
    'SELECT * FROM category_rules ORDER BY priority ASC, id ASC'
  );
  return rows.map((r) => ({
    id: Number(r.id),
    priority: Number(r.priority ?? 100),
    matchType: r.match_type === 'regex' ? 'regex' : 'keyword',
    pattern: String(r.pattern ?? ''),
    category: String(r.category ?? ''),
    subcategory: (r.subcategory as string | null) ?? null,
    enabled: Number(r.enabled ?? 1) === 1,
  }));
}

export async function updateCategoryRule(db: AppDatabase, rule: CategoryRule): Promise<void> {
  await db.run(
    `UPDATE category_rules
     SET priority = ?, match_type = ?, pattern = ?, category = ?, subcategory = ?, enabled = ?
     WHERE id = ?`,
    [
      rule.priority,
      rule.matchType,
      rule.pattern,
      rule.category,
      rule.subcategory,
      rule.enabled ? 1 : 0,
      rule.id,
    ]
  );
}

export async function setCategoryRuleEnabled(
  db: AppDatabase,
  id: number,
  enabled: boolean
): Promise<void> {
  await db.run('UPDATE category_rules SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

export async function deleteCategoryRule(db: AppDatabase, id: number): Promise<void> {
  await db.run('DELETE FROM category_rules WHERE id = ?', [id]);
}

export async function deleteAllCategoryRules(db: AppDatabase): Promise<void> {
  await db.run('DELETE FROM category_rules');
}

export async function countCategoryRules(db: AppDatabase): Promise<number> {
  const rows = await db.all<{ c: number }>('SELECT COUNT(*) AS c FROM category_rules');
  return Number(rows[0]?.c ?? 0);
}

// ---------- 导入批次 ----------

export async function insertImportBatch(
  db: AppDatabase,
  batch: Omit<ImportBatch, 'id'>
): Promise<number> {
  await db.run(
    `INSERT INTO import_batches
       (source, file_name, file_hash, imported_at, total_rows, inserted_rows, skipped_rows, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batch.source,
      batch.fileName,
      batch.fileHash,
      batch.importedAt,
      batch.totalRows,
      batch.insertedRows,
      batch.skippedRows,
      batch.errorMessage,
    ]
  );
  const rows = await db.all<{ id: number }>('SELECT last_insert_rowid() AS id');
  return Number(rows[0]?.id ?? 0);
}

function mapImportBatch(r: RawRow): ImportBatch {
  return {
    id: Number(r.id),
    source: String(r.source ?? '') as TradeSource,
    fileName: String(r.file_name ?? ''),
    fileHash: String(r.file_hash ?? ''),
    importedAt: String(r.imported_at ?? ''),
    totalRows: Number(r.total_rows ?? 0),
    insertedRows: Number(r.inserted_rows ?? 0),
    skippedRows: Number(r.skipped_rows ?? 0),
    errorMessage: (r.error_message as string | null) ?? null,
  };
}

export async function listImportBatches(db: AppDatabase): Promise<ImportBatch[]> {
  const rows = await db.all<RawRow>(
    'SELECT * FROM import_batches ORDER BY imported_at DESC, id DESC'
  );
  return rows.map(mapImportBatch);
}

/** 按来源 + 文件哈希查找导入批次（用于重复文件判断/失败重试） */
export async function findImportBatchByHash(
  db: AppDatabase,
  source: TradeSource,
  fileHash: string
): Promise<ImportBatch | null> {
  const rows = await db.all<RawRow>(
    'SELECT * FROM import_batches WHERE source = ? AND file_hash = ? ORDER BY id DESC LIMIT 1',
    [source, fileHash]
  );
  return rows.length > 0 ? mapImportBatch(rows[0]) : null;
}

export async function deleteImportBatch(db: AppDatabase, id: number): Promise<void> {
  await db.run('DELETE FROM import_batches WHERE id = ?', [id]);
}

export async function hasFileHash(
  db: AppDatabase,
  source: TradeSource,
  fileHash: string
): Promise<boolean> {
  const rows = await db.all<{ id: number }>(
    'SELECT id FROM import_batches WHERE source = ? AND file_hash = ? LIMIT 1',
    [source, fileHash]
  );
  return rows.length > 0;
}/** 清空交易与导入记录（默认保留分类规则与商户记忆） */
export async function clearData(
  db: AppDatabase,
  options: { keepRules?: boolean } = {}
): Promise<void> {
  await db.run('DELETE FROM transactions');
  await db.run('DELETE FROM import_batches');
  if (options.keepRules === false) {
    await db.run('DELETE FROM merchant_rules');
    await db.run('DELETE FROM category_rules');
  }
}

const CSV_HEADER = [
  '交易时间',
  '来源',
  '交易对方',
  '商品说明',
  '方向',
  '金额(元)',
  '分类',
  '子分类',
  '支付方式',
  '状态',
  '订单号',
  '镜像',
  '备注',
];

/** 导出全部交易为 CSV 字符串（含表头与转义） */
export async function exportTransactionsCsv(db: AppDatabase): Promise<string> {
  const rows = await listTransactions(db);
  const lines = rows.map((r) =>
    [
      r.tradeTime,
      r.source,
      r.counterparty,
      r.description,
      r.direction,
      (r.amountCents / 100).toFixed(2),
      r.category ?? '',
      r.subcategory ?? '',
      r.payMethod,
      r.status,
      r.sourceTradeNo ?? '',
      r.isMirror ? '是' : '',
      r.note,
    ]
      .map((value) => csvEscape(value))
      .join(',')
  );
  return [CSV_HEADER.join(','), ...lines].join('\n');
}
