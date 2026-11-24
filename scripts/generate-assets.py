#!/usr/bin/env python3
"""Generate PSYCHIC wallpapers + app icon (run once; outputs go to resources/)."""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEMES = json.load(open(os.path.join(ROOT, 'src/shared/themes.json'), encoding='utf-8'))['themes']
OUT = os.path.join(ROOT, 'resources', 'wallpapers')
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080

def hexrgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def mix(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))

def vertical_gradient(size, top, bottom):
    w, h = size
    small = Image.new('RGB', (1, h))
    d = ImageDraw.Draw(small)
    for y in range(h):
        d.point((0, y), mix(top, bottom, y / max(1, h - 1)))
    return small.resize(size, Image.BILINEAR)

def glow(size, center, radius, color, strength=1.0):
    w, h = size
    small = Image.new('RGB', (max(1, w // 8), max(1, h // 8)), (0, 0, 0))
    d = ImageDraw.Draw(small)
    cx, cy = center[0] / 8, center[1] / 8
    r = max(2, radius / 8)
    for i in range(int(r), 0, -1):
        t = (i / r) ** 2
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=tuple(int(c * (1 - t) * strength) for c in color))
    small = small.filter(ImageFilter.GaussianBlur(6)).resize(size, Image.BILINEAR)
    return small

def add_glow(img, center, radius, color, strength=1.0):
    g = glow(img.size, center, radius, color, strength)
    return Image.blend(img, Image.blend(img, g, 0.9), 0.85)

def skyline(draw, base_y, color, seed=1):
    rnd = random.Random(seed)
    x = 0
    while x < W:
        bw = rnd.randint(40, 130)
        bh = rnd.randint(60, 340)
        top = base_y - bh
        draw.rectangle([x, top, x + bw, base_y], fill=color)
        # antenna
        if rnd.random() < 0.35:
            ax = x + bw // 2
            ah = rnd.randint(20, 80)
            draw.rectangle([ax, top - ah, ax + 3, top], fill=color)
            draw.ellipse([ax - 4, top - ah - 4, ax + 7, top - ah + 7], fill=color)
        # windows
        for wy in range(top + 12, base_y - 10, 18):
            for wx in range(x + 8, x + bw - 6, 14):
                if rnd.random() < 0.45:
                    c = rnd.choice([(0, 240, 255), (255, 45, 149), (255, 204, 77)])
                    draw.rectangle([wx, wy, wx + 4, wy + 6], fill=c)
        x += bw + rnd.randint(6, 26)

def perspective_grid(img, horizon, color, alpha=90):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # horizontal lines with increasing spacing
    y = horizon
    step = 4
    while y < H:
        d.line([(0, y), (W, y)], fill=color + (alpha,), width=2)
        step *= 1.18
        y += step
    # converging verticals
    vpx = W // 2
    for i in range(-24, 25):
        x_bottom = vpx + i * (W / 12)
        d.line([(vpx + i * 6, horizon), (x_bottom, H)], fill=color + (int(alpha * 0.75),), width=2)
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')

def scanlines(img, alpha=26):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(0, H, 4):
        d.line([(0, y), (W, y)], fill=(0, 0, 0, alpha), width=1)
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')

def stars(img, colors, seed=3):
    rnd = random.Random(seed)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(260):
        x, y = rnd.randrange(W), rnd.randrange(int(H * 0.62))
        r = rnd.choice([1, 1, 1, 2])
        c = rnd.choice(colors)
        a = rnd.randint(40, 160)
        d.ellipse([x, y, x + r, y + r], fill=c + (a,))
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')

def make(theme, index):
    c = theme['colors']
    bg0, bg1, bg2 = hexrgb(c['bg0']), hexrgb(c['bg1']), hexrgb(c['bg2'])
    acc, acc2 = hexrgb(c['accent']), hexrgb(c['accent2'])
    acc3 = hexrgb(c.get('accent3', c['accent']))

    img = vertical_gradient((W, H), bg0, bg2)
    img = add_glow(img, (W * 0.18, H * 0.24), int(W * 0.55), acc, 0.55)
    img = add_glow(img, (W * 0.84, H * 0.68), int(W * 0.5), acc2, 0.45)
    img = add_glow(img, (W * 0.55, H * 0.12), int(W * 0.4), acc3, 0.35)
    img = stars(img, [acc, acc2, (255, 255, 255)], seed=index + 7)

    horizon = int(H * 0.66)
    # glow band at horizon
    band = Image.new('RGBA', img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    for i in range(70):
        t = i / 70
        bd.rectangle([0, horizon - i, W, horizon + i], fill=acc + (int(26 * (1 - t)),))
    band = band.filter(ImageFilter.GaussianBlur(10))
    img = Image.alpha_composite(img.convert('RGBA'), band).convert('RGB')

    img = perspective_grid(img, horizon, acc, alpha=80)

    # skyline silhouette
    sil = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sil)
    skyline(sd, horizon, bg0 + (235,), seed=index + 1)
    img = Image.alpha_composite(img.convert('RGBA'), sil).convert('RGB')

    # big glowing sun / moon disc behind skyline
    disc = Image.new('RGBA', img.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(disc)
    r = int(H * 0.17)
    cx, cy = int(W * 0.72), int(horizon - H * 0.02)
    dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=acc2 + (60,))
    dd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=acc2 + (150,), width=4)
    for i in range(6):
        yy = cy + int(r * 0.12) + i * int(r * 0.16)
        half = int(math.sqrt(max(0, r * r - (yy - cy) ** 2)))
        dd.rectangle([cx - half, yy, cx + half, yy + int(r * 0.05)], fill=bg0 + (200,))
    disc = disc.filter(ImageFilter.GaussianBlur(1.5))
    img = Image.alpha_composite(img.convert('RGBA'), disc).convert('RGB')

    img = scanlines(img, 22)
    # vignette
    vig = Image.new('L', (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-W * 0.25, -H * 0.35, W * 1.25, H * 1.35], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160))
    dark = Image.new('RGB', (W, H), (0, 0, 0))
    img = Image.composite(img, dark, vig)
    return img

for i, theme in enumerate(THEMES):
    name = theme.get('wallpaper', f"wallpapers/{theme['id']}.jpg").split('/')[-1]
    if not name.lower().endswith(('.jpg', '.jpeg', '.png')):
        name = f"{theme['id']}.jpg"
    path = os.path.join(OUT, name)
    make(theme, i).save(path, 'JPEG', quality=86, optimize=True)
    print('wallpaper', path, os.path.getsize(path) // 1024, 'KB')

# ── App icon ────────────────────────────────────────────────────────────────
def make_icon(size=512):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(S * 0.02)
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=int(S * 0.22), fill=(4, 5, 13, 255))
    # grid
    for i in range(0, S, int(S / 10)):
        d.line([(i, 0), (i, S)], fill=(0, 240, 255, 18), width=max(1, S // 400))
        d.line([(0, i), (S, i)], fill=(0, 240, 255, 18), width=max(1, S // 400))
    # glows
    glow_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    gd.ellipse([S * 0.05, S * 0.05, S * 0.55, S * 0.55], fill=(0, 240, 255, 110))
    gd.ellipse([S * 0.45, S * 0.45, S * 0.98, S * 0.98], fill=(255, 45, 149, 90))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(int(S * 0.09)))
    img = Image.alpha_composite(img, glow_layer)
    d = ImageDraw.Draw(img)
    # logo: hexagon + inner "P" spark
    cx, cy = S / 2, S / 2
    R = S * 0.30
    pts = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)))
           for a in range(-90, 270, 60)]
    d.polygon(pts, outline=(0, 240, 255, 255), width=max(3, int(S * 0.022)))
    r2 = R * 0.62
    pts2 = [(cx + r2 * math.cos(math.radians(a)), cy + r2 * math.sin(math.radians(a)))
            for a in range(-90, 270, 60)]
    d.polygon(pts2, outline=(255, 45, 149, 220), width=max(2, int(S * 0.016)))
    d.ellipse([cx - S * 0.055, cy - S * 0.055, cx + S * 0.055, cy + S * 0.055], fill=(233, 237, 255, 255))
    d.line([(cx, cy + S * 0.06), (cx, cy + S * 0.16)], fill=(233, 237, 255, 255), width=max(2, int(S * 0.014)))
    d.line([(cx, cy + S * 0.03), (cx + S * 0.075, cy - S * 0.06)], fill=(233, 237, 255, 255), width=max(2, int(S * 0.014)))
    return img.resize((size, size), Image.LANCZOS)

icon = make_icon(512)
icon_path = os.path.join(ROOT, 'resources', 'icon.png')
icon.save(icon_path)
ico_path = os.path.join(ROOT, 'resources', 'icon.ico')
icon.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icon', icon_path, os.path.getsize(icon_path) // 1024, 'KB')
print('icon', ico_path, os.path.getsize(ico_path) // 1024, 'KB')
