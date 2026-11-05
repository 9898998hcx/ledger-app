import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { openDatabase } from '../../data/db';
import {
  clearData,
  countTransactions,
  exportTransactionsCsv,
  listImportBatches,
} from '../../data/repository';
import type { ImportBatch } from '../../domain/types';
import { downloadCsv } from '../download-csv';

const SOURCE_LABEL: Record<string, string> = { wechat: '微信', alipay: '支付宝', bank: '银行' };

export default function SettingsScreen({ onOpenRules }: { onOpenRules: () => void }) {
  const [count, setCount] = useState(0);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = await openDatabase();
    setCount(await countTransactions(db));
    setBatches(await listImportBatches(db));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const db = await openDatabase();
      const csv = await exportTransactionsCsv(db);
      const ok = await downloadCsv('ledger-export.csv', csv);
      setMessage(ok ? '已导出 CSV（浏览器下载）' : '移动端暂不支持直接下载，请在 Web 端导出');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const db = await openDatabase();
      await clearData(db);
      setConfirming(false);
      await load();
      setMessage('已清空交易与导入记录（分类规则与商户记忆保留）');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>设置</Text>
      <Text style={styles.subtitle}>所有数据仅保存在本地（Web 端为浏览器 IndexedDB）</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>分类管理</Text>
        <Text style={styles.hint}>
          规则优先于商户记忆。你可以新增/编辑/启停/删除规则，自己决定哪些支出归到哪个分类。
        </Text>
        <Pressable style={styles.button} onPress={onOpenRules}>
          <Text style={styles.buttonText}>管理分类规则</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>数据概览</Text>
        <Row label="交易笔数" value={String(count)} />
        <Row label="导入批次" value={String(batches.length)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>导出</Text>
        <Text style={styles.hint}>导出全部交易为 CSV（含分类、镜像标记），仅在本地生成文件。</Text>
        <Pressable style={[styles.button, busy && styles.disabled]} onPress={() => void onExport()} disabled={busy}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>导出 CSV</Text>}
        </Pressable>
        {Platform.OS !== 'web' ? <Text style={styles.hintSmall}>移动端请在 Web 端导出</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>清空数据</Text>
        <Text style={styles.hint}>删除全部交易与导入记录，保留分类规则和商户记忆。</Text>
        {confirming ? (
          <View style={styles.confirmRow}>
            <Pressable style={[styles.danger, busy && styles.disabled]} onPress={() => void onClear()} disabled={busy}>
              <Text style={styles.dangerText}>确认清空</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setConfirming(false)} disabled={busy}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.dangerOutline} onPress={() => setConfirming(true)}>
            <Text style={styles.dangerOutlineText}>清空全部交易</Text>
          </Pressable>
        )}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>导入日志（{batches.length}）</Text>
        {batches.length === 0 ? <Text style={styles.empty}>暂无导入记录</Text> : null}
        {batches.map((b) => (
          <View key={b.id} style={styles.logRow}>
            <Text style={styles.logTitle} numberOfLines={1}>
              {SOURCE_LABEL[b.source] ?? b.source} · {b.fileName}
            </Text>
            <Text style={styles.logMeta}>
              {b.importedAt.slice(0, 19).replace('T', ' ')} · 总 {b.totalRows} / 新增 {b.insertedRows} / 跳过{' '}
              {b.skippedRows}
            </Text>
            {b.errorMessage ? (
              <Text style={styles.logError} numberOfLines={2}>
                {b.errorMessage}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  hint: { fontSize: 13, lineHeight: 20, color: '#6b7280' },
  hintSmall: { fontSize: 12, color: '#9ca3af' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, color: '#6b7280' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  button: {
    backgroundColor: '#4f6bff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  danger: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  cancel: {
    flex: 1,
    backgroundColor: '#f1f2f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  dangerOutline: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerOutlineText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
  message: { fontSize: 13, color: '#2563eb' },
  empty: { fontSize: 13, color: '#9ca3af' },
  logRow: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  logTitle: { fontSize: 13, color: '#111827', fontWeight: '500' },
  logMeta: { fontSize: 12, color: '#9ca3af' },
  logError: { fontSize: 11, color: '#b45309' },
});
