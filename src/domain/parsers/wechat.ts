/**
 * 微信账单解析器：支持 CSV / Excel（行数据）/ PDF（文本）三种来源。
 * 兼容真实导出文件：表头前可能有多行说明、表头名称存在变体、可能缺少「收/支」列。
 * 状态为交易关闭/已退款等记录会被跳过并记入错误清单。
 */

import { parseCsv } from '../csv';
import { normalizeDateTime } from '../date';
import { hashString } from '../hash';
import { parseAmountToCents } from '../money';
import type { Direction, NewTransaction } from '../types';
import { findColumn } from './columns';

export interface ParseIssue {
  rowNumber: number;
  message: string;
}

export interface ParseResult {
  records: NewTransaction[];
  issues: ParseIssue[];
  totalRows: number;
}

const SKIP_STATUS = /交易关闭|交易失败|已撤销/;
const STATUS_WORDS = /交易关闭|已退款|退款成功|已撤销|交易失败|支付成功|已存入零钱|对方已收钱|已收钱|已完成/;
const DATE_RE = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?/;
const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const AMOUNT_RE = /(?:^|[\s|,;])([-+]?\s?[¥￥]?\s?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?=$|[\s|,;])/;
const TRADE_NO_RE = /\bWX[0-9A-Za-z]{6,}\b/;

// 真实导出文件中的列名可能不同（如「日期」「商户」「类型」）
const TIME_HEADERS = ['交易时间', '交易日期', '记账时间', '交易创建时间', '日期', '时间'];
const AMOUNT_HEADERS: (string | RegExp)[] = [/^金额/, /^交易金额/];
const DIR_HEADERS = ['收/支', '收支', '类型', '交易类型'];
const CP_HEADERS = ['交易对方', '对方', '商户', '商家', '交易对象', '对方名称'];
const DESC_HEADERS = ['商品', '商品说明', '备注', '摘要', '说明'];
const PAY_HEADERS = ['支付方式', '收/付款方式', '付款方式'];
const STATUS_HEADERS = ['当前状态', '交易状态', '状态'];
const TRADE_NO_HEADERS = ['交易单号', '交易订单号', '订单号'];

export function isWechatHeaderRow(cells: string[]): boolean {
  const header = cells.map((c) => c.trim());
  return findColumn(header, TIME_HEADERS) >= 0 && findColumn(header, AMOUNT_HEADERS) >= 0;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (isWechatHeaderRow(rows[i])) return i;
  }
  return -1;
}

function mapDirection(rawDir: string, rawAmount: string): Direction {
  const dir = rawDir.trim();
  if (dir.includes('收入')) return 'income';
  if (dir.includes('支出')) return 'expense';
  if (dir) return 'neutral';
  if (/^-/.test(rawAmount.trim())) return 'expense';
  return 'income';
}

export function parseWechatRows(rows: string[][]): ParseResult {
  const headerIdx = findHeaderRow(rows);

  if (headerIdx < 0) {
    return {
      records: [],
      issues: [
        {
          rowNumber: 0,
          message: '未找到表头：需要包含「交易时间/日期」和「金额」列（前 40 行内的说明行会自动跳过）',
        },
      ],
      totalRows: 0,
    };
  }

  const header = rows[headerIdx].map((c) => c.trim());
  const colTime = findColumn(header, TIME_HEADERS);
  const colCp = findColumn(header, CP_HEADERS);
  const colDesc = findColumn(header, DESC_HEADERS);
  const colDir = findColumn(header, DIR_HEADERS);
  const colAmount = findColumn(header, AMOUNT_HEADERS);
  const colPay = findColumn(header, PAY_HEADERS);
  const colStatus = findColumn(header, STATUS_HEADERS);
  const colTradeNo = findColumn(header, TRADE_NO_HEADERS);

  const missing: string[] = [];
  if (colTime < 0) missing.push('交易时间/日期');
  if (colAmount < 0) missing.push('金额');
  if (colTime < 0 || colAmount < 0) {
    return {
      records: [],
      issues: [{ rowNumber: headerIdx + 1, message: `表头缺少必要列：${missing.join('、')}` }],
      totalRows: 0,
    };
  }

  const records: NewTransaction[] = [];
  const issues: ParseIssue[] = [];
  let totalRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => c.trim() === '')) continue;
    totalRows++;
    const rowNumber = i + 1;

    const get = (idx: number): string => (idx >= 0 ? (row[idx] ?? '').trim() : '');

    const rawTime = get(colTime);
    const rawAmount = get(colAmount);
    const rawDir = get(colDir);
    const rawStatus = get(colStatus);

    const tradeTime = normalizeDateTime(rawTime);
    if (!tradeTime) {
      issues.push({ rowNumber, message: `交易时间无法解析：「${rawTime}」` });
      continue;
    }

    if (colStatus >= 0 && SKIP_STATUS.test(rawStatus)) {
      issues.push({ rowNumber, message: `已跳过（状态：${rawStatus}）` });
      continue;
    }

    const amountCents = parseAmountToCents(rawAmount.replace(/^-/, ''));
    if (amountCents == null) {
      issues.push({ rowNumber, message: `金额无法解析：「${rawAmount}」` });
      continue;
    }

    const direction = mapDirection(rawDir, rawAmount);

    records.push({
      source: 'wechat',
      sourceTradeNo: get(colTradeNo) || null,
      tradeTime,
      counterparty: get(colCp) || get(colDesc),
      description: get(colDesc),
      direction,
      amountCents,
      payMethod: get(colPay),
      status: rawStatus,
      category: direction === 'income' && /退款/.test(rawStatus) ? '退款' : null,
      subcategory: null,
      dedupKey: null,
      rawHash: hashString(row.join('\u0001')),
      note: '',
    });
  }

  return { records, issues, totalRows };
}

export function parseWechatCsv(content: string): ParseResult {
  return parseWechatRows(parseCsv(content));
}

/** 微信账单 PDF 文本解析：逐行识别日期、金额、收/支 */
export function parseWechatText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const records: NewTransaction[] = [];
  const issues: ParseIssue[] = [];
  let totalRows = 0;

  // 有表头则从表头之后开始（跳过前部说明），否则逐行尝试
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    if (/交易时间/.test(lines[i]) && /收\s*\/\s*支|收支|金额/.test(lines[i])) {
      start = i + 1;
      break;
    }
  }

  for (let index = start; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw) continue;

    const dateMatch = raw.match(DATE_RE);
    if (!dateMatch) continue;

    totalRows++;
    const rowNumber = index + 1;
    const dateStr = dateMatch[0];
    const afterDate = raw.slice((dateMatch.index ?? 0) + dateStr.length);
    const timeMatch = afterDate.match(TIME_RE);
    const timeStr = timeMatch ? timeMatch[0] : '';
    const base = timeMatch ? afterDate.replace(timeMatch[0], ' ') : afterDate;

    const amountMatch = base.match(AMOUNT_RE);
    if (!amountMatch) {
      issues.push({ rowNumber, message: '未找到金额（需要两位小数）' });
      continue;
    }
    const rawAmount = amountMatch[1].trim();
    const unsigned = rawAmount.replace(/[-+]/g, '').replace(/[¥￥\s,]/g, '');
    const amountCents = parseAmountToCents(unsigned);
    if (amountCents == null) {
      issues.push({ rowNumber, message: `金额无法解析：「${rawAmount}」` });
      continue;
    }

    const tradeTime = normalizeDateTime(`${dateStr} ${timeStr || '00:00:00'}`);
    if (!tradeTime) {
      issues.push({ rowNumber, message: `交易时间无法解析：「${dateStr}」` });
      continue;
    }

    const statusMatch = raw.match(STATUS_WORDS);
    const status = statusMatch ? statusMatch[0] : '';
    if (SKIP_STATUS.test(status)) {
      issues.push({ rowNumber, message: `已跳过（状态：${status}）` });
      continue;
    }

    const hasIncome = raw.includes('收入');
    const hasExpense = raw.includes('支出');

    let direction: Direction;
    if (rawAmount.startsWith('-')) {
      direction = 'expense';
    } else if (hasIncome && hasExpense) {
      issues.push({ rowNumber, message: '收/支方向不明确（同时出现收入/支出）' });
      continue;
    } else if (hasIncome) {
      direction = 'income';
    } else if (hasExpense) {
      direction = 'expense';
    } else if (raw.includes('其他')) {
      direction = 'neutral';
    } else {
      direction = 'income';
    }

    const tradeNoMatch = raw.match(TRADE_NO_RE);
    const description = base
      .replace(amountMatch[0], ' ')
      .replace(/收入|支出|其他/g, ' ')
      .replace(STATUS_WORDS, ' ')
      .replace(TRADE_NO_RE, ' ')
      .replace(/[\s|,;]+/g, ' ')
      .trim();

    records.push({
      source: 'wechat',
      sourceTradeNo: tradeNoMatch ? tradeNoMatch[0] : null,
      tradeTime,
      counterparty: description || '未提供对方信息',
      description: '',
      direction,
      amountCents,
      payMethod: '',
      status,
      category: direction === 'income' && /退款/.test(status) ? '退款' : null,
      subcategory: null,
      dedupKey: null,
      rawHash: hashString(raw),
      note: '',
    });
  }

  return { records, issues, totalRows };
}
