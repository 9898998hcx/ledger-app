import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';

const doc = await PDFDocument.create();
const page = doc.addPage([600, 800]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const lines = [
  'Bank Statement (sanitized fixture)',
  '2026-10-01 12:30:00 Meituan -23.50',
  '2026-10-02 08:15:00 Didi -12.00',
  '2026-10-03 09:00:00 Zhang San 88.88',
  '2026-10-04 18:20:00 Hema -156.40',
  '2026-10-05 10:00:00 Convenience Store -5.00',
];
let y = 720;
for (const line of lines) {
  page.drawText(line, { x: 50, y, size: 14, font });
  y -= 30;
}
fs.writeFileSync('tests/fixtures/bank-sample.pdf', await doc.save());
console.log('PDF written');

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync('tests/fixtures/bank-sample.pdf'));
const pdf = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
const page1 = await pdf.getPage(1);
const content = await page1.getTextContent();
console.log('ITEMS:', content.items.length);
console.log(content.items.map((i) => i.str).join(' | '));
