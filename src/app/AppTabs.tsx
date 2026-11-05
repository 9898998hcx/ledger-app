import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FullscreenButton from './FullscreenButton';
import ImportScreen from './screens/ImportScreen';
import IncomeScreen from './screens/IncomeScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import TransactionsScreen from './screens/TransactionsScreen';
import RulesScreen from './screens/RulesScreen';

type TabKey = 'import' | 'transactions' | 'income' | 'stats' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'import', label: '导入' },
  { key: 'transactions', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'stats', label: '统计' },
  { key: 'settings', label: '设置' },
];

export default function AppTabs() {
  const [active, setActive] = useState<TabKey>('import');
  const [showRules, setShowRules] = useState(false);

  const openRules = () => {
    setActive('settings');
    setShowRules(true);
  };
  const closeRules = () => setShowRules(false);
  const switchTab = (key: TabKey) => {
    setShowRules(false);
    setActive(key);
  };

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>记账 App</Text>
        <FullscreenButton />
      </View>
      <View style={styles.body}>
        {active === 'import' && !showRules ? <ImportScreen /> : null}
        {active === 'transactions' && !showRules ? <TransactionsScreen /> : null}
        {active === 'income' && !showRules ? <IncomeScreen /> : null}
        {active === 'stats' && !showRules ? <StatsScreen /> : null}
        {active === 'settings' ? (
          showRules ? (
            <RulesScreen onBack={closeRules} />
          ) : (
            <SettingsScreen onOpenRules={openRules} />
          )
        ) : null}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Pressable key={tab.key} style={styles.tab} onPress={() => switchTab(tab.key)}>
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fc' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  brand: { fontSize: 15, fontWeight: '700', color: '#1f2330' },
  body: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13, color: '#6b7280' },
  tabTextActive: { color: '#4f6bff', fontWeight: '700' },
});
