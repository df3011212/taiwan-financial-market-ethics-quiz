"""Stamp the HTML and version manifest together before publishing a new release.

Only first-party CSS/JS/icon references in index.html are versioned. The launcher
and iPhone profile retain their stable URLs, so an installed icon needs no reinstall.
"""
import argparse
import datetime
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--version', required=True, help='Unique release ID, e.g. 20261030-home-1')
parser.add_argument('--label', required=True, help='Display version, e.g. 2026.10.30.3')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', args.version):
    parser.error('Version must contain 1-80 letters, digits, dots, underscores, or hyphens')
if not args.label.strip() or len(args.label) > 80:
    parser.error('Display label must contain 1-80 characters')
root = Path(__file__).resolve().parents[1]
path = root / 'index.html'
html = path.read_text(encoding='utf-8')
for name, value in [('app-version', args.version), ('app-version-label', args.label)]:
    # A label is text, not arbitrary HTML.
    import html as html_module
    tag = f'<meta name="{name}" content="{html_module.escape(value, quote=True)}">'
    pattern = rf'<meta name="{name}" content="[^"]*">'
    if not re.search(pattern, html):
        raise SystemExit(f'Missing {name} meta tag')
    html = re.sub(pattern, lambda _: tag, html)
html = re.sub(r'((?:src|href)="assets/[^"?]+\.(?:js|css|png))(?:\?[^"\s]*)?"', lambda m: m[1] + '?v=' + args.version + '"', html)
html = re.sub(r'(<span class="app-version" id="appVersion">).*?(</span>)', lambda m: m[1] + '版本 ' + html_module.escape(args.label) + m[2], html)
path.write_bytes(html.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8'))
manifest = {'version': args.version, 'label': args.label, 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
(root / 'version.json').write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print('Stamped index.html and version.json:', args.version)
