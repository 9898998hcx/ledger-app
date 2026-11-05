import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';

const fontBytes = fs.readFileSync('C:/Windows/Fonts/simhei.ttf');
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(fontBytes, { subset: true });
const page = doc.addPage([595, 842]);
const lines = [
  '支付宝交易记录明细查询',
  '账号:[test@example.com]',
  '起始日期:[2026-10-01 00:00:00]  终止日期:[2026-10-31 23:59:59]',
  '交易时间 交易分类 交易对方 商品说明 收/支 金额 收/付款方式 交易状态 交易订单号',
  '2026-10-01 12:30:00 餐饮美食 肯德基 午餐 支出 23.50 余额宝 交易成功 2026100122001234567890',
  '2026-10-02 08:15:00 交通出行 滴滴出行 快车 支出 12.00 余额宝 交易成功 2026100222001234567891',
  '2026-10-03 09:00:00 转账红包 李四 转账 收入 88.88 余额 交易成功 2026100322001234567892',
  '2026-10-04 18:20:00 日用百货 盒马鲜生 水果蔬菜 支出 156.40 余额宝 交易成功 2026100422001234567893',
  '2026-10-05 10:00:00 日用百货 某某便利店 饮料 支出 5.00 余额宝 交易关闭 2026100522001234567894',
  '2026-10-06 11:00:00 日用百货 某某超市 日用品 支出 30.00 余额宝 退款成功 2026100622001234567895',
];
let y = 800;
for (const line of lines) {
  page.drawText(line, { x: 30, y, size: 9, font });
  y -= 24;
}
fs.writeFileSync('tests/fixtures/alipay-sample.pdf', await doc.save());
console.log('alipay pdf written');

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync('tests/fixtures/alipay-sample.pdf'));
const pdf = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
const page1 = await pdf.getPage(1);
const content = await page1.getTextContent();
const text = content.items.map((i) => i.str).join('\n');
console.log('HAS_HEADER:', text.includes('交易时间'));
console.log('HAS_DATA:', text.includes('肯德基') && text.includes('退款成功'));
