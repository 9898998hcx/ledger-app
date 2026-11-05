/**
 * 数据库访问抽象：Web 用 sql.js（SQLite WASM），移动端用 expo-sqlite。
 * 领域层与仓储层只依赖这个接口，方便以后替换实现。
 */

export type SqlValue = string | number | null;

export interface AppDatabase {
  /** 执行一段或多段 SQL（建表、迁移） */
  exec(sql: string): Promise<void>;
  /** 执行写语句，可带参数 */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** 查询并返回对象数组 */
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
