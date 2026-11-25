#!/usr/bin/env python3
"""Generate small, original monogram icons. Does not use provider trademarks."""
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
SERVICES = {
    'chatgpt': ('C', '#59c6a1'),
    'claude': ('A', '#dcaa8d'),
    'gemini': ('G', '#a8b2ff'),
    'perplexity': ('P', '#8acbd0'),
    'copilot': ('M', '#e3a3d4'),
    'arena': ('A', '#70b9f2'),
}
GLYPHS = {
    'C': ['01111','11000','10000','10000','10000','11000','01111'],
    'A': ['01110','11011','10001','11111','10001','10001','10001'],
    'G': ['01110','11001','10000','10111','10001','11001','01110'],
    'P': ['11110','10001','10001','11110','10000','10000','10000'],
    'M': ['10001','11011','10101','10101','10001','10001','10001'],
}

for name, (letter, color) in SERVICES.items():
    rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    pixels = bytearray()
    for y in range(48):
        for x in range(48):
            # Bottom-up ICO bitmap; a round dark tile with a service-coloured monogram.
            xx, yy = x - 23.5, (47 - y) - 23.5
            visible = xx * xx + yy * yy <= 23 * 23
            row, col = (47 - y - 10) // 4, (x - 14) // 4
            ink = 0 <= row < 7 and 0 <= col < 5 and GLYPHS[letter][row][col] == '1'
            r, g, b = rgb if ink else (27, 28, 39)
            pixels.extend((b, g, r, 255 if visible else 0))
    header = struct.pack('<IIIHHIIIIII', 40, 48, 96, 1, 32, 0, len(pixels), 0, 0, 0, 0)
    mask = bytes(8 * 48)
    bitmap = header + pixels + mask
    ico = struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 48, 48, 0, 0, 1, 32, len(bitmap), 22) + bitmap
    out = ROOT / 'subscription-apps' / 'icons' / f'{name}.ico'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(ico)
    path = []
    for row, line in enumerate(GLYPHS[letter]):
        for col, cell in enumerate(line):
            if cell == '1':
                x, y = 29 + col * 10, 19 + row * 10
                path.append(f'M{x},{y}h8v8h-8z')
    xml = f'''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#1b1c27" android:pathData="M54,5a49,49 0,1 0,0.01 0z" />
    <path android:fillColor="{color}" android:pathData="{' '.join(path)}" />
</vector>\n'''
    target = ROOT / 'android' / 'service-launcher' / 'src' / name / 'res' / 'drawable' / 'ic_launcher.xml'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(xml, encoding='utf-8')
