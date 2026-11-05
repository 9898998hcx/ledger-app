import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { formatCents } from '../../domain/money';
import type { DetailStat } from '../../domain/stats';

interface Props {
  data: DetailStat[];
  maxBarHeight?: number;
  compact?: boolean;
  selectedKey?: string | null;
  onSelect?: (item: DetailStat) => void;
}

/** 分类细分柱形图（支出/收入共用），含左右滑动按钮；点击柱子可筛选下方明细 */
export default function CategoryBreakdownChart({
  data,
  maxBarHeight = 120,
  compact = false,
  selectedKey = null,
  onSelect,
}: Props) {
  const chartRef = useRef<ScrollViewInstance>(null);
  const [offset, setOffset] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    setOffset(0);
    chartRef.current?.scrollTo({ x: 0, animated: false });
  }, [data]);

  const maxCents = data[0]?.totalCents ?? 0;
  const canLeft = offset > 4;
  const canRight = contentWidth > viewport + 4 && offset + viewport < contentWidth - 4;
  const scroll = (delta: number) => {
    const maxOffset = Math.max(0, contentWidth - viewport);
    const next = Math.max(0, Math.min(maxOffset, offset + delta));
    chartRef.current?.scrollTo({ x: next, animated: true });
    setOffset(next);
  };

  return (
    <>
      <View style={styles.wrap}>
        <Pressable
          style={[styles.arrow, compact && styles.arrowCompact, !canLeft && styles.arrowDisabled]}
          onPress={() => scroll(-220)}
          disabled={!canLeft}
          accessibilityLabel="向左查看更多支出分类"
        >
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <ScrollView
          ref={chartRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={[styles.row, compact && styles.rowCompact]}
          onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onContentSizeChange={(width) => setContentWidth(width)}
          onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        >
          {data.map((item) => {
            const key = `${item.category}|${item.subcategory ?? ''}`;
            const selected = selectedKey === key;
            const barHeight =
              maxCents > 0 ? Math.max(6, Math.round((item.totalCents / maxCents) * maxBarHeight)) : 6;
            return (
              <Pressable
                key={key}
                onPress={() => onSelect?.(item)}
                style={[
                  styles.column,
                  compact && styles.columnCompact,
                  selected && styles.columnSelected,
                ]}
                accessibilityLabel={`查看${item.category}${item.subcategory ? ` ${item.subcategory}` : ''}的钱款去向`}
              >
                <Text style={styles.value}>{formatCents(item.totalCents)}</Text>
                <View
                  style={[
                    styles.barTrack,
                    { height: maxBarHeight },
                    compact && styles.barTrackCompact,
                  ]}
                >
                  <View
                    style={[
                      styles.barFill,
                      { height: barHeight },
                      compact && styles.barFillCompact,
                      selected && styles.barFillSelected,
                    ]}
                  />
                </View>
                <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
                  {item.category}
                  {item.subcategory ? `\n${item.subcategory}` : ''}
                </Text>
                <Text style={[styles.count, selected && styles.labelSelected]}>{item.count} 笔</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          style={[styles.arrow, compact && styles.arrowCompact, !canRight && styles.arrowDisabled]}
          onPress={() => scroll(220)}
          disabled={!canRight}
          accessibilityLabel="向右查看更多支出分类"
        >
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
      {contentWidth > viewport + 4 ? (
        <Text style={styles.hint}>点击左右按钮或横向滑动，查看更多细分项</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scroll: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingVertical: 8, minHeight: 220 },
  rowCompact: { gap: 12, minHeight: 170 },
  column: { width: 76, alignItems: 'center', gap: 4 },
  columnCompact: { width: 66 },
  columnSelected: { backgroundColor: '#eef2ff', borderRadius: 8, paddingVertical: 4 },
  value: { fontSize: 10, color: '#6b7280' },
  barTrack: {
    width: 30,
    justifyContent: 'flex-end',
    backgroundColor: '#f1f2f6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barTrackCompact: { width: 24 },
  barFill: { width: 30, backgroundColor: '#4f6bff', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barFillCompact: { width: 24 },
  barFillSelected: { backgroundColor: '#1f3ed6' },
  label: { fontSize: 11, color: '#374151', textAlign: 'center', minHeight: 32 },
  labelSelected: { color: '#1f3ed6', fontWeight: '700' },
  count: { fontSize: 10, color: '#9ca3af' },
  arrow: {
    width: 34,
    height: 80,
    borderRadius: 17,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCompact: { width: 30, height: 64 },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 24, color: '#3b4fd9', fontWeight: '700', lineHeight: 28 },
  hint: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },
});

