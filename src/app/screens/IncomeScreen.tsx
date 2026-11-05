import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { openDatabase } from '../../data/db';
import { listTransactions } from '../../data/repository';
import { applyManualCategory } from '../category-actions';
import { CATEGORIES, SOURCE_COLOR, SOURCE_LABEL } from '../../domain/categories';
import { channelOf } from '../../domain/channel';
import { breakdownKey, matchesBreakdown, type BreakdownSelection } from '../../domain/breakdown';
import { formatCents } from '../../domain/money';
import { ALL_MONTHS, computeIncomeBreakdown, filterBySource, selectIncome, yearsOf, type DetailStat } from '../../domain/stats';
import type { TradeSource, TransactionRow } from '../../domain/types';
import CategoryBreakdownChart from '../components/CategoryBreakdownChart';

export default function IncomeScreen() {
  const [all, setAll] = useState<TransactionRow[]>([]);
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [source, setSource] = useState<TradeSource | 'all'>('all');
  const [breakdownSource, setBreakdownSource] = useState<TradeSource>('wechat');
  const [detailFilter, setDetailFilter] = useState<BreakdownSelection | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const db = await openDatabase();
    setAll(await listTransactions(db));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDetailFilter(null);
  }, [year, month]);

  const years = useMemo(() => yearsOf(all), [all]);
  const months = ALL_MONTHS;
  const rows = useMemo(() => {
    const base = filterBySource(selectIncome(all, year, month), source);
    return detailFilter ? base.filter((row) => matchesBreakdown(row, detailFilter)) : base;
  }, [all, year, month, source, detailFilter]);

  const breakdownRows = useMemo(
    () => all.filter((row) => row.source === breakdownSource),
    [all, breakdownSource]
  );
  const breakdownDetail = useMemo(
    () => computeIncomeBreakdown(breakdownRows, year, month),
    [breakdownRows, year, month]
  );
  const breakdownTotal = useMemo(
    () => breakdownDetail.reduce((sum, item) => sum + item.totalCents, 0),
    [breakdownDetail]
  );

  const pickSource = (next: TradeSource | 'all') => {
    setSource(next);
    setDetailFilter(null);
    if (next !== 'all') setBreakdownSource(next);
  };

  const selectBreakdown = (item: DetailStat) => {
    const key = breakdownKey(item);
    setDetailFilter((prev) =>
      prev && prev.source === breakdownSource && breakdownKey(prev) === key
        ? null
        : { source: breakdownSource, category: item.category, subcategory: item.subcategory }
    );
  };

  const selectedKey =
    detailFilter && detailFilter.source === breakdownSource ? breakdownKey(detailFilter) : null;

  const apply = async (id: number, category: string) => {
    setBusy(true);
    try {
      const db = await openDatabase();
      await applyManualCategory(db, id, category, null);
      await load();
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>收入</Text>
      <Text style={styles.subtitle}>共 {rows.length} 笔收入（按当前筛选）</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>年份</Text>
        <View style={styles.chips}>
          <Chip
            label="全部"
            active={year === 'all'}
            onPress={() => {
              setYear('all');
              setMonth('all');
            }}
          />
          {years.map((y) => (
            <Chip
              key={y}
              label={`${y}年`}
              active={year === y}
              onPress={() => {
                setYear(y);
                setMonth('all');
              }}
            />
          ))}
        </View>
        <Text style={styles.cardTitle}>月份</Text>
        <View style={styles.chips}>
          <Chip label="全部" active={month === 'all'} onPress={() => setMonth('all')} />
          {months.map((m) => (
            <Chip
              key={m}
              label={`${Number(m)}月`}
              active={month === m}
              onPress={() => setMonth(m)}
            />
          ))}
        </View>
        <Text style={styles.cardTitle}>来源</Text>
        <View style={styles.chips}>
          <Chip label="全部" active={source === 'all'} onPress={() => pickSource('all')} />
          <Chip label="微信" active={source === 'wechat'} onPress={() => pickSource('wechat')} />
          <Chip label="支付宝" active={source === 'alipay'} onPress={() => pickSource('alipay')} />
          <Chip label="银行" active={source === 'bank'} onPress={() => pickSource('bank')} />
        </View>
        <Text style={styles.hint}>「全部」= 微信 + 支付宝；银行卡请选「银行」</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>收入分类（按渠道单独统计）</Text>
        <View style={styles.chips}>
          {(['wechat', 'alipay', 'bank'] as TradeSource[]).map((s) => (
            <Chip
              key={s}
              label={SOURCE_LABEL[s]}
              active={breakdownSource === s}
              onPress={() => {
                setBreakdownSource(s);
                setDetailFilter(null);
              }}
            />
          ))}
        </View>
        <Text style={styles.breakdownMeta}>
          {year === 'all' ? '全部年份' : `${year}年`} ·{' '}
          {month === 'all' ? '全部月份' : `${Number(month)}月`} · 收入合计{' '}
          {formatCents(breakdownTotal)}
        </Text>
        {breakdownDetail.length === 0 ? (
          <Text style={styles.empty}>该渠道本期暂无收入</Text>
        ) : (
          <CategoryBreakdownChart
            data={breakdownDetail}
            maxBarHeight={90}
            compact
            selectedKey={selectedKey}
            onSelect={selectBreakdown}
          />
        )}
        {detailFilter ? (
          <View style={styles.selectionBanner}>
            <Text style={styles.selectionText}>
              已筛选：{SOURCE_LABEL[detailFilter.source]} · {detailFilter.category}
              {detailFilter.subcategory ? ` / ${detailFilter.subcategory}` : ''}（{rows.length} 笔）
            </Text>
            <Pressable onPress={() => setDetailFilter(null)}>
              <Text style={styles.selectionClear}>清除筛选</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>收入记录（{rows.length}）</Text>
        {rows.length === 0 ? <Text style={styles.empty}>暂无收入记录</Text> : null}
        {rows.map((tx) => {
          const channel = channelOf(tx);
          const bankFlow = tx.source === 'bank' && channel !== 'bank';
          return (
            <View key={tx.id}>
              <Pressable
                style={styles.row}
                onPress={() => setEditing(editing === tx.id ? null : tx.id)}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {tx.counterparty || tx.description || '未知来源'}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.sourceBadge, { backgroundColor: SOURCE_COLOR[channel] }]}>
                      {SOURCE_LABEL[channel] ?? channel}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {bankFlow ? '银行流水 · ' : ''}
                      {tx.tradeTime} · {tx.category || '其他'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.amount}>+{formatCents(tx.amountCents)}</Text>
              </Pressable>
              {editing === tx.id ? (
                <View style={styles.editBox}>
                  <Text style={styles.editTitle}>设置分类（会记住商户）</Text>
                  <View style={styles.chips}>
                    {CATEGORIES.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        active={false}
                        disabled={busy}
                        onPress={() => void apply(tx.id, c)}
                      />
                    ))}
                  </View>
                  {busy ? <ActivityIndicator color="#4f6bff" /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fc' },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#1f2330' },
  subtitle: { fontSize: 13, color: '#6b7280' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#eef2ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#4f6bff' },
  chipDisabled: { opacity: 0.6 },
  chipText: { fontSize: 13, color: '#3b4fd9', fontWeight: '600' },
  chipTextActive: { color: '#ffffff' },
  hint: { fontSize: 11, color: '#9ca3af' },
  breakdownMeta: { fontSize: 11, color: '#6b7280' },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectionText: { flex: 1, fontSize: 12, color: '#3b4fd9', fontWeight: '600' },
  selectionClear: { fontSize: 12, color: '#6b7280', textDecorationLine: 'underline' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f2f6',
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, color: '#111827', fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceBadge: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  rowMeta: { flex: 1, fontSize: 12, color: '#9ca3af' },
  amount: { fontSize: 14, fontWeight: '700', color: '#059669' },
  empty: { fontSize: 13, color: '#9ca3af' },
  editBox: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, gap: 8 },
  editTitle: { fontSize: 12, color: '#6b7280' },
});
