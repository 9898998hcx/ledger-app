import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';

const fontBytes = fs.readFileSync('C:/Windows/Fonts/simhei.ttf');
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(fontBytes, { subset: true });
const page = doc.addPage([595, 842]);
const lines = [
  '微信支付账单明细',
  '微信昵称：[测试用户]',
  '起始时间：[2026-10-01 00:00:00]  终止时间：[2026-10-31 23:59:59]',
  '交易时间 交易类型 交易对方 商品 收/支 金额(元) 支付方式 当前状态 交易单号',
  '2026-10-01 12:30:00 商户消费 美团外卖 午餐 支出 23.50 零钱 支付成功 WX202610010001',
  '2026-10-02 08:15:00 商户消费 滴滴出行 快车 支出 12.00 零钱 支付成功 WX202610020002',
  '2026-10-03 09:00:00 转账 张三 红包 收入 88.88 零钱 已存入零钱 WX202610030003',
  '2026-10-04 18:20:00 商户消费 盒马鲜生 水果蔬菜 支出 156.40 零钱 支付成功 WX202610040004',
  '2026-10-05 10:00:00 商户消费 某某便利店 饮料 支出 5.00 零钱 交易关闭 WX202610050005',
];
let y = 800;
for (const line of lines) {
  page.drawText(line, { x: 40, y, size: 10, font });
  y -= 24;
}
fs.writeFileSync('tests/fixtures/wechat-sample.pdf', await doc.save());
console.log('wechat pdf written');

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync('tests/fixtures/wechat-sample.pdf'));
const pdf = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
const page1 = await pdf.getPage(1);
const content = await page1.getTextContent();
console.log('ITEMS:', content.items.length);
for (const item of content.items) {
  console.log(JSON.stringify(item.str));
}
