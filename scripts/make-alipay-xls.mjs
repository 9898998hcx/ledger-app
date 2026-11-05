import * as XLSX from 'xlsx';
import fs from 'node:fs';

const rows = [
  ['交易时间', '交易分类', '交易对方', '商品说明', '收/支', '金额', '收/付款方式', '交易状态', '交易订单号'],
  ['2026-10-01 12:30:00', '餐饮美食', '肯德基', '午餐', '支出', '23.50', '余额宝', '交易成功', 'ALI202610010001'],
  ['2026-10-02 08:15:00', '交通出行', '滴滴出行', '快车', '支出', '12.00', '余额宝', '交易成功', 'ALI202610020002'],
  ['2026-10-03 09:00:00', '转账红包', '李四', '转账', '收入', '88.88', '余额', '交易成功', 'ALI202610030003'],
  ['2026-10-04 18:20:00', '日用百货', '盒马鲜生', '水果蔬菜', '支出', '156.40', '余额宝', '交易成功', 'ALI202610040004'],
  ['2026-10-05 10:00:00', '日用百货', '某某便利店', '饮料', '支出', '5.00', '余额宝', '交易关闭', 'ALI202610050005'],
  ['2026-10-06 11:00:00', '日用百货', '某某超市', '日用品', '支出', '30.00', '余额宝', '退款成功', 'ALI202610060006'],
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '账单明细');
XLSX.writeFile(workbook, 'tests/fixtures/alipay-sample.xls', { bookType: 'biff8' });
console.log('alipay xls written:', fs.statSync('tests/fixtures/alipay-sample.xls').size, 'bytes');
