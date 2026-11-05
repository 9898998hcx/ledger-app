/**
 * sql.js（SQLite WASM）适配器：用于 Web 端，也用于 Node 中的单元测试。
 * Web 端默认把数据库序列化保存到 IndexedDB，刷新页面不丢数据。
 */

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { AppDatabase, SqlValue } from './database';

export interface SqlJsDatabaseOptions {
  /** 返回 sql-wasm.wasm 的地址（Web 默认 /sql-wasm.wasm，Node 测试传本地路径） */
  locateFile?: (file: string) => string;
  /** 是否持久化到 IndexedDB（默认 true；Node 环境自动跳过） */
  persist?: boolean;
}

const IDB_NAME = 'ledger-app';
const IDB_STORE = 'kv';
const IDB_KEY = 'db';

async function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const idb = request.result;
        if (!idb.objectStoreNames.contains(IDB_STORE)) {
          idb.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(idb: IDBDatabase): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const request = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value instanceof Uint8Array ? value : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(idb: IDBDatabase, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function createSqlJsDatabase(
  options: SqlJsDatabaseOptions = {}
): Promise<AppDatabase> {
  const SQL = await initSqlJs({
    locateFile: options.locateFile ?? (() => '/sql-wasm.wasm'),
  });

  const persist = options.persist !== false;
  const idb = persist ? await openIdb() : null;
  const saved = idb ? await idbGet(idb) : null;
  const raw: SqlJsDatabase = saved ? new SQL.Database(saved) : new SQL.Database();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = (): void => {
    if (!idb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        void idbSet(idb, raw.export());
      } catch {
        // 持久化失败不影响当前会话
      }
    }, 300);
  };

  return {
    async exec(sql: string): Promise<void> {
      raw.run(sql);
      scheduleSave();
    },
    async run(sql: string, params: SqlValue[] = []): Promise<void> {
      raw.run(sql, params as unknown as never[]);
      scheduleSave();
    },
    async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      const stmt = raw.prepare(sql);
      try {
        stmt.bind(params as unknown as never[]);
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as unknown as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    async close(): Promise<void> {
      if (saveTimer) clearTimeout(saveTimer);
      if (idb) {
        try {
          await idbSet(idb, raw.export());
        } catch {
          // 忽略
        }
      }
      raw.close();
      if (idb) idb.close();
    },
  };
}
