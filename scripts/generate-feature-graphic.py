#!/usr/bin/env python3
# Google Play 特征图 1024x500（无透明通道）
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys, os

W, H = 1024, 500
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
REG  = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
TC = 3  # Traditional Chinese face inside the ttc

def font(path, size, idx=TC):
    try:
        return ImageFont.truetype(path, size, index=idx)
    except Exception:
        return ImageFont.truetype(path, size)

base = Image.new("RGB", (W, H), (8, 42, 32))
d = ImageDraw.Draw(base)

# 绿呢渐变 + 中心光
for y in range(H):
    t = y / (H - 1)
    r = int(9 + 6 * (1 - t)); g = int(46 + 26 * (1 - t)); b = int(35 + 20 * (1 - t))
    d.line([(0, y), (W, y)], fill=(r, g, b))

glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([W * 0.30, -H * 0.55, W * 1.05, H * 1.25], fill=90)
glow = glow.filter(ImageFilter.GaussianBlur(90))
base = Image.composite(Image.new("RGB", (W, H), (34, 120, 84)), base, glow)
d = ImageDraw.Draw(base)

# 角落花色水印
wm = font(REG, 260)
for ch, xy in [("♠", (-50, 250)), ("♥", (900, -190)), ("♦", (880, 330))]:
    d.text(xy, ch, font=wm, fill=(255, 255, 255, 12))

# 图标
icon = Image.open("/home/zhp/gdchudadi/scripts/store-icons/app-icon-512.png").convert("RGB")
IS = 250
icon = icon.resize((IS, IS), Image.LANCZOS)
mask = Image.new("L", (IS, IS), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, IS, IS], radius=56, fill=255)
# 图标投影
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([72 + 6, 126 + 10, 72 + IS + 6, 126 + IS + 10], radius=56, fill=(0, 0, 0, 90))
sh = sh.filter(ImageFilter.GaussianBlur(14))
base = Image.alpha_composite(base.convert("RGBA"), sh).convert("RGB")
base.paste(icon, (72, 126), mask)
d = ImageDraw.Draw(base)

# 文案
TX = 360
RIGHT = W - 56           # 右安全边距
title = "單機AI·鋤大Dee"
tsize = 74
while tsize > 40 and d.textlength(title, font=font(BOLD, tsize)) > RIGHT - TX:
    tsize -= 2
tf = font(BOLD, tsize)
d.text((TX + 2, 122), title, font=tf, fill=(0, 0, 0, 120))
d.text((TX, 120), title, font=tf, fill=(255, 255, 255))

sub = "離線 4 人廣東鋤大地 · 會算牌的 AI 對手"
ssize = 33
while ssize > 22 and d.textlength(sub, font=font(REG, ssize)) > RIGHT - TX:
    ssize -= 1
d.text((TX, 232), sub, font=font(REG, ssize), fill=(198, 235, 214))

# 卖点标签
tags = ["無需聯網", "無廣告", "AI 會算牌"]
x = TX
for t in tags:
    f = font(BOLD, 25)
    tw = d.textlength(t, font=f)
    d.rounded_rectangle([x, 300, x + tw + 34, 352], radius=26, fill=(22, 92, 66), outline=(120, 200, 160), width=2)
    d.text((x + 17, 312), t, font=f, fill=(224, 248, 235))
    x += tw + 48

foot = "SeaGaruda 工作室"
d.text((TX, 392), foot, font=font(REG, 24), fill=(150, 196, 172))

out = sys.argv[1] if len(sys.argv) > 1 else "/home/zhp/gdchudadi/scripts/store-icons/feature-1024x500.png"
base.save(out, "PNG", optimize=True)
print(out, base.size, base.mode, os.path.getsize(out) // 1024, "KB")
