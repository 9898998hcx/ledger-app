import { describe, it, expect } from 'vitest';
import {
  ALL_MONTHS,
  computeIncomeBreakdown,
  computeMonthlyStats,
  computePeriodTotals,
  computeSourceTotals,
  computeStats,
  computeTopCounterparties,
  computeTopCounterpartiesForPeriod,
  filterByPeriod,
  filterBySource,
  monthsOf,
  monthsOfYear,
  selectIncome,
  yearsOf,
} from '../src/domain/stats';
import type { TransactionRow } from '../src/domain/types';

const row = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  id: 1,
  source: 'wechat',
  sourceTradeNo: null,
  tradeTime: '2026-10-01 10:00:00',
  counterparty: '测试',
  description: '',
  direction: 'expense',
  amountCents: 1000,
  payMethod: '',
  status: '',
  category: '餐饮',
  subcategory: null,
  dedupKey: null,
  rawHash: 'h',
  note: '',
  isMirror: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('月度统计', () => {
  it('排除镜像、中性与其他月份', () => {
    const stats = computeMonthlyStats(
      [
        row({ id: 1, amountCents: 1000, category: '餐饮' }),
        row({ id: 2, amountCents: 2000, category: '交通' }),
        row({ id: 3, amountCents: 500, isMirror: true, category: '餐饮' }),
        row({ id: 4, amountCents: 9999, direction: 'neutral' }),
        row({ id: 5, amountCents: 5000, direction: 'income', category: null }),
        row({ id: 6, tradeTime: '2026-09-30 10:00:00', amountCents: 700 }),
      ],
      '2026-10'
    );
    expect(stats.incomeCents).toBe(5000);
    expect(stats.expenseCents).toBe(3000);
    expect(stats.balanceCents).toBe(2000);
    expect(stats.byCategory).toEqual([
      { category: '交通', totalCents: 2000, count: 1 },
      { category: '餐饮', totalCents: 1000, count: 1 },
    ]);
  });

  it('未分类支出按原始用途展示，不归入「其他」', () => {
    const stats = computeMonthlyStats(
      [row({ category: null, counterparty: '老王面馆', description: '牛肉面', amountCents: 500 })],
      '2026-10'
    );
    expect(stats.byCategory).toEqual([{ category: '牛肉面', totalCents: 500, count: 1 }]);
  });

  it('支出按分类 + 子分类细分', () => {
    const stats = computeMonthlyStats(
      [
        row({ id: 1, category: '餐饮', subcategory: '外卖', amountCents: 1000 }),
        row({ id: 2, category: '餐饮', subcategory: '快餐', amountCents: 500 }),
        row({ id: 3, category: null, subcategory: null, amountCents: 200 }),
      ],
      '2026-10'
    );
    expect(stats.byDetail).toEqual([
      { category: '餐饮', subcategory: '外卖', totalCents: 1000, count: 1 },
      { category: '餐饮', subcategory: '快餐', totalCents: 500, count: 1 },
      { category: '测试', subcategory: null, totalCents: 200, count: 1 },
    ]);
    expect(stats.byCategory.map((c) => c.category)).toEqual(['餐饮', '测试']);
  });

  it('无支出时返回空分类', () => {
    const stats = computeMonthlyStats([row({ direction: 'income', amountCents: 100 })], '2026-10');
    expect(stats.byCategory).toEqual([]);
    expect(stats.expenseCents).toBe(0);
  });
});

describe('月份列表', () => {
  it('倒序去重', () => {
    expect(
      monthsOf([
        row({ tradeTime: '2026-09-01 10:00:00' }),
        row({ tradeTime: '2026-10-02 10:00:00' }),
        row({ tradeTime: '2026-10-03 10:00:00' }),
      ])
    ).toEqual(['2026-10', '2026-09']);
  });
});

describe('年份 / 月份筛选', () => {
  const rows = [
    row({ id: 1, tradeTime: '2026-10-01 10:00:00' }),
    row({ id: 2, tradeTime: '2026-01-15 10:00:00' }),
    row({ id: 3, tradeTime: '2025-12-31 10:00:00' }),
  ];

  it('年份倒序去重', () => {
    expect(yearsOf(rows)).toEqual(['2026', '2025']);
  });

  it('按年份列出月份', () => {
    expect(monthsOfYear(rows, '2026')).toEqual(['01', '10']);
    expect(monthsOfYear(rows, '2025')).toEqual(['12']);
    expect(monthsOfYear(rows, 'all')).toEqual(['01', '10', '12']);
  });

  it('按年 / 月筛选', () => {
    expect(filterByPeriod(rows, '2026', 'all')).toHaveLength(2);
    expect(filterByPeriod(rows, '2026', '10')).toHaveLength(1);
    expect(filterByPeriod(rows, 'all', '12')).toHaveLength(1);
    expect(filterByPeriod(rows, 'all', 'all')).toHaveLength(3);
  });
});

describe('收入页数据', () => {
  it('只包含收入、排除镜像，并支持年份/月份筛选', () => {
    const rows = [
      row({ id: 1, direction: 'income', amountCents: 8888, tradeTime: '2026-10-03 09:00:00' }),
      row({ id: 2, direction: 'income', amountCents: 5000, tradeTime: '2026-01-05 09:00:00' }),
      row({ id: 3, direction: 'expense', amountCents: 1000 }),
      row({ id: 4, direction: 'income', amountCents: 999, isMirror: true }),
      row({ id: 5, direction: 'neutral', amountCents: 500 }),
    ];
    expect(selectIncome(rows)).toHaveLength(2);
    expect(selectIncome(rows, '2026', 'all')).toHaveLength(2);
    expect(selectIncome(rows, '2026', '10')).toHaveLength(1);
    expect(selectIncome(rows, '2025', 'all')).toHaveLength(0);
  });

  it('期间收入/支出合计（排除镜像与中性）', () => {
    const rows = [
      row({ id: 1, direction: 'income', amountCents: 8888 }),
      row({ id: 2, direction: 'expense', amountCents: 1000 }),
      row({ id: 3, direction: 'expense', amountCents: 2000 }),
      row({ id: 4, direction: 'expense', amountCents: 500, isMirror: true }),
      row({ id: 5, direction: 'neutral', amountCents: 300 }),
      row({ id: 6, direction: 'income', amountCents: 100, tradeTime: '2025-12-01 10:00:00' }),
    ];
    expect(computePeriodTotals(rows, '2026', '10')).toEqual({
      incomeCents: 8888,
      expenseCents: 3000,
      balanceCents: 5888,
    });
  });

  it('收入分类细分：分类/子分类 + 未分类按原始用途', () => {
    const rows = [
      row({ id: 1, direction: 'income', category: '人情往来', subcategory: '红包', amountCents: 8888 }),
      row({ id: 2, direction: 'income', category: '退款', amountCents: 1840 }),
      row({
        id: 3,
        direction: 'income',
        category: null,
        counterparty: '某公司',
        description: '工资',
        amountCents: 500000,
      }),
    ];
    expect(computeIncomeBreakdown(rows, '2026', '10')).toEqual([
      { category: '工资', subcategory: null, totalCents: 500000, count: 1 },
      { category: '人情往来', subcategory: '红包', totalCents: 8888, count: 1 },
      { category: '退款', subcategory: null, totalCents: 1840, count: 1 },
    ]);
  });

  it('月份选项固定 1–12 月', () => {
    expect(ALL_MONTHS).toHaveLength(12);
    expect(ALL_MONTHS[10]).toBe('11');
    expect(ALL_MONTHS[11]).toBe('12');
  });
});

describe('渠道（微信 / 支付宝 / 银行）', () => {
  const rows = [
    row({ id: 1, source: 'wechat', direction: 'income', amountCents: 1000 }),
    row({ id: 2, source: 'wechat', direction: 'expense', amountCents: 2000 }),
    row({ id: 3, source: 'alipay', direction: 'expense', amountCents: 3000 }),
    row({ id: 4, source: 'bank', direction: 'income', amountCents: 4000 }),
    row({ id: 5, source: 'bank', direction: 'expense', amountCents: 500, isMirror: true }),
  ];

  it('按来源筛选', () => {
    expect(filterBySource(rows, 'all')).toHaveLength(3); // 全部 = 微信 + 支付宝，不含银行卡
    expect(filterBySource(rows, 'wechat')).toHaveLength(2);
    expect(filterBySource(rows, 'alipay')).toHaveLength(1);
    expect(filterBySource(rows, 'bank')).toHaveLength(2);
  });

  it('各渠道收支合计（排除镜像）', () => {
    expect(computeSourceTotals(rows, '2026', '10')).toEqual([
      { source: 'wechat', incomeCents: 1000, expenseCents: 2000, count: 2 },
      { source: 'alipay', incomeCents: 0, expenseCents: 3000, count: 1 },
      { source: 'bank', incomeCents: 4000, expenseCents: 0, count: 1 },
    ]);
  });

  it('银行流水按钱款去向归入微信/支付宝', () => {
    const data = [
      row({ id: 1, source: 'bank', counterparty: '1000039801/微信红包', description: '微信红包', direction: 'income', amountCents: 1800 }),
      row({ id: 2, source: 'bank', counterparty: '215500690/支付宝支付科技有限公司', description: '支付宝', direction: 'income', amountCents: 8888 }),
      row({ id: 3, source: 'bank', counterparty: '测试商户', description: '消费', direction: 'expense', amountCents: 2350 }),
    ];
    expect(filterBySource(data, 'wechat')).toHaveLength(1);
    expect(filterBySource(data, 'alipay')).toHaveLength(1);
    expect(filterBySource(data, 'bank')).toHaveLength(3);
    expect(filterBySource(data, 'all')).toHaveLength(0); // 全部不含银行卡
    expect(computeSourceTotals(data, '2026', '10')).toEqual([
      { source: 'wechat', incomeCents: 1800, expenseCents: 0, count: 1 },
      { source: 'alipay', incomeCents: 8888, expenseCents: 0, count: 1 },
      { source: 'bank', incomeCents: 0, expenseCents: 2350, count: 1 },
    ]);
  });
});

describe('统计页（年份 + 月份，含全部）', () => {
  const rows = [
    row({ id: 1, tradeTime: '2026-10-01 10:00:00', direction: 'income', amountCents: 5000 }),
    row({
      id: 2,
      tradeTime: '2026-10-02 10:00:00',
      direction: 'expense',
      amountCents: 1000,
      category: '餐饮',
      subcategory: '外卖',
    }),
    row({
      id: 3,
      tradeTime: '2026-01-02 10:00:00',
      direction: 'expense',
      amountCents: 2000,
      category: '交通',
      subcategory: '打车',
    }),
    row({ id: 4, tradeTime: '2025-12-02 10:00:00', direction: 'income', amountCents: 100 }),
  ];

  it('全部 / 按年 / 按年+月统计', () => {
    expect(computeStats(rows, 'all', 'all')).toMatchObject({
      incomeCents: 5100,
      expenseCents: 3000,
      balanceCents: 2100,
    });
    expect(computeStats(rows, '2026', 'all')).toMatchObject({
      incomeCents: 5000,
      expenseCents: 3000,
    });
    expect(computeStats(rows, '2026', '10')).toMatchObject({
      incomeCents: 5000,
      expenseCents: 1000,
    });
    expect(computeStats(rows, '2026', '10').byDetail).toEqual([
      { category: '餐饮', subcategory: '外卖', totalCents: 1000, count: 1 },
    ]);
  });

  it('资金去向按期间汇总', () => {
    const data = [
      row({ id: 1, counterparty: 'A', direction: 'expense', amountCents: 1000, category: '餐饮' }),
      row({ id: 2, counterparty: 'B', direction: 'expense', amountCents: 2000, tradeTime: '2026-01-01 10:00:00', category: '交通' }),
    ];
    expect(computeTopCounterpartiesForPeriod(data, '2026', '10', 5)).toEqual([
      {
        counterparty: 'A',
        totalCents: 1000,
        count: 1,
        category: '餐饮',
        subcategory: null,
        purpose: 'A',
      },
    ]);
  });
});

describe('资金去向', () => {
  it('按商户汇总支出（排除镜像与中性）', () => {
    const top = computeTopCounterparties(
      [
        row({ id: 1, counterparty: '美团外卖', amountCents: 2350 }),
        row({ id: 2, counterparty: '美团外卖', amountCents: 1000 }),
        row({ id: 3, counterparty: '盒马鲜生', amountCents: 15640 }),
        row({ id: 4, counterparty: '美团外卖', amountCents: 9999, isMirror: true }),
        row({ id: 5, counterparty: '滴滴', amountCents: 1200, direction: 'income' }),
        row({ id: 6, counterparty: '其他', amountCents: 500, direction: 'neutral' }),
      ],
      '2026-10',
      5
    );
    expect(top).toEqual([
      {
        counterparty: '盒马鲜生',
        totalCents: 15640,
        count: 1,
        category: '餐饮',
        subcategory: null,
        purpose: '盒马鲜生',
      },
      {
        counterparty: '美团外卖',
        totalCents: 3350,
        count: 2,
        category: '餐饮',
        subcategory: null,
        purpose: '美团外卖',
      },
    ]);
  });
});
