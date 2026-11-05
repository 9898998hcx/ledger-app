/**
 * expo-sqlite 适配器：用于 iOS / Android。
 * 仅在非 Web 平台被动态 import。
 */

import * as SQLite from 'expo-sqlite';
import type { AppDatabase, SqlValue } from './database';

export async function createNativeDatabase(name = 'ledger.db'): Promise<AppDatabase> {
  const db = await SQLite.openDatabaseAsync(name);

  return {
    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      await db.runAsync(sql, params as unknown as never[]);
    },
    async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      return (await db.getAllAsync(sql, params as unknown as never[])) as T[];
    },
    async close(): Promise<void> {
      await db.closeAsync();
    },
  };
}
