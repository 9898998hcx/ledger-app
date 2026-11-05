/**
 * 金额工具：一律以整数分存储，避免浮点误差。
 */

/** "¥1,234.56" / "23.5" / "23" → 分；非法返回 null */
export function parseAmountToCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/[¥￥\s,，]/g, '');
  if (!s) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const [intPart, decPart = ''] = s.split('.');
  const intVal = Number(intPart);
  if (!Number.isSafeInteger(intVal)) return null;
  const cents = intVal * 100 + Number((decPart + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 分 → "1,234.56"（用于界面展示） */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return `${sign}${yuan.toLocaleString('en-US')}.${String(fen).padStart(2, '0')}`;
}
