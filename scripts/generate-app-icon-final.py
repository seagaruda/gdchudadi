#!/usr/bin/env python3
"""用最终设计稿（/tmp/ai_chuDaDee_icon_final.png，216×216 RGBA 圆角绿底+倾斜黑桃2）生成全套图标。

母版保存在 scripts/store-icons/source-icon-final.png（可复现）。
输出：
  mipmap-{l,m,h,xh,xxh,xxxh}dpi/
    ic_launcher.png            保留透明圆角，36/48/72/96/144/192
    ic_launcher_round.png      圆形裁切
    ic_launcher_foreground.png 自适应前景：设计稿缩到安全区居中
    ic_launcher_background.png 自适应背景：纯深绿
  scripts/store-icons/app-icon-{216,512}.png, app-icon-512-rounded.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")
STORE = os.path.join(ROOT, "scripts/store-icons")
SRC = os.path.join(STORE, "source-icon-final.png")

DENSITIES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"ldpi": 108, "mdpi": 162, "hdpi": 216, "xhdpi": 324, "xxhdpi": 432, "xxxhdpi": 432}


def circle_mask(size):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def rounded_mask(size, ratio=0.225):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * ratio), fill=255
    )
    return m.resize((size, size), Image.LANCZOS)


def upscale(img, size):
    """母版仅 216px：放大后轻度锐化，减少发虚"""
    out = img.resize((size, size), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))


def sample_bg(master):
    """取设计稿内部绿色作为自适应背景色（避开透明圆角）"""
    w, h = master.size
    px = master.convert("RGB").getpixel((w // 2, max(4, int(h * 0.06))))
    return px


def main():
    master = Image.open(SRC).convert("RGBA")
    w, h = master.size
    bg = sample_bg(master)

    for d, size in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)

        # legacy：保留设计稿自身的圆角与透明边
        master.resize((size, size), Image.LANCZOS).save(
            os.path.join(folder, "ic_launcher.png"), optimize=True)

        # 圆形图标：艺术图圆形裁切
        rnd = master.resize((size, size), Image.LANCZOS)
        rnd.putalpha(circle_mask(size))
        rnd.save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)

    for d, size in ADAPTIVE.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)

        # 前景：设计稿缩到 76%（安全区内），居中，透明底
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = int(size * 0.76)
        art = upscale(master, inner)
        off = (size - inner) // 2
        fg.paste(art, (off, off), art)
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"), optimize=True)

        # 背景：纯深绿，与设计稿绿底同色
        Image.new("RGB", (size, size), bg).save(
            os.path.join(folder, "ic_launcher_background.png"), optimize=True)

    # 商店图
    os.makedirs(STORE, exist_ok=True)
    master.resize((216, 216), Image.LANCZOS).save(
        os.path.join(STORE, "app-icon-216.png"), optimize=True)
    upscale(master, 512).save(
        os.path.join(STORE, "app-icon-512.png"), optimize=True)
    big = upscale(master, 512)
    big.putalpha(rounded_mask(512))
    big.save(os.path.join(STORE, "app-icon-512-rounded.png"), optimize=True)

    # 网页/关于页用的 logo
    upscale(master, 1024).save(
        os.path.join(ROOT, "src/assets/logo.png"), optimize=True)
    master.resize((180, 180), Image.LANCZOS).save(
        os.path.join(ROOT, "apple-touch-icon.png"), optimize=True)

    print(f"母版 {master.size} → 自适应背景色 #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}")
    print("已生成:", ", ".join(f"{k}={v}px" for k, v in DENSITIES.items()), "+ 自适应 + 商店图 + logo")


if __name__ == "__main__":
    main()
