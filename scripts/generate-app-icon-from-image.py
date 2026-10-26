#!/usr/bin/env python3
"""直接用设计稿位图生成应用图标（不重绘）。

输入：scripts/store-icons/source-icon.png（216×216，圆角绿底 + 倾斜黑桃2）
做法：
  1. 抠掉画面外的白底（设计稿是圆角方形贴在白画布上），用「行/列边缘延展」把四个圆角缺口补成满版纯绿，接缝不可见。
  2. 满版图直接降采样出 Android 各密度 legacy 图标 / 圆形图标 / apple-touch-icon / 商店 216+512。
  3. 自适应图标：前景=从原图抠出的扑克牌（透明底，216→432 用 LANCZOS + 轻微锐化），背景=同色系径向渐变。

用法：python3 scripts/generate-app-icon-from-image.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")
STORE = os.path.join(ROOT, "scripts/store-icons")
SRC = os.path.join(STORE, "source-icon.png")


def load_source():
    im = Image.open(SRC).convert("RGB")
    if im.size != (216, 216):
        im = im.resize((216, 216), Image.LANCZOS)
    return im


def is_green(p):
    """设计稿的绿色底（含暗角/渐变），非绿即视为画面外白底或牌面。"""
    r, g, b = p
    return g > r + 8 and g > b + 6 and 20 < g < 190 and max(p) < 205


def green_background_bbox(im):
    """找设计稿里圆角绿色方块的边界（绿色像素的外接框）。"""
    px = im.load()
    W, H = im.size
    xs = [x for x in range(W) if any(is_green(px[x, y]) for y in range(H))]
    ys = [y for y in range(H) if any(is_green(px[x, y]) for x in range(W))]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def edge_extend(tile):
    """把圆角外的白角用「同行/同列最近的绿色像素」延展成满版，接缝不可见。"""
    im = tile.copy()
    W, H = im.size
    px = im.load()
    for y in range(H):
        row = [px[x, y] for x in range(W)]
        idx = [i for i, p in enumerate(row) if is_green(p)]
        if not idx:
            continue
        first, last = idx[0], idx[-1]
        for x in range(first):
            px[x, y] = row[first]
        for x in range(last + 1, W):
            px[x, y] = row[last]
    for x in range(W):
        col = [px[x, y] for y in range(H)]
        idx = [i for i, p in enumerate(col) if is_green(p)]
        if not idx:
            continue
        first, last = idx[0], idx[-1]
        for y in range(first):
            px[x, y] = col[first]
        for y in range(last + 1, H):
            px[x, y] = col[last]
    return im


def master():
    """满版母版（216×216，无白角）。"""
    src = load_source()
    x0, y0, x1, y1 = green_background_bbox(src)
    tile = src.crop((x0, y0, x1, y1))
    side = max(tile.size)
    if tile.size != (side, side):
        tile = tile.resize((side, side), Image.LANCZOS)
    return edge_extend(tile)


def card_cutout(M):
    """从母版抠出扑克牌（透明底）：非绿色主导的像素视为牌面/牌边/墨色。"""
    W, H = M.size
    mask = Image.new("L", (W, H), 0)
    src = M.load()
    mp = mask.load()
    for y in range(H):
        for x in range(W):
            r, g, b = src[x, y]
            mp[x, y] = 0 if is_green((r, g, b)) else 255
    mask = mask.filter(ImageFilter.MedianFilter(3))
    # 只保留最大的连通区域附近：直接取 bbox 内 + 轻微羽化
    bbox = mask.getbbox()
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    card.paste(M.crop(bbox), (bbox[0], bbox[1]), mask.crop(bbox))
    card = card.crop(bbox)
    a = card.split()[3].filter(ImageFilter.GaussianBlur(0.6))
    card.putalpha(a)
    return card


def radial_bg(size):
    """与设计稿同色系的径向渐变底（自适应图标背景用）。"""
    center, mid, edge = (43, 106, 87), (15, 61, 48), (4, 48, 35)
    small = 256
    canvas = Image.new("RGB", (small, small), edge)
    d = ImageDraw.Draw(canvas)
    steps = 180
    for i in range(steps, 0, -1):
        t = i / steps
        col = tuple(round(a + (b - a) * (t / 0.55)) for a, b in zip(center, mid)) if t < 0.55 else \
              tuple(round(a + (b - a) * ((t - 0.55) / 0.45)) for a, b in zip(mid, edge))
        r = small * 0.78 * t
        cx, cy = small * 0.5, small * 0.45
        d.ellipse([cx - r, cy - r * 1.02, cx + r, cy + r * 1.02], fill=col)
    return canvas.resize((size, size), Image.BICUBIC).filter(ImageFilter.GaussianBlur(size / 400))


def upscale(im, size):
    out = im.resize((size, size), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))


DENSITIES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"ldpi": 81, "mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def main():
    M = master()
    M.save(os.path.join(STORE, "icon-master-fullbleed.png"))
    card = card_cutout(M)

    for dpi, sz in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{dpi}")
        os.makedirs(folder, exist_ok=True)
        (M if sz <= M.size[0] else upscale(M, sz)).resize((sz, sz), Image.LANCZOS) \
            .save(os.path.join(folder, "ic_launcher.png"), "PNG", optimize=True)
        # 圆形（legacy round）：圆遮罩
        circular = Image.new("RGBA", M.size, (0, 0, 0, 0))
        mask = Image.new("L", M.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, M.size[0] - 1, M.size[1] - 1], fill=255)
        circular.paste(M, (0, 0), mask)
        circular.resize((sz, sz), Image.LANCZOS).save(os.path.join(folder, "ic_launcher_round.png"), "PNG", optimize=True)
        # 自适应前景：牌（居中，占画布 ~66%，落在 72/108 安全区内）
        A = ADAPTIVE[dpi]
        fg = Image.new("RGBA", (A, A), (0, 0, 0, 0))
        scale = 0.74 * A / card.height
        cw, chh = int(card.width * scale), int(card.height * scale)
        c = upscale(card, chh).resize((cw, chh), Image.LANCZOS)
        fg.alpha_composite(c, ((A - cw) // 2, (A - chh) // 2))
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"), "PNG", optimize=True)
        radial_bg(A).save(os.path.join(folder, "ic_launcher_background.png"), "PNG", optimize=True)

    # web + 商店
    M.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, "apple-touch-icon.png"), "PNG", optimize=True)
    M.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, "www/apple-touch-icon.png"), "PNG", optimize=True)
    M.resize((216, 216), Image.LANCZOS).save(os.path.join(STORE, "app-icon-216.png"), "PNG", optimize=True)
    M.resize((512, 512), Image.LANCZOS).save(os.path.join(STORE, "app-icon-512.png"), "PNG", optimize=True)

    # 圆角预览（仅给人看）
    prev = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    big = upscale(M, 1024)
    prev.paste(big, (0, 0))
    rmask = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(rmask).rounded_rectangle([0, 0, 1023, 1023], radius=230, fill=255)
    prev.putalpha(rmask)
    prev.save("/tmp/icon-from-image-preview.png")

    print(f"OK 母版 {M.size} / 牌 {card.size} / 24 個 Android 資源 + web+商店")
    for p in ["/tmp/icon-from-image-preview.png"]:
        print(p, Image.open(p).size)


if __name__ == "__main__":
    main()
