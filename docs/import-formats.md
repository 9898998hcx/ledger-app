# 账单格式与解析细节

本文记录三端账单在解析时需要处理的真实差异，以及对应的实现位置。所有解析器都在 `src/domain/parsers/`，只依赖字符串 / 行数组，不依赖 React Native 或 Expo，因此可以在 Node 里直接单测。

## 微信支付账单

支持：CSV（UTF-8）、Excel（.xlsx / .xls）、PDF、纯文本。

- **CSV**：按表头匹配列，表头名兼容「交易时间 / 日期」「商户 / 交易对方」「类型 / 收支」「备注 / 摘要」等变体。
- **Excel**：读取**全部工作表**，自动挑选包含账单表头的那一张；表头前的说明行（最多 40 行）自动跳过；日期单元格自动格式化。
- **PDF**：pdfjs 提取文本后逐行识别「日期 + 两位小数金额」，按「收入 / 支出 / 其他」判断方向。
- **方向判定**：优先取「收/支」（或「类型」）列，其次按金额正负号；状态为「交易关闭 / 交易失败」的记录跳过并记入导入日志。
- **退款**：退款入账行（收/支 = 收入且状态含「退款」）计入收入并归类「退款」；被退的原支出行保留，净额自动对冲。

实现：`parsers/wechat.ts`（`parseWechatCsv` / `parseWechatRows` / `parseWechatText`）。

> 若导入后总行数为 0，界面会提示检查表头——需要至少包含「交易时间 / 日期」和「金额」两列。

## 支付宝账单

支持：CSV（GBK / UTF-8）、Excel（.xlsx / .xls）、PDF、记账本导出。

- **CSV**：GBK 与 UTF-8 自动识别；文件前部约 24 行元数据自动跳过。
- **Excel**：读取全部工作表，自动挑含账单表头的工作表；日期单元格与数值金额自动转换。
- **记账本 CSV**：兼容 `记录时间,分类,收支类型,金额,备注,账户,来源,标签` 表头（表头前的说明行同样自动跳过）；退款行归入收入 / 退款，投资理财等「不计收支」保持中性；金额兼容全角逗号（如 `1，098.92`）。
- **旧版 .xls**：SheetJS 读取 BIFF 格式；部分支付宝导出的 `.xls` 实际是 HTML 表格，会自动兜底解析。
- **PDF**：pdfjs 提取文本后逐行识别「日期 + 两位小数金额」，按「收入 / 支出 / 不计收支」判断方向。
- 状态为交易关闭 / 失败的记录跳过并记入导入日志；退款入账行计入收入并归类「退款」，失败时给出行号与原因。

实现：`parsers/alipay.ts`（`parseAlipayCsv` / `parseAlipayRows` / `parseAlipayText`）。

## 银行卡账单

支持：CSV（GBK / UTF-8）、Excel（.xlsx / .xls，含建行模板）、PDF、账单截图 OCR。

- 前 40 行内自动定位表头；Excel 自动挑工作表并转换日期 / 数值单元格；支持紧凑日期 `20261001`。
- 金额有三种表达，都能识别：

  1. 收入 / 支出分列（`收入金额` + `支出金额`）
  2. 单列金额 + `借贷标志`（借 = 支出，贷 = 收入）
  3. 单列金额带符号（负数 = 支出，正数 = 收入）

- 对方户名 / 摘要作为交易对方与说明，交易渠道作为支付方式；导入后自动分类，并参与跨平台去重。
- **渠道归属**：对方户名 / 附言 / 摘要中出现「微信 / 财付通 / 零钱」→ 归入 **微信** 渠道；出现「支付宝 / 余额宝」→ 归入 **支付宝** 渠道；其余归银行。这样"银行卡里扣的钱其实是微信支付"不会被算成两笔。

实现：`parsers/bank.ts`（CSV / 行数据）、`parsers/bank-text.ts`（PDF / OCR 文本）、`parsers/xls-rows.ts`、`parsers/xlsx-rows.ts`。

### 银行 PDF 与账单图片

- **PDF**：pdfjs 提取每页文本并按坐标聚合成行，再交给银行文本解析器（逐行识别日期 + 两位小数金额）。
- **图片**：tesseract.js 做 OCR（`chi_sim+eng`）。首次使用需要联网下载识别引擎与语言包（浏览器会缓存），之后可离线识别。
- **方向判定**：金额负号 = 支出、正号 = 收入；无符号时按「收入 / 支出 / 借 / 贷」关键词判断，同时出现两类关键词会跳过并记录错误。
- 目前仅 Web 端支持（桌面快捷方式即 Web 版）；移动端可导出 CSV 后导入。

实现：`src/app/pdf-text.ts`、`src/app/ocr-text.ts`。

## 解析器共用的工具

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 编码嗅探 | `domain/encoding.ts` | 判断 GBK / UTF-8，必要时用 `TextDecoder('gbk')` |
| 列名匹配 | `domain/parsers/columns.ts` | 表头候选集 + 位置兜底 |
| 金额转换 | `domain/money.ts` | 元 → 整数分，全角逗号 / 千分位 / 货币符号 |
| 日期归一 | `domain/date.ts` | 统一成 `YYYY-MM-DD HH:mm:ss` |
| CSV 切分 | `domain/csv.ts` | 处理引号包裹、逗号、换行 |

## 脱敏 fixtures

`tests/fixtures/` 覆盖了上面所有分支，可以当作"格式样例"参考：

| 文件 | 覆盖点 |
| --- | --- |
| `wechat-sample.csv` / `.xlsx` / `.pdf` / `wechat-text.txt` | 微信 CSV / Excel / PDF 文本 |
| `wechat-years.csv` / `wechat-refund.csv` / `wechat-bank-overlap.csv` | 跨年、退款、与银行重叠 |
| `alipay-sample.csv`（UTF-8）/ `alipay-sample.gbk.csv` | 支付宝两种编码 |
| `alipay-sample.xlsx` / `alipay-sample.xls` / `alipay-sample.pdf` / `alipay-text.txt` | Excel / BIFF / PDF 文本 |
| `alipay-cashbook.csv` / `alipay-cashbook.gbk.csv` | 记账本表头 |
| `bank-sample.csv` / `.gbk.csv` / `.xlsx` / `bank-ccb.xls` | 银行多格式 |
| `bank-income-expense.csv` | 收支分列 |
| `bank-sample.pdf` / `bank-image.png` | PDF 文本 / 图片 OCR |

这些文件都是构造出来的假数据，不含任何真实用户信息。
