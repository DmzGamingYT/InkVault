"""Génère les icônes de l'app à partir de l'illustration source.

Usage : python3 scripts/make-icon.py <image-source> [cx cy taille]
  - build/icon.png   1024 px, utilisé par electron-builder (icns / ico / Linux)
  - build/icons/NxN.png tailles hicolor du paquet .deb
  - electron/icon.png 512 px, icône de fenêtre (Linux) et du Dock en dev
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(sys.argv[1]).convert("RGB")

# Carré centré sur l'emblème (le titre sous l'emblème est exclu)
cx, cy, size = (int(v) for v in sys.argv[2:5]) if len(sys.argv) >= 5 else (440, 519, 840)
art = src.crop((cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2))

# Grille macOS : pastille de 824 px dans un canevas de 1024, coins arrondis
CANVAS, BODY, RADIUS = 1024, 824, 186
art = art.resize((BODY, BODY), Image.LANCZOS)
mask = Image.new("L", (BODY * 4, BODY * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, BODY * 4 - 1, BODY * 4 - 1), RADIUS * 4, fill=255)
mask = mask.resize((BODY, BODY), Image.LANCZOS)   # anticrénelage

icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
off = (CANVAS - BODY) // 2
icon.paste(art, (off, off), mask)

(ROOT / "build").mkdir(exist_ok=True)
icon.save(ROOT / "build" / "icon.png")
icon.resize((512, 512), Image.LANCZOS).save(ROOT / "electron" / "icon.png")

# Tailles hicolor pour le .deb (scripts/make-deb.sh)
(ROOT / "build" / "icons").mkdir(exist_ok=True)
for s in (16, 32, 48, 64, 128, 256, 512):
    icon.resize((s, s), Image.LANCZOS).save(ROOT / "build" / "icons" / f"{s}x{s}.png")
print("build/icon.png, build/icons/*, electron/icon.png générés")
