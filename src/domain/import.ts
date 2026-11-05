/**
 * 导入编排：解析 → 文件哈希查重（同文件）→ 逐条去重（订单号/raw_hash）→ 写导入批次。
 */

import type { AppDatabase } from '../data/db/database';
import {
  deleteImportBatch,
  findDedupCandidates,
  findImportBatchByHash,
  insertImportBatch,
  insertTransaction,
  listCategoryRules,
  listMerchantRules,
  markTransactionMirror,
  transactionExists,
} from '../data/repository';
import { buildDedupKey, isSelfTransfer, matchExisting } from './dedup';
import { classify } from './classify';
import { decodeCsvBytes } from './encoding';
import { hashString } from './hash';
import { parseAlipayCsv, parseAlipayRows, parseAlipayText } from './parsers/alipay';
import { parseBankCsv, parseBankRows } from './parsers/bank';
import { parseBankText } from './parsers/bank-text';
import { parseWechatCsv, parseWechatRows, parseWechatText, type ParseResult } from './parsers/wechat';
import type { Direction, TradeSource } from './types';

export interface ImportSummary {
  source: TradeSource;
  fileName: string;
  fileHash: string;
  totalRows: number;
  inserted: number;
  skipped: number;
  duplicateFile: boolean;
  errors: string[];
  batchId: number | null;
}

/** 归一化内容再哈希：忽略 BOM / 换行符差异，同一文件不同导出不应触发重复导入 */
function normalizeContent(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
}

function duplicateSummary(source: TradeSource, fileName: string, fileHash: string): ImportSummary {
  return {
    source,
    fileName,
    fileHash,
    totalRows: 0,
    inserted: 0,
    skipped: 0,
    duplicateFile: true,
    errors: [
      '该文件已导入过（文件哈希重复），本次未做任何改动。如需重新导入（例如退款分类更新），请先在「设置 → 清空全部交易」后再导入。',
    ],
    batchId: null,
  };
}

/**
 * 检查同文件是否已成功导入：
 * - 已成功（insertedRows > 0）→ 返回重复结果；
 * - 上次导入失败（0 行）→ 删除失败批次并允许重试（否则失败批次会永久阻止重导）。
 */
async function existingBatchResult(
  db: AppDatabase,
  source: TradeSource,
  fileName: string,
  fileHash: string
): Promise<ImportSummary | null> {
  const existing = await findImportBatchByHash(db, source, fileHash);
  if (!existing) return null;
  if (existing.insertedRows > 0) {
    return duplicateSummary(source, fileName, fileHash);
  }
  await deleteImportBatch(db, existing.id);
  return null;
}

async function importParsed(
  db: AppDatabase,
  source: TradeSource,
  fileName: string,
  fileHash: string,
  parsed: ParseResult
): Promise<ImportSummary> {
  const errors = parsed.issues.map((i) => `第 ${i.rowNumber} 行：${i.message}`);
  let inserted = 0;

  // 分类规则与商户记忆只加载一次
  const categoryRules = await listCategoryRules(db);
  const merchantRules = await listMerchantRules(db);

  // 自己名下账户关键词（M6 设置页可配置；默认空 = 不启用自动识别）
  const ownAccountKeywords: string[] = [];

  for (const record of parsed.records) {
    if (await transactionExists(db, source, record.sourceTradeNo, record.rawHash)) {
      errors.push(
        `跳过重复交易：${record.tradeTime} ${record.counterparty} ${(record.amountCents / 100).toFixed(2)}`
      );
      continue;
    }

    const direction: Direction = isSelfTransfer(
      record.counterparty,
      record.description,
      ownAccountKeywords
    )
      ? 'neutral'
      : record.direction;
    const normalized = { ...record, direction };

    // 跨平台去重：同金额、同方向、±1 天、商户相似
    const candidates = await findDedupCandidates(db, direction, record.amountCents, record.tradeTime);
    let isMirror = false;
    let skip = false;
    let mirroredId: number | null = null;
    for (const candidate of candidates) {
      const match = matchExisting(normalized, candidate);
      if (match === 'duplicate') {
        skip = true;
        break;
      }
      if (match === 'newMirror') {
        isMirror = true;
        break;
      }
      if (match === 'newPrimary') {
        mirroredId = candidate.id;
        break;
      }
    }
    if (skip) {
      errors.push(
        `跳过重复交易：${record.tradeTime} ${record.counterparty} ${(record.amountCents / 100).toFixed(2)}`
      );
      continue;
    }

    const dedupKey = buildDedupKey(normalized);
    if (mirroredId != null) {
      await markTransactionMirror(db, mirroredId, dedupKey);
    }
    const classified = normalized.category
      ? { category: normalized.category, subcategory: normalized.subcategory }
      : classify(normalized, categoryRules, merchantRules);
    await insertTransaction(db, {
      ...normalized,
      category: classified.category,
      subcategory: classified.subcategory,
      dedupKey,
      isMirror,
    });
    inserted++;
  }

  const skipped = Math.max(parsed.totalRows - inserted, 0);
  const batchId = await insertImportBatch(db, {
    source,
    fileName,
    fileHash,
    importedAt: new Date().toISOString(),
    totalRows: parsed.totalRows,
    insertedRows: inserted,
    skippedRows: skipped,
    errorMessage: errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
  });

  return {
    source,
    fileName,
    fileHash,
    totalRows: parsed.totalRows,
    inserted,
    skipped,
    duplicateFile: false,
    errors,
    batchId,
  };
}

export async function importWechatFile(
  db: AppDatabase,
  fileName: string,
  content: string
): Promise<ImportSummary> {
  const fileHash = hashString(normalizeContent(content));
  const existing = await existingBatchResult(db, 'wechat', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'wechat', fileName, fileHash, parseWechatCsv(content));
}

/** 微信账单 Excel（首个工作表行数据）导入 */
export async function importWechatRows(
  db: AppDatabase,
  fileName: string,
  rows: string[][]
): Promise<ImportSummary> {
  const content = rows.map((row) => row.join('\u0001')).join('\n');
  const fileHash = hashString(normalizeContent(content));
  const existing = await existingBatchResult(db, 'wechat', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'wechat', fileName, fileHash, parseWechatRows(rows));
}

/** 微信账单 PDF（文本）导入 */
export async function importWechatText(
  db: AppDatabase,
  fileName: string,
  text: string
): Promise<ImportSummary> {
  const fileHash = hashString(normalizeContent(text));
  const existing = await existingBatchResult(db, 'wechat', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'wechat', fileName, fileHash, parseWechatText(text));
}

export async function importAlipayFile(
  db: AppDatabase,
  fileName: string,
  bytes: Uint8Array
): Promise<ImportSummary> {
  const { text } = decodeCsvBytes(bytes);
  const fileHash = hashString(normalizeContent(text));
  const existing = await existingBatchResult(db, 'alipay', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'alipay', fileName, fileHash, parseAlipayCsv(text));
}

/** 支付宝 Excel（行数据）导入 */
export async function importAlipayRows(
  db: AppDatabase,
  fileName: string,
  rows: string[][]
): Promise<ImportSummary> {
  const content = rows.map((row) => row.join('\u0001')).join('\n');
  const fileHash = hashString(normalizeContent(content));
  const existing = await existingBatchResult(db, 'alipay', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'alipay', fileName, fileHash, parseAlipayRows(rows));
}

/** 支付宝 PDF（文本）导入 */
export async function importAlipayText(
  db: AppDatabase,
  fileName: string,
  text: string
): Promise<ImportSummary> {
  const fileHash = hashString(normalizeContent(text));
  const existing = await existingBatchResult(db, 'alipay', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'alipay', fileName, fileHash, parseAlipayText(text));
}

/** 银行 Excel（行数据）导入 */
export async function importBankRows(
  db: AppDatabase,
  fileName: string,
  rows: string[][]
): Promise<ImportSummary> {
  const content = rows.map((row) => row.join('\u0001')).join('\n');
  const fileHash = hashString(normalizeContent(content));
  const existing = await existingBatchResult(db, 'bank', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'bank', fileName, fileHash, parseBankRows(rows));
}

export async function importBankFile(
  db: AppDatabase,
  fileName: string,
  bytes: Uint8Array
): Promise<ImportSummary> {
  const { text } = decodeCsvBytes(bytes);
  const fileHash = hashString(normalizeContent(text));
  const existing = await existingBatchResult(db, 'bank', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'bank', fileName, fileHash, parseBankCsv(text));
}

/** 银行账单文本（PDF 提取 / 图片 OCR 结果）导入 */
export async function importBankText(
  db: AppDatabase,
  fileName: string,
  text: string
): Promise<ImportSummary> {
  const fileHash = hashString(normalizeContent(text));
  const existing = await existingBatchResult(db, 'bank', fileName, fileHash);
  if (existing) return existing;
  return importParsed(db, 'bank', fileName, fileHash, parseBankText(text));
}
