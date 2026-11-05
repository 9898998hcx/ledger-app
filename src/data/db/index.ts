/**
 * 平台入口：Web 使用 sql.js（SQLite WASM），移动端使用 expo-sqlite。
 * 全局单例 + 启动时自动迁移。
 */

import { Platform } from 'react-native';
import type { AppDatabase } from './database';
import { migrate } from './schema';
import { ensureDefaultRules } from '../../domain/rules/seed';

let dbPromise: Promise<AppDatabase> | null = null;

export function openDatabase(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      let db: AppDatabase;
      if (Platform.OS === 'web') {
        const { createSqlJsDatabase } = await import('./sqljs');
        db = await createSqlJsDatabase();
      } else {
        const { createNativeDatabase } = await import('./native');
        db = await createNativeDatabase();
      }
      await migrate(db);
      await ensureDefaultRules(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}
