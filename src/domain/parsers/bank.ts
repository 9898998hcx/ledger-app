/**
 * 银行 CSV / Excel 解析器：兼容常见导出格式
 * - 收入/支出分列（收入金额 + 支出金额）
 * - 金额 + 借贷标志（借 = 支出，贷 = 收入）
 * - 单列金额带符号（负 = 支出，正 = 收入）
 * 支持前部元数据行（前 40 行内定位表头）、按表头名称匹配列。
 */

import { parseCsv } from '../csv';
import { normalizeDateTime } from '../date';
import { hashString } from '../hash';
import { parseAmountToCents } from '../money';
import type { Direction, NewTransaction } from '../types';
import { findColumn } from './columns';
import type { ParseIssue, ParseResult } from './wechat';

const DATE_HEADERS = ['交易日期', '交易时间', '记账日期', '日期'];
const AMOUNT_HEADERS: (string | RegExp)[] = [/^交易金额/, /^金额/, /^发生额/, /^收入/, /^支出/, /^贷方/, /^借方/];

export function isBankHeaderRow(cells: string[]): boolean {
  const header = cells.map((c) => c.trim());
  return findColumn(header, DATE_HEADERS) >= 0 && findColumn(header, AMOUNT_HEADERS) >= 0;
}

export function parseBankRows(rows: string[][]): ParseResult {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map((c) => c.trim());
    const hasDate = cells.some((c) => /^(交易日期|交易时间|记账日期|日期)$/.test(c));
    const hasParty = cells.some((c) => /摘要|对方户名|交易对方|对方名称|用途/.test(c));
    const hasAmount = cells.some((c) => /^交易金额|^金额|^发生额|^收入|^支出|^贷方|^借方/.test(c));
    if (hasDate && hasParty && hasAmount) {
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
          message: '未找到银行流水表头（需要包含日期、摘要/对方户名、金额列；前 40 行内的元数据会自动跳过）',
        },
      ],
      totalRows: 0,
    };
  }

  const header = rows[headerIdx].map((c) => c.trim());
  const colDate = findColumn(header, ['交易日期', '记账日期', '日期', '交易时间']);
  const colTime = findColumn(header, ['交易时间']);
  const colSummary = findColumn(header, ['摘要', '交易摘要', '用途', '交易用途', '备注']);
  const colParty = findColumn(header, [
    '对方户名',
    '对方名称',
    '交易对手',
    '对方账号',
    '对方账号与户名',
    '对方账户与户名',
    '对方账号及户名',
    '对方账户名',
    '收款人',
  ]);
  const colPlace = findColumn(header, ['交易地点/附言', '交易地点', '附言', '交易备注', '备注']);
  const colChannel = findColumn(header, ['交易渠道', '渠道', '交易网点', '交易方式']);
  const colAmount = findColumn(header, [/^交易金额/, /^金额/, /^发生额/]);
  const colIncome = findColumn(header, ['收入金额', '收入', '贷方金额', '贷方发生额']);
  const colExpense = findColumn(header, ['支出金额', '支出', '借方金额', '借方发生额']);
  const colFlag = findColumn(header, ['借贷标志', '收付标志', '借贷', '收/支', '收支']);
  const colTradeNo = findColumn(header, ['交易流水号', '流水号', '凭证号', '交易参考号']);
  const colStatus = findColumn(header, ['交易状态', '状态']);

  const missing: string[] = [];
  if (colDate < 0) missing.push('交易日期');
  if (colParty < 0 && colSummary < 0) missing.push('摘要/对方户名');
  if (colAmount < 0 && colIncome < 0 && colExpense < 0) missing.push('金额');
  if (missing.length > 0) {
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

    const rawDate = get(colDate);
    const rawTime = colTime >= 0 ? get(colTime) : '';
    let tradeTime: string | null = null;
    if (rawDate) {
      const hasClock = /\d{1,2}:\d{2}/.test(rawDate);
      const combined = hasClock ? rawDate : `${rawDate} ${rawTime || '00:00:00'}`;
      tradeTime = normalizeDateTime(combined);
    }
    if (!tradeTime) {
      issues.push({
        rowNumber,
        message: `交易日期无法解析：「${rawDate}${rawTime ? ' ' + rawTime : ''}」`,
      });
      continue;
    }

    const summary = get(colSummary);
    const place = get(colPlace);
    const party = get(colParty);
    const counterparty = party || place || summary;
    const description = [summary, place, party].filter(Boolean).join(' ').trim();

    let direction: Direction = 'neutral';
    let amountCents: number | null = null;
    let amountRaw = '';

    if (colIncome >= 0 || colExpense >= 0) {
      const incomeRaw = get(colIncome);
      const expenseRaw = get(colExpense);
      const income = colIncome >= 0 ? parseAmountToCents(incomeRaw) : null;
      const expense = colExpense >= 0 ? parseAmountToCents(expenseRaw) : null;
      if (expense != null && expense > 0) {
        direction = 'expense';
        amountCents = expense;
        amountRaw = expenseRaw;
      } else if (income != null && income > 0) {
        direction = 'income';
        amountCents = income;
        amountRaw = incomeRaw;
      } else if (expense === 0 || income === 0) {
        direction = 'neutral';
        amountCents = 0;
        amountRaw = expenseRaw || incomeRaw;
      } else {
        amountCents = null;
        amountRaw = expenseRaw || incomeRaw;
      }
    } else {
      const rawAmount = get(colAmount);
      const flag = get(colFlag);
      amountRaw = rawAmount;
      const isNegative = /^-/.test(rawAmount.trim());
      const unsigned = rawAmount.trim().replace(/^[-+]/, '').replace(/^[（(]/, '').replace(/[）)]$/, '');
      amountCents = parseAmountToCents(unsigned);
      if (amountCents != null) {
        if (flag) {
          if (/借|支出/.test(flag)) direction = 'expense';
          else if (/贷|收入/.test(flag)) direction = 'income';
          else direction = 'neutral';
        } else {
          direction = isNegative ? 'expense' : 'income';
        }
      }
    }

    if (amountCents == null) {
      issues.push({ rowNumber, message: `金额无法解析：「${amountRaw}」` });
      continue;
    }

    const status = get(colStatus);
    const refundIncome = direction === 'income' && /退款/.test(`${status} ${summary} ${party}`);

    records.push({
      source: 'bank',
      sourceTradeNo: get(colTradeNo) || null,
      tradeTime,
      counterparty,
      description,
      direction,
      amountCents,
      payMethod: get(colChannel) || place,
      status,
      category: refundIncome ? '退款' : null,
      subcategory: null,
      dedupKey: null,
      rawHash: hashString(row.join('\u0001')),
      note: '',
    });
  }

  return { records, issues, totalRows };
}

export function parseBankCsv(content: string): ParseResult {
  return parseBankRows(parseCsv(content));
}
