import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { openDatabase } from '../../data/db';
import { listCategoryRules } from '../../data/repository';
import { CATEGORIES } from '../../domain/categories';
import type { CategoryRule, MatchType } from '../../domain/types';
import {
  addRule,
  removeRule,
  resetRulesToDefault,
  saveRule,
  toggleRule,
  validateRuleInput,
  type RuleInput,
} from '../rules-actions';

const EMPTY_FORM: RuleInput = {
  priority: 100,
  matchType: 'keyword',
  pattern: '',
  category: '餐饮',
  subcategory: '',
  enabled: true,
};

export default function RulesScreen({ onBack }: { onBack?: () => void }) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<RuleInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    const db = await openDatabase();
    setRules(await listCategoryRules(db));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  const startEdit = (rule: CategoryRule) => {
    setEditing(rule.id);
    setForm({
      priority: rule.priority,
      matchType: rule.matchType,
      pattern: rule.pattern,
      category: rule.category,
      subcategory: rule.subcategory ?? '',
      enabled: rule.enabled,
    });
    setMessage(null);
  };

  const save = async () => {
    const error = validateRuleInput(form);
    if (error) {
      setMessage(`⚠️ ${error}`);
      return;
    }
    setBusy(true);
    try {
      const db = await openDatabase();
      if (editing === 'new') {
        await addRule(db, form);
        setMessage('已新增规则');
      } else if (typeof editing === 'number') {
        await saveRule(db, editing, form);
        setMessage('已保存规则');
      }
      setEditing(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule: CategoryRule) => {
    setBusy(true);
    try {
      const db = await openDatabase();
      await toggleRule(db, rule.id, !rule.enabled);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      const db = await openDatabase();
      await removeRule(db, id);
      setConfirmDelete(null);
      await load();
      setMessage('已删除规则');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const db = await openDatabase();
      const count = await resetRulesToDefault(db);
      setConfirmReset(false);
      await load();
      setMessage(`已恢复 ${count} 条默认规则`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack ? (
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← 返回设置</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>分类规则</Text>
      <Text style={styles.subtitle}>
        按优先级从小到大匹配（命中即停）。关键词为包含匹配；正则支持 | 分组。规则会优先于商户记忆。
      </Text>

      <View style={styles.card}>
        <View style={styles.toolbar}>
          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={startNew} disabled={busy}>
            <Text style={styles.primaryText}>新增规则</Text>
          </Pressable>
          {confirmReset ? (
            <View style={styles.confirmRow}>
              <Pressable style={[styles.danger, busy && styles.disabled]} onPress={() => void reset()} disabled={busy}>
                <Text style={styles.dangerText}>确认恢复默认</Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={() => setConfirmReset(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.secondary} onPress={() => setConfirmReset(true)}>
              <Text style={styles.secondaryText}>恢复默认规则</Text>
            </Pressable>
          )}
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {busy ? <ActivityIndicator color="#4f6bff" /> : null}
      </View>

      {editing !== null ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editing === 'new' ? '新增规则' : '编辑规则'}</Text>

          <Text style={styles.label}>优先级（越小越先匹配）</Text>
          <TextInput
            style={styles.input}
            value={String(form.priority)}
            keyboardType="numeric"
            onChangeText={(text) => setForm({ ...form, priority: Number(text.replace(/[^0-9]/g, '')) || 0 })}
          />

          <Text style={styles.label}>匹配类型</Text>
          <View style={styles.chips}>
            <Chip
              label="关键词"
              active={form.matchType === 'keyword'}
              onPress={() => setForm({ ...form, matchType: 'keyword' as MatchType })}
            />
            <Chip
              label="正则"
              active={form.matchType === 'regex'}
              onPress={() => setForm({ ...form, matchType: 'regex' as MatchType })}
            />
          </View>

          <Text style={styles.label}>匹配内容（交易对方 + 商品说明）</Text>
          <TextInput
            style={styles.input}
            value={form.pattern}
            placeholder={form.matchType === 'keyword' ? '例如：美团' : '例如：滴滴|高德'}
            onChangeText={(text) => setForm({ ...form, pattern: text })}
          />

          <Text style={styles.label}>分类</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={form.category === c} onPress={() => setForm({ ...form, category: c })} />
            ))}
          </View>

          <Text style={styles.label}>子分类（可选）</Text>
          <TextInput
            style={styles.input}
            value={form.subcategory ?? ''}
            placeholder="例如：外卖"
            onChangeText={(text) => setForm({ ...form, subcategory: text })}
          />

          <View style={styles.switchRow}>
            <Text style={styles.label}>启用</Text>
            <Switch value={form.enabled} onValueChange={(value) => setForm({ ...form, enabled: value })} />
          </View>

          <View style={styles.toolbar}>
            <Pressable style={[styles.primary, busy && styles.disabled]} onPress={() => void save()} disabled={busy}>
              <Text style={styles.primaryText}>保存</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setEditing(null)} disabled={busy}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>规则列表（{rules.length}）</Text>
        {rules.length === 0 ? <Text style={styles.empty}>暂无规则</Text> : null}
        {rules.map((rule) => (
          <View key={rule.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                #{rule.priority} · {rule.matchType === 'regex' ? '正则' : '关键词'}「{rule.pattern}」→{' '}
                {rule.category}
                {rule.subcategory ? `/${rule.subcategory}` : ''}
              </Text>
              <Text style={styles.rowMeta}>{rule.enabled ? '已启用' : '已停用'}</Text>
            </View>
            <Switch value={rule.enabled} onValueChange={() => void toggle(rule)} disabled={busy} />
            <Pressable style={styles.editBtn} onPress={() => startEdit(rule)} disabled={busy}>
              <Text style={styles.editText}>编辑</Text>
            </Pressable>
            {confirmDelete === rule.id ? (
              <Pressable style={styles.deleteConfirm} onPress={() => void remove(rule.id)} disabled={busy}>
                <Text style={styles.deleteConfirmText}>确认删除</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.deleteBtn} onPress={() => setConfirmDelete(rule.id)} disabled={busy}>
                <Text style={styles.deleteText}>删除</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fc' },
  content: { padding: 24, gap: 16 },
  backButton: { alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backText: { fontSize: 13, color: '#3b4fd9', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#1f2330' },
  subtitle: { fontSize: 13, lineHeight: 20, color: '#6b7280' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  toolbar: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  primary: { backgroundColor: '#4f6bff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  secondary: { backgroundColor: '#eef2ff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryText: { color: '#3b4fd9', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  confirmRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  danger: { backgroundColor: '#dc2626', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dangerText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  cancel: { backgroundColor: '#f1f2f6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  message: { fontSize: 13, color: '#2563eb' },
  label: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fafbfc',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#eef2ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#4f6bff' },
  chipText: { fontSize: 13, color: '#3b4fd9', fontWeight: '600' },
  chipTextActive: { color: '#ffffff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13, color: '#111827' },
  rowMeta: { fontSize: 11, color: '#9ca3af' },
  empty: { fontSize: 13, color: '#9ca3af' },
  editBtn: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editText: { fontSize: 12, color: '#3b4fd9', fontWeight: '600' },
  deleteBtn: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteConfirm: { backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteText: { fontSize: 12, color: '#b91c1c', fontWeight: '600' },
  deleteConfirmText: { fontSize: 12, color: '#ffffff', fontWeight: '600' },
});
