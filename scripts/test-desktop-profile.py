"""Validate the installed shortcut's scope and the release's versioned references."""
import json
from pathlib import Path
import plistlib
import re
import struct
from urllib.parse import urlparse, parse_qs
import uuid

root = Path(__file__).resolve().parents[1]
profile = plistlib.loads((root / 'financial-quiz.mobileconfig').read_bytes())
assert profile['PayloadType'] == 'Configuration'
assert profile['PayloadRemovalDisallowed'] is False
assert len(profile['PayloadContent']) == 1, 'Profile must contain only one website shortcut'
clip = profile['PayloadContent'][0]
assert clip['PayloadType'] == 'com.apple.webClip.managed'
assert clip['IsRemovable'] is True and clip['FullScreen'] is True
assert 'TargetApplicationBundleIdentifier' not in clip, 'MDM-only field is not valid for this manual profile'
assert clip['URL'] == 'https://df3011212.github.io/taiwan-financial-market-ethics-quiz/launch.html'
assert clip['Label'] == '金融題庫'
for payload in [profile, clip]:
    uuid.UUID(payload['PayloadUUID'])
    assert payload['PayloadVersion'] == 1
icon = (root / 'assets' / 'quiz-icon.png').read_bytes()
assert icon == clip['Icon'] and icon[:8] == b'\x89PNG\r\n\x1a\n'
assert struct.unpack('>II', icon[16:24]) == (180, 180)
assert len(icon) < 1000000
print('PASS: removable, unsigned Web Clip profile contains only the intended HTTPS website and PNG icon')

html = (root / 'index.html').read_text(encoding='utf-8')
manifest = json.loads((root / 'version.json').read_text(encoding='utf-8'))
assert re.search(r'<meta name="app-version" content="([^"]+)">', html)[1] == manifest['version']
assert re.search(r'<meta name="app-version-label" content="([^"]+)">', html)[1] == manifest['label']
refs = re.findall(r'(?:src|href)="(assets/[^\"]+\.(?:js|css|png)(?:\?[^\"]*)?)"', html)
assert len(refs) >= 8
for ref in refs:
    parsed = urlparse(ref)
    assert (root / parsed.path).is_file(), ref
    assert parse_qs(parsed.query).get('v') == [manifest['version']], ref
assert 'financial-quiz.mobileconfig' in html and 'id="checkAppUpdate"' in html
assert (root / 'launch.html').is_file()
print('PASS: release manifest, visible version, and all CSS/JS/icon cache keys agree')
