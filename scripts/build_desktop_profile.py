"""Create a removable, unsigned Web Clip profile and its local app icon.

The profile adds one website shortcut only. It does not enroll a device in MDM.
Uses only the Python standard library; no signing credentials or remote services.
"""
import plistlib
from pathlib import Path
import struct
import uuid
import zlib

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://df3011212.github.io/taiwan-financial-market-ethics-quiz/'
SIZE = 180
BACKGROUND = (23, 107, 88)
INK = (255, 255, 255)
MINT = (173, 238, 208)
pixels = [[BACKGROUND for _ in range(SIZE)] for _ in range(SIZE)]

def polygon(points, color):
    for y in range(SIZE):
        intersections = []
        for a, b in zip(points, points[1:] + points[:1]):
            if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                intersections.append(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
        intersections.sort()
        for left, right in zip(intersections[::2], intersections[1::2]):
            for x in range(max(0, round(left)), min(SIZE, round(right))):
                pixels[y][x] = color

# Open book, with a check mark. iOS applies its own Home Screen icon mask.
polygon([(32, 42), (77, 47), (89, 55), (89, 137), (77, 129), (32, 124)], INK)
polygon([(93, 55), (105, 47), (150, 42), (150, 124), (105, 129), (93, 137)], INK)
polygon([(45, 66), (76, 70), (76, 76), (45, 72)], BACKGROUND)
polygon([(45, 83), (76, 87), (76, 93), (45, 89)], BACKGROUND)
polygon([(45, 100), (70, 104), (70, 110), (45, 106)], BACKGROUND)
polygon([(103, 91), (111, 84), (119, 94), (139, 68), (146, 75), (119, 110)], BACKGROUND)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

raw = b''.join(b'\0' + bytes(channel for pixel in row for channel in pixel) for row in pixels)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
(ROOT / 'assets' / 'quiz-icon.png').write_bytes(png)
identifier = 'io.github.df3011212.financial-quiz'
payload = {
    'PayloadType': 'com.apple.webClip.managed', 'PayloadVersion': 1,
    'PayloadIdentifier': identifier + '.webclip', 'PayloadUUID': str(uuid.uuid5(uuid.NAMESPACE_URL, identifier + '.webclip')).upper(),
    'PayloadDisplayName': '金融題庫桌面書籤', 'Label': '金融題庫',
    'URL': BASE + 'launch.html', 'FullScreen': True, 'IsRemovable': True,
    'Precomposed': True, 'IgnoreManifestScope': False, 'Icon': png,
}
profile = {
    'PayloadType': 'Configuration', 'PayloadVersion': 1,
    'PayloadIdentifier': identifier + '.profile', 'PayloadUUID': str(uuid.uuid5(uuid.NAMESPACE_URL, identifier + '.profile')).upper(),
    'PayloadDisplayName': '金融題庫桌面書籤',
    'PayloadDescription': '在 iPhone 或 iPad 主畫面新增金融題庫網站捷徑。開啟後會連線檢查網站版本。',
    'PayloadOrganization': '金融市場常識與職業道德練習工具',
    'PayloadRemovalDisallowed': False,
    'ConsentText': {'default': '此描述檔只新增金融題庫網站捷徑，可在設定中移除。更換桌面入口前，請先匯出原入口的追蹤備份。'},
    'PayloadContent': [payload],
}
(ROOT / 'financial-quiz.mobileconfig').write_bytes(plistlib.dumps(profile, fmt=plistlib.FMT_XML, sort_keys=False))
print('Created financial-quiz.mobileconfig and assets/quiz-icon.png')
