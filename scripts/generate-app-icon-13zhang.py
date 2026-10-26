#!/usr/bin/env python3
"""用「13张 + 黑桃2」母版生成 Android 全套应用图标。

母版：scripts/store-icons/source-icon-13zhang.png（512×512，满版绿底，无需抠边）
输出：
  - mipmap-{l,m,h,xh,xxh,xxxh}dpi/ic_launcher.png        36/48/72/96/144/192
  - 同目录 ic_launcher_round.png                          圆形裁切
  - 同目录 ic_launcher_foreground.png（自适应前景，108dp） 108/162/216/324/432
  - 同目录 ic_launcher_background.png（纯深绿，同尺寸）
  - scripts/store-icons/app-icon-{216,512}.png 与 512 圆角版
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")
STORE = os.path.join(ROOT, "scripts/store-icons")
SRC = os.path.join(STORE, "source-icon-13zhang.png")

DENSITIES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"ldpi": 108, "mdpi": 162, "hdpi": 216, "xhdpi": 324, "xxhdpi": 432, "xxxhdpi": 432}


def circle_mask(size):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def rounded_mask(size, radius_ratio=0.225):
    m = Image.new("L", (size * 4, size * 4), 0)
    r = int(size * 4 * radius_ratio)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=r, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def flat_icon(master, size):
    """满版方图：直接高质量降采样"""
    return master.resize((size, size), Image.LANCZOS).convert("RGB")


def round_icon(master, size):
    img = flat_icon(master, size).convert("RGBA")
    img.putalpha(circle_mask(size))
    return img


def main():
    master = Image.open(SRC).convert("RGB")
    bg = master.getpixel((8, 8))  # 取样左上角底色

    for d, size in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)
        flat_icon(master, size).save(os.path.join(folder, "ic_launcher.png"), optimize=True)
        round_icon(master, size).save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)

    for d, size in ADAPTIVE.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        os.makedirs(folder, exist_ok=True)
        # 前景：整幅图标铺满 108dp 画布（内容居中，系统遮罩裁切后仍完整）
        flat_icon(master, size).convert("RGBA").save(
            os.path.join(folder, "ic_launcher_foreground.png"), optimize=True)
        # 背景：同色系纯色（前景已满版，背景只为兼容自适应遮罩）
        Image.new("RGB", (size, size), bg).save(
            os.path.join(folder, "ic_launcher_background.png"), optimize=True)

    # 商店图
    os.makedirs(STORE, exist_ok=True)
    flat_icon(master, 216).save(os.path.join(STORE, "app-icon-216.png"), optimize=True)
    flat_icon(master, 512).save(os.path.join(STORE, "app-icon-512.png"), optimize=True)
    big = flat_icon(master, 512).convert("RGBA")
    big.putalpha(rounded_mask(512))
    big.save(os.path.join(STORE, "app-icon-512-rounded.png"), optimize=True)

    print(f"母版 {master.size} → 底色 #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}")
    print("已生成:", ", ".join(f"{k}={v}px" for k, v in DENSITIES.items()))


if __name__ == "__main__":
    main()
