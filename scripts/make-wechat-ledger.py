"""生成更接近真实微信导出的 fixture：多工作表 + 15 行说明 + 表头名称变体。"""
from openpyxl import Workbook

wb = Workbook()
ws0 = wb.active
ws0.title = "说明"
ws0.append(["微信支付账单说明"])
ws0.append(["本文件仅供测试使用"])

ws = wb.create_sheet("账单")
for i in range(15):
    ws.append([f"说明行 {i + 1}"])
ws.append(["日期", "类型", "商户", "备注", "金额", "状态", "订单号"])
rows = [
    ["2026-10-01 12:30:00", "支出", "美团外卖", "午餐", 23.50, "支付成功", "LEDGER001"],
    ["2026-10-03 09:00:00", "收入", "张三", "红包", 88.88, "支付成功", "LEDGER002"],
    ["2026-10-04 18:20:00", "支出", "盒马鲜生", "水果蔬菜", 156.40, "支付成功", "LEDGER003"],
    ["2026-10-05 10:00:00", "支出", "某某便利店", "饮料", 5.00, "交易关闭", "LEDGER004"],
    ["2026-10-06 11:00:00", "支出", "某某超市", "日用品", 30.00, "支付成功", "LEDGER005"],
]
for row in rows:
    ws.append(row)
wb.save("tests/fixtures/wechat-ledger.xlsx")
print("wechat ledger xlsx written")
