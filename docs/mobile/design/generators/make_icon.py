"""Draw the MGP mark (Space Grotesk Bold, #5CC078 with a soft glow, on #121317) as app assets (D-091).

Usage: python3 make_icon.py SpaceGrotesk-Bold.ttf mobile/assets/images
(The font is Space Grotesk 700 from Google Fonts, the website's typeface.)"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT, OUT = sys.argv[1], sys.argv[2]
GREEN, BG = (92, 192, 120), (18, 19, 23)

def mark(width_px, glow=True, color=GREEN, tracking=0.05):
    """The wordmark on a transparent canvas, text about width_px wide, with room for the glow."""
    size = 400
    font = ImageFont.truetype(FONT, size)
    letters = "MGP"
    adv = [font.getlength(ch) for ch in letters]
    total = sum(adv) + tracking * size * (len(letters) - 1)
    scale = width_px / total
    font = ImageFont.truetype(FONT, int(size * scale))
    size = int(size * scale)
    adv = [font.getlength(ch) for ch in letters]
    total = sum(adv) + tracking * size * (len(letters) - 1)
    asc, desc = font.getmetrics()
    pad = int(size * 0.45)
    W, H = int(total + 2 * pad), int(asc + desc + 2 * pad)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = pad
    for ch, a in zip(letters, adv):
        d.text((x, pad), ch, font=font, fill=color + (255,))
        x += a + tracking * size
    bbox = layer.getbbox()
    if not glow:
        return layer, bbox
    alpha = layer.split()[3]
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for radius, strength in ((size * 0.085, 0.62), (size * 0.17, 0.38)):  # the website's 10px / 20px glow, scaled
        g = alpha.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: int(v * strength))
        out.alpha_composite(Image.merge("RGBA", [Image.new("L", (W, H), c) for c in color] + [g]))
    out.alpha_composite(layer)
    return out, bbox

def centered(canvas, layer, bbox):
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    canvas.alpha_composite(layer, (int(canvas.width / 2 - cx), int(canvas.height / 2 - cy)))
    return canvas

# iOS / store icon: opaque, 1024
icon = Image.new("RGBA", (1024, 1024), BG + (255,))
m, bb = mark(700)
centered(icon, m, bb).convert("RGB").save(f"{OUT}/icon.png")
# Android adaptive: transparent foreground inside the safe zone, solid background, monochrome
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
m, bb = mark(520)
centered(fg, m, bb).save(f"{OUT}/android-icon-foreground.png")
Image.new("RGBA", (1024, 1024), BG + (255,)).save(f"{OUT}/android-icon-background.png")
mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
m, bb = mark(520, glow=False, color=(255, 255, 255))
centered(mono, m, bb).save(f"{OUT}/android-icon-monochrome.png")
# Splash: the wordmark with its glow on transparent, trimmed with a little room
m, bb = mark(600)
pad = 90
splash = m.crop((bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad))
splash.save(f"{OUT}/splash-icon.png")
# Web favicon
fav = Image.new("RGBA", (192, 192), BG + (255,))
m, bb = mark(150, glow=False)
centered(fav, m, bb).resize((48, 48), Image.LANCZOS).save(f"{OUT}/favicon.png")
print("splash size", splash.size)
