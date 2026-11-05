/**
 * 数据库结构（SQLite DDL）
 * 金额一律整数分（amount_cents），日期为 "YYYY-MM-DD HH:mm:ss" 本地 ISO 字符串。
 */

import type { AppDatabase } from './database';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('wechat', 'alipay', 'bank')),
  source_trade_no TEXT,
  trade_time TEXT NOT NULL,
  counterparty TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'neutral')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  pay_method TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  category TEXT,
  subcategory TEXT,
  dedup_key TEXT,
  raw_hash TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  is_mirror INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_trade_time ON transactions(trade_time);
CREATE INDEX IF NOT EXISTS idx_tx_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_dedup_key ON transactions(dedup_key);
CREATE INDEX IF NOT EXISTS idx_tx_raw_hash ON transactions(raw_hash);
CREATE INDEX IF NOT EXISTS idx_tx_mirror ON transactions(is_mirror);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tx_source_trade_no
  ON transactions(source, source_trade_no) WHERE source_trade_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_batch_source_hash ON import_batches(source, file_hash);

CREATE TABLE IF NOT EXISTS merchant_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subcategory TEXT,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  priority INTEGER NOT NULL DEFAULT 100,
  match_type TEXT NOT NULL CHECK (match_type IN ('keyword', 'regex')),
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rules_priority ON category_rules(priority);
`;

export async function migrate(db: AppDatabase): Promise<void> {
  await db.exec(SCHEMA_SQL);
  // 兼容旧库：补充 is_mirror 列
  const cols = await db.all<{ name: string }>('PRAGMA table_info(transactions)');
  if (!cols.some((c) => c.name === 'is_mirror')) {
    await db.exec('ALTER TABLE transactions ADD COLUMN is_mirror INTEGER NOT NULL DEFAULT 0');
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_tx_mirror ON transactions(is_mirror)');
}
