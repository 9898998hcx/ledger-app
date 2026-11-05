import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/domain/csv';

describe('CSV 解析', () => {
  it('解析基础行列', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('处理引号内的逗号与转义引号', () => {
    expect(parseCsv('a,"b,c"\n"d""e",f')).toEqual([
      ['a', 'b,c'],
      ['d"e', 'f'],
    ]);
  });

  it('处理引号内换行与 CRLF', () => {
    expect(parseCsv('a,"line1\nline2",c\r\nx,y,z')).toEqual([
      ['a', 'line1\nline2', 'c'],
      ['x', 'y', 'z'],
    ]);
  });

  it('忽略 BOM 与行尾空字段', () => {
    const rows = parseCsv('\uFEFFa,b,\n1,2,');
    expect(rows[0]).toEqual(['a', 'b', '']);
    expect(rows[1]).toEqual(['1', '2', '']);
  });
});
