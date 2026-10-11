"""燼符行 美術處理：把 art/inbox 裡依編號命名的圖（001.png、045.png…）轉成遊戲用的 WebP，並產生 js/art_manifest.js。

用法（在專案資料夾執行）：
    python art/tools/build_art.py

- 只處理「三位數字.png/.jpg/.webp」的檔名，例如 045.png；045-old.png 這類備份會被略過。
- 四格圖（護符、消耗品、晉升徽記）自動依左上、右上、左下、右下切開。
- 可以重複執行：每次都會重新處理全部 inbox 的圖，覆蓋舊的輸出。
需要 Pillow：python -m pip install pillow
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
INBOX = os.path.join(ROOT, 'art', 'inbox')
NAME_RE = re.compile(r'^(\d{3})\.(png|jpg|jpeg|webp)$', re.I)

# 各資料夾的輸出寬度（高度依比例）
WIDTH = {
    'keyart': 1600, 'bg': 1600, 'map': 720, 'scenes': 1280,
    'heroes': 512, 'ancients': 1024, 'enemies': 512, 'allies': 384,
    'cards': 768, 'charms': 256, 'consumables': 256, 'perks': 384, 'ui': 512,
    # 九宮符（201 起）
    'board': 1200, 'frames': 400, 'cardart': 512, 'foes': 560, 'heroes_back': 520,
    'seals': 192, 'marks': 256, 'ink': 256, 'fx': 960, 'icons': 160, 'table': 1920, 'props': 384, 'hands': 1100, 'npc': 640,
}
QUALITY = 84


def key_magenta(img):
    """去背：沒有透明通道、四角是洋紅色時，把接近 #FF00FF 的像素變透明（邊緣做柔和過渡）。"""
    rgb = img.convert('RGB')
    w, h = rgb.size
    corners = [rgb.getpixel(p) for p in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))]
    if not all(r > 200 and b > 200 and g < 90 for r, g, b in corners):
        return img
    px = rgb.load()
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # 與洋紅的距離：洋紅＝紅藍高、綠低
            mag = min(r, b) - g
            if mag > 150:
                a = 0
            elif mag > 60:
                a = int(255 * (150 - mag) / 90)
                # 去掉邊緣殘留的洋紅色偏
                r, b = min(r, g + (255 - mag)), min(b, g + (255 - mag))
            else:
                a = 255
            op[x, y] = (r, g, b, a)
    return out


def trim(img, pad=8):
    """去背後把四周透明的空白裁掉，留一點邊。"""
    if img.mode != 'RGBA':
        return img
    box = img.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def load_json(name):
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return json.load(f)


def save(img, rel):
    folder = rel.split('/')[1]
    w = WIDTH.get(folder, 512)
    if img.width > w:
        img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    out = os.path.join(ROOT, *rel.split('/'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, 'WEBP', quality=QUALITY, method=6)
    return out


def quarters(img):
    w, h = img.size
    hw, hh = w // 2, h // 2
    return [img.crop(b) for b in ((0, 0, hw, hh), (hw, 0, w, hh), (0, hh, hw, h), (hw, hh, w, h))]


def main():
    try:
        sys.stdout.reconfigure(errors='replace')   # 舊式主控台無法顯示的字元以 ? 代替
    except AttributeError:
        pass
    numbers = {e['n']: e for e in load_json('numbers.json')}
    focus = {k: v for k, v in load_json('focus.json').items() if not k.startswith('_')}
    if not os.path.isdir(INBOX):
        sys.exit(f'找不到 {INBOX}')

    done, skipped = [], []
    for name in sorted(os.listdir(INBOX)):
        m = NAME_RE.match(name)
        if not m:
            skipped.append(name)
            continue
        n = int(m.group(1))
        entry = numbers.get(n)
        if not entry:
            skipped.append(f'{name}（沒有這個編號）')
            continue
        img = Image.open(os.path.join(INBOX, name))
        cutout = entry.get('cutout', False)
        img = img.convert('RGBA') if cutout or 'A' in img.getbands() else img.convert('RGB')
        parts = quarters(img) if entry['grid'] else [img]
        for part, rel in zip(parts, entry['files']):
            if cutout:
                part = trim(key_magenta(part))
            save(part, rel)
            done.append(rel)
        print(f"#{n:03d} {entry['title']} → {', '.join(entry['files'])}")

    # 產生清單：依實際存在的檔案，附上修改時間避免瀏覽器快取舊圖
    manifest = {}
    for e in numbers.values():
        for rel in e['files']:
            path = os.path.join(ROOT, *rel.split('/'))
            if not os.path.exists(path):
                continue
            key = rel[len('art/'):-len('.webp')]
            item = {'src': f"{rel}?v={int(os.path.getmtime(path))}"}
            if key in focus:
                item['fx'], item['fy'], item['z'] = focus[key]
            manifest[key] = item
    js = ('/* 由 art/tools/build_art.py 自動產生，請勿手動修改。列出目前已有的美術圖。 */\n'
          'window.ART = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')
    with open(os.path.join(ROOT, 'js', 'art_manifest.js'), 'w', encoding='utf-8') as f:
        f.write(js)

    total = sum(len(e['files']) for e in numbers.values())
    print(f'\n已處理 {len(done)} 張，遊戲目前有 {len(manifest)}／{total} 張美術。')
    if skipped:
        print('略過：' + '、'.join(skipped))


if __name__ == '__main__':
    main()
