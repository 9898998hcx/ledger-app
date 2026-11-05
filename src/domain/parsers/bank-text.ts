/**
 * 银行账单文本解析器（供 PDF 文本提取 / 图片 OCR 结果复用）：
 * 逐行识别「日期 + 金额 + 摘要」，按正负号或收支关键词判断方向。
 */

import { normalizeDateTime } from '../date';
import { hashString } from '../hash';
import { parseAmountToCents } from '../money';
import type { Direction, NewTransaction } from '../types';
import type { ParseIssue, ParseResult } from './wechat';

const DATE_RE = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?/;
const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const AMOUNT_RE = /(?:^|[\s|,;])([-+]?\s?[¥￥]?\s?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})(?=$|[\s|,;])/;

const INCOME_WORDS = /收入|存入|转入|汇入|利息|退款|工资|贷方|贷/;
const EXPENSE_WORDS = /支出|消费|转出|取现|扣款|手续费|还款|借方|借/;

export function parseBankText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const records: NewTransaction[] = [];
  const issues: ParseIssue[] = [];
  let totalRows = 0;

  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;

    const dateMatch = raw.match(DATE_RE);
    if (!dateMatch) return; // 表头 / 说明行直接忽略

    totalRows++;
    const rowNumber = index + 1;
    const dateStr = dateMatch[0];
    const afterDate = raw.slice((dateMatch.index ?? 0) + dateStr.length);

    const timeMatch = afterDate.match(TIME_RE);
    const timeStr = timeMatch ? timeMatch[0] : '';
    const base = timeMatch ? afterDate.replace(timeMatch[0], ' ') : afterDate;

    const amountMatch = base.match(AMOUNT_RE);
    if (!amountMatch) {
      issues.push({ rowNumber, message: '未找到金额（需要两位小数，如 -23.50）' });
      return;
    }
    const rawAmount = amountMatch[1].trim();
    const unsigned = rawAmount.replace(/[-+]/g, '').replace(/[¥￥\s,]/g, '');
    const amountCents = parseAmountToCents(unsigned);
    if (amountCents == null) {
      issues.push({ rowNumber, message: `金额无法解析：「${rawAmount}」` });
      return;
    }

    const tradeTime = normalizeDateTime(`${dateStr} ${timeStr || '00:00:00'}`);
    if (!tradeTime) {
      issues.push({ rowNumber, message: `交易日期无法解析：「${dateStr}」` });
      return;
    }

    const hasIncomeWord = INCOME_WORDS.test(raw);
    const hasExpenseWord = EXPENSE_WORDS.test(raw);

    let direction: Direction;
    if (rawAmount.startsWith('-')) {
      direction = 'expense';
    } else if (rawAmount.startsWith('+')) {
      direction = 'income';
    } else if (hasIncomeWord && !hasExpenseWord) {
      direction = 'income';
    } else if (hasExpenseWord && !hasIncomeWord) {
      direction = 'expense';
    } else if (hasIncomeWord && hasExpenseWord) {
      issues.push({ rowNumber, message: '收支方向不明确（同时出现收入/支出关键词）' });
      return;
    } else {
      direction = 'income';
    }

    const description = base
      .replace(amountMatch[0], ' ')
      .replace(/[\s|,;]+/g, ' ')
      .trim();

    records.push({
      source: 'bank',
      sourceTradeNo: null,
      tradeTime,
      counterparty: description || '未提供对方信息',
      description: '',
      direction,
      amountCents,
      payMethod: '',
      status: 'PDF/OCR 导入',
      category: direction === 'income' && /退款/.test(description) ? '退款' : null,
      subcategory: null,
      dedupKey: null,
      rawHash: hashString(raw),
      note: '',
    });
  });

  return { records, issues, totalRows };
}
