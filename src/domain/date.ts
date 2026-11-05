/**
 * 日期工具：统一为 "YYYY-MM-DD HH:mm:ss" 本地 ISO 字符串（不做时区转换）。
 * 支持 2026-10-01 12:30:00、2026/10/01、20261001、20261001123000 等常见格式。
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function build(
  yearRaw: string,
  monthRaw: string,
  dayRaw: string,
  hourRaw: string,
  minuteRaw: string,
  secondRaw: string
): string | null {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  // 用 Date 校验非法日期（如 2026-02-30）
  const d = new Date(year, month - 1, day, hour, minute, second);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

/** 解析并规范化日期时间；非法返回 null */
export function normalizeDateTime(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/[./]/g, '-').replace('T', ' ');

  const separated = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (separated) {
    return build(
      separated[1],
      separated[2],
      separated[3],
      separated[4] ?? '0',
      separated[5] ?? '00',
      separated[6] ?? '0'
    );
  }

  // 紧凑格式：20261001 / 20261001123045 / 20261001 12:30:00
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})(?:[ ]?(\d{2}):?(\d{2})(?::?(\d{2}))?)?$/);
  if (compact) {
    return build(
      compact[1],
      compact[2],
      compact[3],
      compact[4] ?? '0',
      compact[5] ?? '00',
      compact[6] ?? '0'
    );
  }

  return null;
}

/** 取年月，如 "2026-10"；非法返回 null */
export function monthOf(isoDateTime: string): string | null {
  const m = isoDateTime.match(/^(\d{4})-(\d{2})-\d{2}/);
  return m ? `${m[1]}-${m[2]}` : null;
}
