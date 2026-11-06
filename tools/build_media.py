"""Build trivia/media from Dad70 sources.

python -I tools/build_media.py [q02 q05 ...]   (default: everything)

Each question gets media/qNN.mp4 (1280x720, ~5 s, silent) and media/qNN_bg.jpg
(heavily blurred, used behind the question so it can't give the answer away).
A source is either a video clip, or a photo list that gets a slow Ken Burns move.
Generated AI clips go in src_media/ and take priority over the placeholders.
"""
import os, sys, subprocess, glob
from PIL import Image, ImageOps, ImageFilter, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D70 = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, 'media')
FF = glob.glob(os.path.expanduser(r'~\AppData\Local\Programs\Python\Python312\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg*.exe'))[0]
W, H, FPS = 1280, 720, 25

clip = lambda n: os.path.join(D70, 'video', 'clips', n + '.mp4')
new = lambda n: os.path.join(D70, 'video', 'src_new', n)
ref = lambda n: os.path.join(D70, 'reference', 'from_60th_video', n)
ai = lambda n: os.path.join(ROOT, 'src_media', n)

# question -> source (first existing wins)
SOURCES = {
    'q01': [clip('a1_baby')],
    'q02': [ai('q02.mp4'), [ai('q02_ship.png')]],
    'q03': [clip('b1_piano')],
    'q04': [ai('q04.mp4'), clip('b2_kotel')],
    'q05': [ai('q05.mp4'), [ref('teen_portrait_0221.jpg'), ref('officer_cert_0256.jpg')]],
    'q06': [clip('b3_aline')],
    'q07': [ai('q07.mp4'), [ref('md_diploma_0316.jpg')]],
    'q08': [ai('q08.mp4'), [new('c1_53.jpg')]],
    'q09': [ai('q09.mp4'), [new('c1_82.jpg')]],
    'q10': [clip('a4_reading')],
    'q11': [clip('a3_pool')],
    'q12': [ai('q12.mp4'), [new('c2_413.jpeg')]],
    'q13': [ai('q13.mp4'), [new('c1_23.jpg')]],
    'q14': [[new('c1_23.jpg'), new('c2_488.jpg')]],
    'q15': [ai('q15.mp4'), [new('c2_573.jpg')]],
}
# what blurs behind the question (a neutral frame of the era)
BG = {'q02': 'q01', 'q03': 'q04'}

LOBBY = [clip('a1_baby'), clip('b1_piano'), clip('b3_aline'), clip('a2_wedding'), clip('b4_kids'),
         clip('a3_pool'), clip('b5_wedding'), clip('b6_grandbaby'), new('c2_488.jpg'), new('c2_573.jpg')]


def load(path):
    if path.endswith('.mp4'):
        tmp = os.path.join(OUT, '_frame.png')
        subprocess.run([FF, '-y', '-loglevel', 'error', '-ss', '1', '-i', path, '-frames:v', '1', tmp], check=True)
        im = Image.open(tmp).convert('RGB'); im.load(); os.remove(tmp); return im
    return ImageOps.exif_transpose(Image.open(path)).convert('RGB')


def fit16x9(im, w=W * 2, h=H * 2):
    """Photo onto a 16:9 canvas: cover-crop if landscape, else blurred fill + centred photo."""
    r = im.width / im.height
    if r > 1.3:
        return ImageOps.fit(im, (w, h), Image.LANCZOS, centering=(0.5, 0.4))
    bg = ImageOps.fit(im, (w, h)).filter(ImageFilter.GaussianBlur(40))
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    fg = im.copy(); fg.thumbnail((w, int(h * 0.94)), Image.LANCZOS)
    bg.paste(fg, ((w - fg.width) // 2, (h - fg.height) // 2))
    return bg


def encode(frames_fn, n, out):
    p = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                          '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '23', '-preset', 'slow',
                          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frames_fn(i).tobytes())
    p.stdin.close(); p.wait()


def kenburns(photos, out, secs_each=5.0, fade=1.0):
    big = [fit16x9(load(f)) for f in photos]
    per = int(secs_each * FPS); fd = int(fade * FPS)
    total = per * len(big) - fd * (len(big) - 1)

    def frame_of(k, i):
        t = i / per; s = 1.0 + 0.10 * t  # slow 10% push-in
        bw, bh = big[k].size; cw, ch = bw / s, bh / s
        x0 = (bw - cw) / 2; y0 = (bh - ch) * 0.45
        return big[k].resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))

    def frame(i):
        k = 0; start = 0
        while k + 1 < len(big) and i >= start + per - fd:
            k += 1; start += per - fd
        f = frame_of(k, i - start)
        if k > 0 and i - start < fd:  # crossfade from previous photo
            f = Image.blend(frame_of(k - 1, i - start + per - fd), f, (i - start) / fd)
        return f
    encode(frame, total, out)


def reencode(src, out):
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', src, '-an', '-vf',
                    f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}',
                    '-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart', out], check=True)


def blurred(src, out):
    im = fit16x9(load(src[0] if isinstance(src, list) else src), 640, 360)
    im = im.filter(ImageFilter.GaussianBlur(26))
    ImageEnhance.Brightness(im).enhance(0.6).save(out, quality=80)


def pick(q):
    for s in SOURCES[q]:
        if isinstance(s, list) and all(os.path.exists(f) for f in s): return s
        if isinstance(s, str) and os.path.exists(s): return s
    raise SystemExit(f'{q}: no source found')


def main(only):
    os.makedirs(OUT, exist_ok=True)
    for q in SOURCES:
        if only and q not in only: continue
        src = pick(q); out = os.path.join(OUT, q + '.mp4')
        print(q, '<-', src if isinstance(src, str) else [os.path.basename(f) for f in src])
        if isinstance(src, list): kenburns(src, out)
        else: reencode(src, out)
    for q in SOURCES:
        if only and q not in only and BG.get(q) not in only: continue
        blurred(pick(BG.get(q, q)), os.path.join(OUT, q + '_bg.jpg'))
    if not only:
        for i, f in enumerate(LOBBY):
            im = fit16x9(load(f), 960, 540) if f.endswith('.mp4') else ImageOps.exif_transpose(Image.open(f)).convert('RGB')
            im.thumbnail((960, 960)); im.save(os.path.join(OUT, f'lobby{i:02d}.jpg'), quality=82)


if __name__ == '__main__':
    main(sys.argv[1:])
