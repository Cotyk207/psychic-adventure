#!/usr/bin/env python3
"""Generate Android launcher mipmaps + dark cyberpunk splash screens from resources/icon.png using pure Python stdlib."""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_PATH = os.path.join(ROOT, 'resources', 'icon.png')
RES_DIR = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')


def read_rgba_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    w = h = 0
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b'IHDR':
            w, h, depth, colortype, _, _, _ = struct.unpack('>IIBBBBB', chunk)
            assert depth == 8 and colortype in (2, 6)
        elif ctype == b'IDAT':
            idat.extend(chunk)
        elif ctype == b'IEND':
            break
    raw = zlib.decompress(bytes(idat))
    bpp = 4 if colortype == 6 else 3
    stride = w * bpp
    pixels = bytearray(w * h * 4)
    prev = bytearray(stride)
    idx = 0
    for y in range(h):
        ftype = raw[idx]
        idx += 1
        row = bytearray(raw[idx:idx + stride])
        idx += stride
        if ftype == 1:
            for x in range(bpp, stride):
                row[x] = (row[x] + row[x - bpp]) & 0xFF
        elif ftype == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 0xFF
        elif ftype == 3:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((left + prev[x]) >> 1)) & 0xFF
        elif ftype == 4:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[x] = (row[x] + pr) & 0xFF
        prev = row
        if bpp == 4:
            pixels[y * w * 4:(y + 1) * w * 4] = row
        else:
            out_off = y * w * 4
            for x in range(w):
                pixels[out_off + x * 4:out_off + x * 4 + 4] = bytes((row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255))
    return w, h, pixels


def write_rgba_png(path, w, h, pixels):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(pixels[y * stride:(y + 1) * stride])

    def chunk(tag, body):
        crc = zlib.crc32(tag + body) & 0xFFFFFFFF
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    comp = zlib.compress(bytes(raw), 9)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', comp) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def resize_bilinear(src_w, src_h, src, dst_w, dst_h):
    out = bytearray(dst_w * dst_h * 4)
    sx = (src_w - 1) / max(1, dst_w - 1)
    sy = (src_h - 1) / max(1, dst_h - 1)
    for y in range(dst_h):
        fy = y * sy
        y0 = int(fy)
        y1 = min(src_h - 1, y0 + 1)
        wy = fy - y0
        for x in range(dst_w):
            fx = x * sx
            x0 = int(fx)
            x1 = min(src_w - 1, x0 + 1)
            wx = fx - x0
            i00 = (y0 * src_w + x0) * 4
            i10 = (y0 * src_w + x1) * 4
            i01 = (y1 * src_w + x0) * 4
            i11 = (y1 * src_w + x1) * 4
            di = (y * dst_w + x) * 4
            for c in range(4):
                top = src[i00 + c] * (1 - wx) + src[i10 + c] * wx
                bot = src[i01 + c] * (1 - wx) + src[i11 + c] * wx
                out[di + c] = int(round(top * (1 - wy) + bot * wy))
    return out


def make_round(w, h, src):
    out = bytearray(src)
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    r = min(w, h) / 2.0 - 0.5
    for y in range(h):
        for x in range(w):
            dist = math.hypot(x - cx, y - cy)
            di = (y * w + x) * 4
            if dist > r + 0.8:
                out[di + 3] = 0
            elif dist > r - 0.8:
                alpha = max(0.0, min(1.0, (r + 0.8 - dist) / 1.6))
                out[di + 3] = int(out[di + 3] * alpha)
    return out


def make_adaptive_foreground(canvas_size, icon_w, icon_h, icon_px):
    out = bytearray(canvas_size * canvas_size * 4)
    inner = int(round(canvas_size * 0.66))
    scaled = resize_bilinear(icon_w, icon_h, icon_px, inner, inner)
    off = (canvas_size - inner) // 2
    for y in range(inner):
        for x in range(inner):
            si = (y * inner + x) * 4
            di = ((y + off) * canvas_size + (x + off)) * 4
            out[di:di + 4] = scaled[si:si + 4]
    return out


def make_splash(w, h, icon_w, icon_h, icon_px):
    out = bytearray(w * h * 4)
    for i in range(0, w * h * 4, 4):
        out[i] = 7
        out[i + 1] = 8
        out[i + 2] = 13
        out[i + 3] = 255
    logo_sz = min(w, h) // 4
    logo = resize_bilinear(icon_w, icon_h, icon_px, logo_sz, logo_sz)
    ox = (w - logo_sz) // 2
    oy = (h - logo_sz) // 2
    for y in range(logo_sz):
        for x in range(logo_sz):
            si = (y * logo_sz + x) * 4
            di = ((y + oy) * w + (x + ox)) * 4
            a = logo[si + 3] / 255.0
            for c in range(3):
                out[di + c] = int(round(out[di + c] * (1 - a) + logo[si + c] * a))
    return out


def main():
    src_w, src_h, src_px = read_rgba_png(ICON_PATH)
    densities = {
        'mdpi': (48, 108),
        'hdpi': (72, 162),
        'xhdpi': (96, 216),
        'xxhdpi': (144, 324),
        'xxxhdpi': (192, 432),
    }
    for name, (sz, fg_sz) in densities.items():
        d = os.path.join(RES_DIR, f'mipmap-{name}')
        sq = resize_bilinear(src_w, src_h, src_px, sz, sz)
        rnd = make_round(sz, sz, sq)
        fg = make_adaptive_foreground(fg_sz, src_w, src_h, src_px)
        write_rgba_png(os.path.join(d, 'ic_launcher.png'), sz, sz, sq)
        write_rgba_png(os.path.join(d, 'ic_launcher_round.png'), sz, sz, rnd)
        write_rgba_png(os.path.join(d, 'ic_launcher_foreground.png'), fg_sz, fg_sz, fg)

    splash = make_splash(480, 480, src_w, src_h, src_px)
    for root, _, files in os.walk(RES_DIR):
        for fn in files:
            if fn == 'splash.png':
                write_rgba_png(os.path.join(root, fn), 480, 480, splash)
    print('Generated Android launcher icons + dark splash screens.')


if __name__ == '__main__':
    main()
