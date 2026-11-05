import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { openDatabase } from '../../data/db';
import { listTransactions } from '../../data/repository';
import CategoryBreakdownChart from '../components/CategoryBreakdownChart';
import { SOURCE_COLOR, SOURCE_LABEL } from '../../domain/categories';
import { channelOf } from '../../domain/channel';
import { formatCents } from '../../domain/money';
import { purposeOf } from '../../domain/purpose';
import {
  ALL_MONTHS,
  computeSourceTotals,
  computeStats,
  computeTopCounterpartiesForPeriod,
  filterByPeriod,
  filterBySource,
  yearsOf,
} from '../../domain/stats';
import type { TradeSource, TransactionRow } from '../../domain/types';

export default function StatsScreen() {
  const [all, setAll] = useState<TransactionRow[]>([]);
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [source, setSource] = useState<TradeSource | 'all'>('all');
  const [detailLimit, setDetailLimit] = useState(60);

  const load = useCallback(async () => {
    const db = await openDatabase();
    setAll(await listTransactions(db));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDetailLimit(60);
  }, [year, month, source]);

  const years = useMemo(() => yearsOf(all), [all]);
  const months = ALL_MONTHS;
  const sourceRows = useMemo(() => filterBySource(all, source), [all, source]);
  const stats = useMemo(() => computeStats(sourceRows, year, month), [sourceRows, year, month]);
  const top = useMemo(
    () => computeTopCounterpartiesForPeriod(sourceRows, year, month, 5),
    [sourceRows, year, month]
  );
  const channels = useMemo(
    () => computeSourceTotals(sourceRows, year, month),
    [sourceRows, year, month]
  );
  const visibleChannels = useMemo(
    () => channels.filter((item) => item.count > 0),
    [channels]
  );
  const detailRows = useMemo(
    () =>
      filterByPeriod(sourceRows, year, month).filter(
        (row) => !row.isMirror && row.direction !== 'neutral'
      ),
    [sourceRows, year, month]
  );
  const periodLabel = `${year === 'all' ? '全部年份' : `${year}年`} · ${
    month === 'all' ? '全部月份' : `${Number(month)}月`
  }`;
  const sourceLabel =
    source === 'all'
      ? '微信 + 支付宝（不含银行卡）'
      : source === 'bank'
        ? '银行卡'
        : (SOURCE_LABEL[source] ?? source);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>统计</Text>
      <Text style={styles.subtitle}>只统计非镜像、非中性的交易；「全部」只含微信 + 支付宝，银行卡请选「银行」</Text>

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
          <Chip label="全部" active={source === 'all'} onPress={() => setSource('all')} />
          <Chip label="微信" active={source === 'wechat'} onPress={() => setSource('wechat')} />
          <Chip label="支付宝" active={source === 'alipay'} onPress={() => setSource('alipay')} />
          <Chip label="银行" active={source === 'bank'} onPress={() => setSource('bank')} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>收支合计</Text>
        <Text style={styles.periodText}>
          {periodLabel} · {sourceLabel}（不含镜像/中性）
        </Text>
        <View style={styles.summaryRow}>
          <Summary label="收入合计" value={formatCents(stats.incomeCents)} color="#059669" />
          <Summary label="支出合计" value={formatCents(stats.expenseCents)} color="#dc2626" />
          <Summary
            label="结余"
            value={formatCents(stats.balanceCents)}
            color={stats.balanceCents >= 0 ? '#111827' : '#dc2626'}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {source === 'bank' ? '银行卡流水的渠道归属' : '渠道收支'}
        </Text>
        <Text style={styles.periodText}>
          {periodLabel}（不含镜像/中性）
        </Text>
        <View style={styles.channelHeader}>
          <Text style={[styles.channelName, styles.channelHeaderText]}>渠道</Text>
          <Text style={[styles.channelValue, styles.channelHeaderText]}>收入</Text>
          <Text style={[styles.channelValue, styles.channelHeaderText]}>支出</Text>
        </View>
        {visibleChannels.length === 0 ? (
          <Text style={styles.empty}>当前筛选下暂无渠道数据</Text>
        ) : null}
        {visibleChannels.map((item) => (
          <View key={item.source} style={styles.channelRow}>
            <View style={styles.channelName}>
              <View style={[styles.sourceDot, { backgroundColor: SOURCE_COLOR[item.source] }]} />
              <Text style={styles.channelNameText}>{SOURCE_LABEL[item.source]}</Text>
              <Text style={styles.channelCount}>{item.count} 笔</Text>
            </View>
            <Text style={styles.channelValueIncome}>+{formatCents(item.incomeCents)}</Text>
            <Text style={styles.channelValueExpense}>-{formatCents(item.expenseCents)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>支出分类（细分，{stats.byDetail.length}）</Text>
        {stats.byDetail.length === 0 ? (
          <Text style={styles.empty}>暂无支出</Text>
        ) : (
          <CategoryBreakdownChart data={stats.byDetail} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>支出 TOP 5（资金去向）</Text>
        <Text style={styles.periodText}>
          {source === 'bank' ? '银行卡导出的对方名称可能已脱敏，按用途/分类标注' : '按交易对方汇总，名称完整展示'}
        </Text>
        {top.length === 0 ? (
          <Text style={styles.empty}>暂无支出</Text>
        ) : (
          top.map((item) => (
            <View key={item.counterparty} style={styles.topRow}>
              <View style={styles.topMain}>
                <Text style={styles.topName} numberOfLines={2}>
                  {item.counterparty}
                </Text>
                <Text style={styles.topMeta} numberOfLines={1}>
                  {item.category
                    ? `${item.category}${item.subcategory ? ` / ${item.subcategory}` : ''}`
                    : item.purpose}
                </Text>
              </View>
              <Text style={styles.topValue}>
                {formatCents(item.totalCents)}（{item.count} 笔）
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>收支明细（{detailRows.length}）</Text>
        <Text style={styles.periodText}>
          {periodLabel} · {sourceLabel} · 未分类按原始用途展示
        </Text>
        {detailRows.length === 0 ? <Text style={styles.empty}>当前筛选下暂无收支</Text> : null}
        {detailRows.slice(0, detailLimit).map((tx) => {
          const channel = channelOf(tx);
          const isIncome = tx.direction === 'income';
          const purpose = purposeOf(tx);
          return (
            <View key={tx.id} style={styles.detailRow}>
              <View style={styles.detailMain}>
                <Text style={styles.detailPurpose} numberOfLines={2}>
                  {purpose}
                </Text>
                {tx.counterparty && tx.counterparty !== purpose ? (
                  <Text style={styles.detailCounterparty} numberOfLines={1}>
                    {tx.counterparty}
                  </Text>
                ) : null}
                <View style={styles.detailMetaRow}>
                  <Text style={[styles.detailBadge, { backgroundColor: SOURCE_COLOR[channel] }]}>
                    {SOURCE_LABEL[channel] ?? channel}
                  </Text>
                  <Text style={styles.detailMeta} numberOfLines={1}>
                    {tx.tradeTime}
                    {tx.category
                      ? ` · ${tx.category}${tx.subcategory ? ` / ${tx.subcategory}` : ''}`
                      : ''}
                  </Text>
                </View>
              </View>
              <Text
                style={[styles.detailAmount, isIncome ? styles.detailIncome : styles.detailExpense]}
              >
                {isIncome ? '+' : '-'}
                {formatCents(tx.amountCents)}
              </Text>
            </View>
          );
        })}
        {detailRows.length > detailLimit ? (
          <Pressable
            style={styles.moreButton}
            onPress={() => setDetailLimit((v) => Math.min(v + 100, detailRows.length))}
          >
            <Text style={styles.moreText}>显示更多（剩余 {detailRows.length - detailLimit} 笔）</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
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
  periodText: { fontSize: 12, color: '#9ca3af' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#eef2ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#4f6bff' },
  chipText: { fontSize: 13, color: '#3b4fd9', fontWeight: '600' },
  chipTextActive: { color: '#ffffff' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryItem: { flex: 1, gap: 4 },
  summaryLabel: { fontSize: 12, color: '#9ca3af' },
  summaryValue: { fontSize: 22, fontWeight: '700' },
  empty: { fontSize: 13, color: '#9ca3af' },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  channelHeaderText: { fontSize: 11, color: '#9ca3af', fontWeight: '400' },
  channelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  channelName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  channelNameText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  channelCount: { fontSize: 10, color: '#9ca3af' },
  channelValue: { width: 92, textAlign: 'right', fontSize: 12 },
  channelValueIncome: { width: 92, textAlign: 'right', fontSize: 13, fontWeight: '600', color: '#059669' },
  channelValueExpense: { width: 92, textAlign: 'right', fontSize: 13, fontWeight: '600', color: '#dc2626' },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  topMain: { flex: 1, marginRight: 8, gap: 1 },
  topName: { fontSize: 13, color: '#374151', fontWeight: '500' },
  topMeta: { fontSize: 11, color: '#9ca3af' },
  topValue: { fontSize: 12, color: '#6b7280' },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f2f6',
  },
  detailMain: { flex: 1, gap: 2 },
  detailPurpose: { fontSize: 13, color: '#111827', fontWeight: '500' },
  detailCounterparty: { fontSize: 11, color: '#6b7280' },
  detailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailBadge: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '600',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  detailMeta: { flex: 1, fontSize: 10, color: '#9ca3af' },
  detailAmount: { fontSize: 14, fontWeight: '700' },
  detailIncome: { color: '#059669' },
  detailExpense: { color: '#dc2626' },
  moreButton: { alignItems: 'center', paddingVertical: 8, backgroundColor: '#eef2ff', borderRadius: 8 },
  moreText: { fontSize: 12, color: '#3b4fd9', fontWeight: '600' },
});

