import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { openDatabase } from '../../data/db';
import { countTransactions } from '../../data/repository';
import { decodeCsvBytes } from '../../domain/encoding';
import {
  importAlipayFile,
  importAlipayRows,
  importAlipayText,
  importBankFile,
  importBankRows,
  importBankText,
  importWechatFile,
  importWechatRows,
  importWechatText,
  type ImportSummary,
} from '../../domain/import';
import { extractImageText } from '../ocr-text';
import { extractPdfText } from '../pdf-text';
import { pickCsvFile } from '../pick-csv';
import { readXlsxRows } from '../xlsx-reader';
import { readXlsRows } from '../xls-reader';

const SOURCE_LABEL: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行',
};

export default function ImportScreen() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [txCount, setTxCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPickAlipay = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await pickCsvFile([
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/pdf',
        '*/*',
      ]);
      if (!file) {
        setBusy(false);
        return;
      }
      const db = await openDatabase();
      let result: ImportSummary;
      if (/\.pdf$/i.test(file.name)) {
        result = await importAlipayText(db, file.name, await extractPdfText(file.bytes));
      } else if (/\.xls$/i.test(file.name)) {
        result = await importAlipayRows(db, file.name, await readXlsRows(file.bytes, 'alipay'));
      } else if (/\.xlsx$/i.test(file.name)) {
        result = await importAlipayRows(db, file.name, await readXlsxRows(file.bytes, 'alipay'));
      } else {
        result = await importAlipayFile(db, file.name, file.bytes);
      }
      setSummary(result);
      setTxCount(await countTransactions(db));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPickBank = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await pickCsvFile([
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/pdf',
        '*/*',
      ]);
      if (!file) {
        setBusy(false);
        return;
      }
      const db = await openDatabase();
      let result: ImportSummary;
      if (/\.pdf$/i.test(file.name)) {
        const text = await extractPdfText(file.bytes);
        result = await importBankText(db, file.name, text);
      } else if (/\.xls$/i.test(file.name)) {
        result = await importBankRows(db, file.name, await readXlsRows(file.bytes, 'bank'));
      } else if (/\.xlsx$/i.test(file.name)) {
        result = await importBankRows(db, file.name, await readXlsxRows(file.bytes, 'bank'));
      } else {
        result = await importBankFile(db, file.name, file.bytes);
      }
      setSummary(result);
      setTxCount(await countTransactions(db));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPickWechat = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await pickCsvFile([
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/pdf',
        '*/*',
      ]);
      if (!file) {
        setBusy(false);
        return;
      }
      const db = await openDatabase();
      let result: ImportSummary;
      if (/\.pdf$/i.test(file.name)) {
        const text = await extractPdfText(file.bytes);
        result = await importWechatText(db, file.name, text);
      } else if (/\.xls$/i.test(file.name)) {
        result = await importWechatRows(db, file.name, await readXlsRows(file.bytes, 'wechat'));
      } else if (/\.xlsx$/i.test(file.name)) {
        result = await importWechatRows(db, file.name, await readXlsxRows(file.bytes, 'wechat'));
      } else {
        result = await importWechatFile(db, file.name, decodeCsvBytes(file.bytes).text);
      }
      setSummary(result);
      setTxCount(await countTransactions(db));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await pickCsvFile(['image/png', 'image/jpeg', 'image/webp', 'image/*']);
      if (!file) {
        setBusy(false);
        return;
      }
      const text = await extractImageText(file.bytes);
      const db = await openDatabase();
      const result = await importBankText(db, file.name, text);
      setSummary(result);
      setTxCount(await countTransactions(db));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>记账 App</Text>
      <Text style={styles.subtitle}>本地优先 · 自用 · 无云服务</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>导入账单</Text>
        <Text style={styles.hint}>
          选择微信 / 支付宝 / 银行卡账单，或账单截图。微信支持 CSV/Excel/PDF；支付宝支持 CSV/Excel/PDF；银行卡支持 CSV/Excel/PDF/图片 OCR。
          PDF/图片会先提取文本再解析（图片 OCR 首次使用需要联网下载识别引擎）。
          重复导入同一内容会自动跳过；交易关闭/已退款记录会跳过并在下方列出。
        </Text>
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={() => void onPickWechat()}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>选择微信</Text>}
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={() => void onPickAlipay()}
          disabled={busy}
        >
          <Text style={styles.buttonSecondaryText}>选择支付宝</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={() => void onPickBank()}
          disabled={busy}
        >
          <Text style={styles.buttonSecondaryText}>选择银行卡</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={() => void onPickImage()}
          disabled={busy}
        >
          <Text style={styles.buttonSecondaryText}>选择账单图片</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.card}>
          <Text style={styles.error}>导入失败：{error}</Text>
        </View>
      ) : null}

      {summary ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>导入结果（{SOURCE_LABEL[summary.source] ?? summary.source}）</Text>
          {summary.duplicateFile ? (
            <Text style={styles.warn}>{summary.errors[0]}</Text>
          ) : (
            <>
              <Row label="文件" value={summary.fileName} />
              <Row label="总行数" value={String(summary.totalRows)} />
              <Row label="新增" value={String(summary.inserted)} />
              <Row label="跳过" value={String(summary.skipped)} />
              {txCount != null ? <Row label="当前交易总数" value={String(txCount)} /> : null}
              {summary.totalRows === 0 ? (
                <Text style={styles.warn}>
                  未识别到可导入的交易：请确认文件包含「交易时间/日期」和「金额」表头（微信账单/银行账单导出）。
                </Text>
              ) : null}
            </>
          )}
          {summary.errors.length > 0 ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxTitle}>错误 / 跳过明细</Text>
              <ScrollView style={styles.errorList}>
                {summary.errors.map((e, i) => (
                  <Text key={i} style={styles.errorLine}>
                    {e}
                  </Text>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {txCount != null && !summary ? (
        <Text style={styles.footer}>当前交易总数：{txCount}</Text>
      ) : null}
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
  button: {
    backgroundColor: '#4f6bff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  buttonSecondaryText: { color: '#3b4fd9', fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, color: '#6b7280' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  error: { fontSize: 13, color: '#dc2626' },
  warn: { fontSize: 13, color: '#b45309' },
  errorBox: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, gap: 6 },
  errorBoxTitle: { fontSize: 13, fontWeight: '600', color: '#374151' },
  errorList: { maxHeight: 160 },
  errorLine: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  footer: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});
