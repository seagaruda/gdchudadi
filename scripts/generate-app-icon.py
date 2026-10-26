#!/usr/bin/env python3
"""生成「單機AI·鋤大Dee」應用圖標（可復現）。

設計：深墨綠徑向漸變底 + 傾斜黑桃 2 撲克牌（牌面真實索引 + 牌心雙黑桃）。
輸出：Android 各密度 ic_launcher / _round / 自適應前景後景、apple-touch-icon、商店 216/512。

用法：python3 scripts/generate-app-icon.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")

MASTER = 2048
CARD_RATIO = 0.641          # 牌高 / 畫布高
CARD_ASPECT = 0.707         # 牌寬 / 牌高（接近 1:√2）
CARD_CENTER = (0.5, 0.484)
CARD_ANGLE = 12.0           # 逆時針（PIL 正角 = CCW）
BG_CENTER = (43, 106, 87)   # #2B6A57
BG_MID = (15, 61, 48)       # #0F3D30
BG_EDGE = (4, 48, 35)       # #043023
CARD_FILL = (245, 244, 240)
CARD_EDGE = (12, 12, 12)

SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def lerp(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def background(size):
    """徑向漸變 + 暗角 + 細噪點。先小圖畫同心橢圓再放大，避免逐像素開銷。"""
    small = max(256, size // 4)
    canvas = Image.new("RGB", (small, small), BG_EDGE)
    d = ImageDraw.Draw(canvas)
    steps = 220
    max_r = small * 0.78
    for i in range(steps, 0, -1):
        t = i / steps
        r = max_r * t
        if t < 0.55:
            col = lerp(BG_CENTER, BG_MID, t / 0.55)
        else:
            col = lerp(BG_MID, BG_EDGE, (t - 0.55) / 0.45)
        cx, cy = small * 0.5, small * 0.45
        d.ellipse([cx - r, cy - r * 1.02, cx + r, cy + r * 1.02], fill=col)
    canvas = canvas.resize((size, size), Image.BICUBIC).filter(ImageFilter.GaussianBlur(size / 512))
    # 細噪點
    noise = Image.new("L", (size // 2, size // 2))
    rnd = random.Random(7)
    noise.putdata([128 + rnd.randint(-14, 14) for _ in range(noise.width * noise.height)])
    noise = noise.resize((size, size), Image.BILINEAR).convert("RGB")
    canvas = Image.blend(canvas, noise, 0.045)
    # 四角暗角
    vig = Image.new("L", (size // 2, size // 2), 0)
    dv = ImageDraw.Draw(vig)
    dv.ellipse([-size * 0.12, -size * 0.12, size * 0.62, size * 0.62], fill=110)
    vig = vig.resize((size, size), Image.BICUBIC).filter(ImageFilter.GaussianBlur(size / 24))
    dark = Image.new("RGB", (size, size), (0, 12, 8))
    canvas = Image.composite(canvas, dark, vig.point(lambda v: 255 - int((255 - v) * 0.0)))
    canvas = Image.composite(dark, canvas, vig.point(lambda v: 255 - v))
    return canvas


SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def spade_glyph(height):
    """标准黑桃字形（DejaVuSans-Bold ♠），按目标高度裁紧后返回 RGBA 黑色图形。"""
    f = ImageFont.truetype(SANS_BOLD, int(height * 1.9))
    probe = Image.new("L", (int(height * 2), int(height * 2)), 0)
    ImageDraw.Draw(probe).text((height * 0.2, height * 0.2), "\u2660", font=f, fill=255)
    bbox = probe.getbbox()
    glyph = Image.new("RGBA", (probe.width, probe.height), (10, 10, 10, 0))
    glyph.putalpha(probe)
    glyph = glyph.crop(bbox)
    scale = height / glyph.height
    return glyph.resize((max(1, int(glyph.width * scale)), int(height)), Image.LANCZOS)


def draw_text_center(d, box, text, font, fill):
    x0, y0, x1, y1 = box
    bb = d.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((x0 + (x1 - x0 - tw) / 2 - bb[0], y0 + (y1 - y0 - th) / 2 - bb[1]), text, font=font, fill=fill)


def card_layer(cw, ch):
    """未旋轉牌面（含白底、細邊、索引、雙黑桃）。"""
    ss = 2
    W, H = int(cw * ss), int(ch * ss)
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    radius = max(2, int(W * 0.045))
    # 白底 + 極輕漸變（上部略亮）
    body = Image.new("RGBA", (W, H), CARD_FILL + (255,))
    grad = Image.new("L", (1, H))
    for y in range(H):
        grad.putpixel((0, y), 255 - int(9 * (y / H)))
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade.putalpha(grad.resize((W, H)).point(lambda v: int((255 - v) * 0.55)))
    body = Image.alpha_composite(body, shade)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=radius, fill=255)
    card.paste(body, (0, 0), mask)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=radius, outline=CARD_EDGE + (255,), width=max(2, int(W * 0.016)))

    ink = (14, 14, 14, 255)
    # 牌心雙黑桃（字形渲染，形狀標準）
    ph = int(W * 0.385)
    for cy_f, flip in ((0.30, False), (0.68, True)):
        sp = spade_glyph(ph)
        if flip:
            sp = sp.rotate(180)
        card.alpha_composite(sp, (int((W - sp.width) / 2), int(H * cy_f - sp.height / 2)))
    # 角落索引（左上 + 旋轉 180 的右下）
    idx_w, idx_h = int(W * 0.34), int(H * 0.22)
    idx = Image.new("RGBA", (idx_w, idx_h), (0, 0, 0, 0))
    di = ImageDraw.Draw(idx)
    f_num = ImageFont.truetype(SERIF_BOLD, int(idx_w * 0.80))
    draw_text_center(di, (0, 0, idx_w, int(idx_h * 0.56)), "2", f_num, ink)
    sg = spade_glyph(int(idx_h * 0.30))
    idx.alpha_composite(sg, (int((idx_w - sg.width) / 2), int(idx_h * 0.52)))
    card.alpha_composite(idx, (int(W * 0.055), int(H * 0.035)))
    card.alpha_composite(idx.rotate(180), (int(W - idx_w - W * 0.055), int(H - idx_h - H * 0.035)))
    return card.resize((int(cw), int(ch)), Image.LANCZOS)


def compose(size, card_scale=1.0, transparent=False, rounded=False):
    """size: 輸出面邊長（母版按 4× 畫後降採樣）"""
    ss = MASTER / size
    N = MASTER
    base = Image.new("RGBA", (N, N), (0, 0, 0, 0) if transparent else (0, 0, 0, 255))
    if not transparent:
        base = background(N).convert("RGBA")

    ch = N * CARD_RATIO * card_scale
    cw = ch * CARD_ASPECT
    card = card_layer(cw, ch).rotate(CARD_ANGLE, resample=Image.BICUBIC, expand=True)

    # 投影
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    sh = Image.new("RGBA", card.size, (0, 0, 0, 125))
    a = card.split()[3].point(lambda v: int(v * 0.75))
    sh.putalpha(a)
    shadow.alpha_composite(sh, (int(N * CARD_CENTER[0] - card.width / 2 + N * 0.012),
                                int(N * CARD_CENTER[1] - card.height / 2 + N * 0.016)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(N * 0.012))
    base = Image.alpha_composite(base, shadow)
    base.alpha_composite(card, (int(N * CARD_CENTER[0] - card.width / 2),
                                int(N * CARD_CENTER[1] - card.height / 2)))

    if rounded:
        r = int(N * 0.225)
        mask = Image.new("L", (N, N), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, N - 1, N - 1], radius=r, fill=255)
        base.putalpha(mask)

    out = base.resize((size, size), Image.LANCZOS)
    if transparent or out.mode == "RGBA":
        return out
    return out.convert("RGB")


def circle_icon(size):
    """legacy round 圖標：圓形遮罩 + 牌略縮，避免出圈。"""
    art = compose(size * 2, card_scale=0.86).convert("RGBA")
    mask = Image.new("L", art.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, art.size[0] - 1, art.size[1] - 1], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(size / 40))
    out = Image.new("RGBA", art.size, (0, 0, 0, 0))
    out.paste(art, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def foreground(size):
    """自適應前景：透明底，牌縮到 62%（落在 72/108 安全區內）。"""
    return compose(size, card_scale=0.62, transparent=True)


def background_png(size):
    return background(size)


DENSITIES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"ldpi": 81, "mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def main():
    written = []
    for dpi, sz in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{dpi}")
        os.makedirs(folder, exist_ok=True)
        p = os.path.join(folder, "ic_launcher.png")
        compose(sz).save(p, "PNG", optimize=True)
        written.append((p, sz))
        p = os.path.join(folder, "ic_launcher_round.png")
        circle_icon(sz).save(p, "PNG", optimize=True)
        written.append((p, sz))
        p = os.path.join(folder, "ic_launcher_foreground.png")
        foreground(ADAPTIVE[dpi]).save(p, "PNG", optimize=True)
        written.append((p, ADAPTIVE[dpi]))
        p = os.path.join(folder, "ic_launcher_background.png")
        background_png(ADAPTIVE[dpi]).save(p, "PNG", optimize=True)
        written.append((p, ADAPTIVE[dpi]))

    # web / 商店
    compose(180).save(os.path.join(ROOT, "apple-touch-icon.png"), "PNG", optimize=True)
    compose(180).save(os.path.join(ROOT, "www/apple-touch-icon.png"), "PNG", optimize=True)
    assets = os.path.join(ROOT, "scripts/store-icons")
    os.makedirs(assets, exist_ok=True)
    compose(216).save(os.path.join(assets, "app-icon-216.png"), "PNG", optimize=True)
    compose(512).save(os.path.join(assets, "app-icon-512.png"), "PNG", optimize=True)
    compose(512, rounded=True).save(os.path.join(assets, "app-icon-512-rounded.png"), "PNG", optimize=True)
    compose(48).resize((192, 192), Image.NEAREST).save("/tmp/icon-check-48.png")
    compose(1024, rounded=True).save("/tmp/icon-preview-1024.png")

    for p, sz in written:
        im = Image.open(p)
        assert im.size == (sz, sz), (p, im.size)
    print(f"OK {len(written)} 個 Android 資源 + web/商店圖標")


if __name__ == "__main__":
    main()
