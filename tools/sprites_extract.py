"""Turn the CraftPix packs into one small sprite sheet per character.

Usage: python sprites_extract.py <repo folder> <output folder>

Writes <output>/chars/<id>.webp (frames side by side) and <output>/chars.json.
Each sheet is trimmed to the character and scaled so frames are at most 128 px tall.
"""
import sys, os, glob, json, re
from PIL import Image

repo, out = sys.argv[1], sys.argv[2]
SP = os.path.join(repo, 'sprites')
os.makedirs(os.path.join(out, 'chars'), exist_ok=True)
MAX_H = 128
MAX_FRAMES = 12
chars = []


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def strip_frames(path, fw=None, fh=None, row=0):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    fh = fh or h
    fw = fw or fh
    return [im.crop((x, row * fh, x + fw, row * fh + fh)) for x in range(0, w - fw + 1, fw)]


def grid_frames(path, fw, fh):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    return [im.crop((x, y, x + fw, y + fh)) for y in range(0, h - fh + 1, fh) for x in range(0, w - fw + 1, fw)]


def seq_frames(folder):
    return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(os.path.join(folder, '*.png')))]


def save(cid, frames, fps=8):
    frames = [f for f in frames if f.getbbox()]
    if len(frames) > MAX_FRAMES:
        step = len(frames) / MAX_FRAMES
        frames = [frames[int(i * step)] for i in range(MAX_FRAMES)]
    if not frames:
        return
    box = frames[0].getbbox()
    for f in frames[1:]:
        b = f.getbbox()
        box = (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    frames = [f.crop(box) for f in frames]
    w, h = frames[0].size
    if h > MAX_H:
        s = MAX_H / h
        w, h = max(1, round(w * s)), MAX_H
        frames = [f.resize((w, h), Image.LANCZOS) for f in frames]
    sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * w, 0))
    name = slug(cid)
    sheet.save(os.path.join(out, 'chars', name + '.webp'), lossless=True, method=6)
    chars.append({'id': name, 'file': 'chars/' + name + '.webp', 'frames': len(frames), 'w': w, 'h': h, 'fps': fps})


def first(folder, patterns):
    for p in patterns:
        hits = sorted(glob.glob(os.path.join(folder, p)))
        if hits:
            return hits[0]
    return None


# 1. Side-view strips: one character per folder holding Attack sheets.
STRIP_PREFS = ['Attack_1.png', 'Attack 1.png', 'Attack.png', 'Special_Attack_1.png', 'Special_attack_1.png',
               'Power_Attack_1.png', 'Attack_2.png', '*Attack*.png']
SKIP = ('archer', '998100', '197730', '995317', '419402', '543463', '788364', '894297', 'pixel-art-pack 1',
        'knight-character-sprites-pixel-art 2')
for folder in sorted({os.path.dirname(f) for f in glob.glob(os.path.join(SP, '**', '*.png'), recursive=True)}):
    rel = os.path.relpath(folder, SP)
    if any(s in rel for s in SKIP) or 'Spritesheet 128' in rel:
        continue
    f = first(folder, STRIP_PREFS)
    if not f:
        continue
    w, h = Image.open(f).size
    if w % h:
        continue
    pack = rel.split(os.sep)[0]
    who = rel.split(os.sep)[-1] if os.sep in rel else rel
    save(re.sub(r'^craftpix-(net-)?\d+-', '', pack)[:20] + '-' + who, strip_frames(f))

# 2. Front-facing sequences: archer (3 outfits), tiny vampires (3), monsters (10).
for d in sorted(glob.glob(os.path.join(SP, 'craftpix-627811*', 'Archer_animations', 'Front', 'PNG Sequences', '*', 'Attack_1'))):
    save('archer-' + d.split(os.sep)[-2], seq_frames(d), fps=12)
for d in sorted(glob.glob(os.path.join(SP, 'craftpix-net-995317*', 'PNG', '*', 'PNG Sequences', 'Attacking'))):
    save('tiny-' + d.split(os.sep)[-3], seq_frames(d), fps=12)
for d in sorted(glob.glob(os.path.join(SP, 'craftpix-998100*', 'PNG', '*')), key=lambda p: int(re.sub(r'\D', '', os.path.basename(p)) or 0)):
    save('monster-' + os.path.basename(d), seq_frames(d), fps=10)

# 3. Front-facing grids: tribal warriors, top-down vampires and slimes (front row only).
for f in sorted(glob.glob(os.path.join(SP, 'craftpix-net-197730*', '*', 'PNG', 'Spritesheets', 'Front - Attacking.png'))):
    save('tribal-' + f.split(os.sep)[-4], grid_frames(f, 480, 480), fps=12)
for f in sorted(glob.glob(os.path.join(repo, '3d characters', 'free-vampire-4-direction-pixel-character-sprite-pack', 'PNG', '*', 'Attack', '*_full.png'))):
    save('topdown-' + f.split(os.sep)[-3], strip_frames(f, 64, 64, row=0))
for f in sorted(glob.glob(os.path.join(SP, 'craftpix-net-788364*', 'PNG', '*', 'Without_shadow', '*_Attack_without_shadow.png'))):
    save('slime-' + f.split(os.sep)[-3], strip_frames(f, 64, 64, row=0))

json.dump(chars, open(os.path.join(out, 'chars.json'), 'w'), indent=0)
total = sum(os.path.getsize(os.path.join(out, c['file'])) for c in chars)
print(len(chars), 'characters,', total // 1024, 'KB')
