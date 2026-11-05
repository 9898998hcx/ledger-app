"""生成记账 App 图标（PNG 512 + 多尺寸 ICO）。"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 圆角渐变背景：靛蓝 -> 紫罗兰
radius = 112
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(79 + (124 - 79) * t)
    g = int(107 + (58 - 107) * t)
    b = int(255 + (237 - 255) * t)
    draw.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bg.paste(img, (0, 0), mask)
img = bg
draw = ImageDraw.Draw(img)

# 白色钱包卡片
card = [96, 150, 416, 360]
shadow = [104, 158, 424, 368]
draw.rounded_rectangle(shadow, radius=44, fill=(30, 20, 90, 60))
draw.rounded_rectangle(card, radius=44, fill=(255, 255, 255, 255))

# 钱包扣带
draw.rounded_rectangle([300, 226, 416, 292], radius=26, fill=(79, 107, 255, 255))
draw.ellipse([366, 246, 386, 266], fill=(255, 255, 255, 255))

# 人民币符号 ¥
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 130)
except Exception:
    font = ImageFont.load_default()
symbol = "¥"
bbox = draw.textbbox((0, 0), symbol, font=font)
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]
draw.text(((card[0] + card[2]) / 2 - w / 2 - 30, (card[1] + card[3]) / 2 - h / 2 - 18), symbol, font=font, fill=(40, 52, 140, 255))

# 右下角三根柱状图
bars = [(120, 330, 168, 392), (190, 306, 238, 392), (260, 276, 308, 392)]
for (x0, y0, x1, y1) in bars:
    draw.rounded_rectangle([x0, y0, x1, y1], radius=12, fill=(124, 58, 237, 255))

img.save("assets/ledger-icon.png")
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save("assets/ledger.ico", format="ICO", sizes=ico_sizes)
print("icon written:", os.path.getsize("assets/ledger-icon.png"), os.path.getsize("assets/ledger.ico"))
