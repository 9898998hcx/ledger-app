/**
 * 支付宝 CSV / Excel 解析器：
 * - 文件前部可能包含约 24 行元数据，自动跳过（前 40 行内定位表头）；
 * - 按表头名称匹配列，兼容「交易时间 / 交易创建时间 / 付款时间」等列名差异；
 * - 编码由上层 decodeCsvBytes 处理（UTF-8 / GBK）。
 */

import { parseCsv } from '../csv';
import { normalizeDateTime } from '../date';
import { hashString } from '../hash';
import { parseAmountToCents } from '../money';
import type { Direction, NewTransaction } from '../types';
import { findColumn } from './columns';
import type { ParseIssue, ParseResult } from './wechat';

const SKIP_STATUS = /交易关闭|交易失败|等待付款/;

const TIME_HEADERS = ['交易时间', '交易创建时间', '付款时间', '交易日期', '记录时间', '日期', '时间'];
const AMOUNT_HEADERS: (string | RegExp)[] = [/^金额/, /^交易金额/];
const DIR_HEADERS = ['收/支', '收支', '收支类型', '类型', '交易类型'];

export function isAlipayHeaderRow(cells: string[]): boolean {
  const header = cells.map((c) => c.trim());
  return (
    findColumn(header, TIME_HEADERS) >= 0 && findColumn(header, AMOUNT_HEADERS) >= 0
  );
}

export function parseAlipayRows(rows: string[][]): ParseResult {
  // 元数据行在前，表头可能出现在前 40 行内
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (isAlipayHeaderRow(rows[i])) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      records: [],
      issues: [
        {
          rowNumber: 0,
          message:
            '未找到表头：需要包含「交易时间/交易创建时间/记录时间」和「金额」列（前 40 行内的元数据会自动跳过）',
        },
      ],
      totalRows: 0,
    };
  }

  const header = rows[headerIdx].map((c) => c.trim());
  const colTime = findColumn(header, TIME_HEADERS);
  const colCategory = findColumn(header, ['交易分类', '分类']);
  const colCp = findColumn(header, ['交易对方', '对方', '商户', '商家']);
  const colDesc = findColumn(header, ['商品说明', '商品名称', '备注', '摘要', '说明']);
  const colDir = findColumn(header, DIR_HEADERS);
  const colAmount = findColumn(header, AMOUNT_HEADERS);
  const colPay = findColumn(header, ['收/付款方式', '付款方式', '支付方式', '账户']);
  const colStatus = findColumn(header, ['交易状态', '当前状态', '状态']);
  const colTradeNo = findColumn(header, ['交易订单号', '交易号', '订单号']);

  const missing: string[] = [];
  if (colTime < 0) missing.push('交易时间');
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
    const alipayCategory = get(colCategory);
    const remark = get(colDesc);

    const tradeTime = normalizeDateTime(rawTime);
    if (!tradeTime) {
      issues.push({ rowNumber, message: `交易时间无法解析：「${rawTime}」` });
      continue;
    }

    if (colStatus >= 0 && SKIP_STATUS.test(rawStatus)) {
      issues.push({ rowNumber, message: `已跳过（状态：${rawStatus}）` });
      continue;
    }

    // 兼容「1，098.92」这类全角逗号金额
    const amountText = rawAmount.replace(/[，,]/g, '').replace(/[¥￥\s]/g, '');
    const amountCents = parseAmountToCents(amountText.replace(/^-/, ''));
    if (amountCents == null) {
      issues.push({ rowNumber, message: `金额无法解析：「${rawAmount}」` });
      continue;
    }

    let direction: Direction;
    const dir = rawDir.trim();
    if (dir.includes('收入')) direction = 'income';
    else if (dir.includes('支出')) direction = 'expense';
    else if (dir) direction = 'neutral';
    else if (/^-/.test(amountText)) direction = 'expense';
    else direction = 'income';

    // 记账本格式：退款行常为「不计收支 + 分类=退款」，统一归入收入/退款
    const refund = /退款/.test(alipayCategory) || /^退款/.test(remark);
    if (refund && direction === 'neutral') direction = 'income';

    const status = rawStatus || (refund ? '退款' : '记账本');
    const refundIncome = direction === 'income' && (refund || /退款/.test(rawStatus));

    records.push({
      source: 'alipay',
      sourceTradeNo: get(colTradeNo) || null,
      tradeTime,
      counterparty: get(colCp) || remark,
      description: remark,
      direction,
      amountCents,
      payMethod: get(colPay),
      status,
      category: refundIncome ? '退款' : null,
      subcategory: null,
      dedupKey: null,
      rawHash: hashString(row.join('\u0001')),
      note: alipayCategory ? `支付宝分类：${alipayCategory}` : '',
    });
  }

  return { records, issues, totalRows };
}

export function parseAlipayCsv(content: string): ParseResult {
  return parseAlipayRows(parseCsv(content));
}

const DATE_RE = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?/;
const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const AMOUNT_RE = /(?:^|[\s|,;])([-+]?\s?[¥￥]?\s?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?=$|[\s|,;])/;
const TRADE_NO_RE = /\b\d{15,}\b/;
const STATUS_WORDS =
  /交易关闭|已退款|退款成功|已全额退款|部分退款|交易失败|等待付款|交易成功|等待买家付款|已付款/;

/** 支付宝账单 PDF 文本解析：逐行识别日期、金额、收/支 */
export function parseAlipayText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const records: NewTransaction[] = [];
  const issues: ParseIssue[] = [];
  let totalRows = 0;

  // 有表头则从表头之后开始，否则逐行尝试
  let start = 0;
  let hasHeader = false;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    if (/交易时间/.test(lines[i]) && /收\s*\/\s*支|收支|金额/.test(lines[i])) {
      start = i + 1;
      hasHeader = true;
      break;
    }
  }

  for (let index = start; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw) continue;

    const dateMatch = raw.match(DATE_RE);
    if (!dateMatch) continue;

    const afterDate = raw.slice((dateMatch.index ?? 0) + dateMatch[0].length);
    const timeMatch = afterDate.match(TIME_RE);
    const timeStr = timeMatch ? timeMatch[0] : '';
    const base = timeMatch ? afterDate.replace(timeMatch[0], ' ') : afterDate;

    const amountMatch = base.match(AMOUNT_RE);
    if (!amountMatch) {
      if (hasHeader) {
        totalRows++;
        issues.push({ rowNumber: index + 1, message: '未找到金额（需要两位小数）' });
      }
      continue;
    }

    totalRows++;
    const rowNumber = index + 1;
    const rawAmount = amountMatch[1].trim();
    const unsigned = rawAmount.replace(/[-+]/g, '').replace(/[¥￥\s,]/g, '');
    const amountCents = parseAmountToCents(unsigned);
    if (amountCents == null) {
      issues.push({ rowNumber, message: `金额无法解析：「${rawAmount}」` });
      continue;
    }

    const tradeTime = normalizeDateTime(`${dateMatch[0]} ${timeStr || '00:00:00'}`);
    if (!tradeTime) {
      issues.push({ rowNumber, message: `交易时间无法解析：「${dateMatch[0]}」` });
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
    } else if (/不计收支|其他/.test(raw)) {
      direction = 'neutral';
    } else {
      direction = 'income';
    }

    const tradeNoMatch = raw.match(TRADE_NO_RE);
    const description = base
      .replace(amountMatch[0], ' ')
      .replace(/收入|支出|不计收支|其他/g, ' ')
      .replace(STATUS_WORDS, ' ')
      .replace(TRADE_NO_RE, ' ')
      .replace(/[\s|,;]+/g, ' ')
      .trim();

    records.push({
      source: 'alipay',
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
