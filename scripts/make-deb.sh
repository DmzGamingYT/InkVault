#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# InkVault — fabrication d'un paquet .deb SANS fpm
# (le fpm embarqué d'électron-builder échoue sous macOS)
#
# Usage :
#   ./scripts/make-deb.sh                # x64  (dist/linux-unpacked)
#   ./scripts/make-deb.sh arm64          # arm64 (dist/linux-arm64-unpacked)
#
# Prérequis : avoir lancé au préalable
#   npx electron-builder --linux dir --x64   (ou --arm64)
# ══════════════════════════════════════════════════════════
set -euo pipefail

# Pas de fichiers AppleDouble (._*) dans les archives destinées à Linux
export COPYFILE_DISABLE=1

ARCH_ARG="${1:-x64}"
case "$ARCH_ARG" in
  arm64) UNPACKED="dist/linux-arm64-unpacked"; DEB_ARCH="arm64" ;;
  *)     UNPACKED="dist/linux-unpacked";        DEB_ARCH="amd64" ;;
esac

VERSION=$(node -p "require('./package.json').version")
OUT="dist/inkvault-${VERSION}-${DEB_ARCH}.deb"
ICONS="node_modules/app-builder-lib/templates/icons/electron-linux"

[ -d "$UNPACKED" ] || { echo "✖ $UNPACKED introuvable — lance electron-builder d'abord"; exit 1; }
[ -x "$UNPACKED/inkvault" ] || { echo "✖ exécutable introuvable dans $UNPACKED"; exit 1; }

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# ── Arborescence du paquet ──
mkdir -p "$STAGE/data/opt/InkVault" \
         "$STAGE/data/usr/share/applications" \
         "$STAGE/data/usr/share/doc/inkvault" \
         "$STAGE/control"

for s in 16 32 48 64 128 256; do
  mkdir -p "$STAGE/data/usr/share/icons/hicolor/${s}x${s}/apps"
  cp "$ICONS/${s}x${s}.png" "$STAGE/data/usr/share/icons/hicolor/${s}x${s}/apps/inkvault.png"
done

cp -R "$UNPACKED/." "$STAGE/data/opt/InkVault/"
cp README.md "$STAGE/data/usr/share/doc/inkvault/README.md"

cat > "$STAGE/data/usr/share/applications/inkvault.desktop" <<'EOF'
[Desktop Entry]
Name=InkVault
GenericName=Comics & Manga Library
Comment=Catalogue, statistiques et IA locale pour ta bibliothèque
Exec=/opt/InkVault/inkvault %U
Icon=inkvault
Terminal=false
Type=Application
Categories=Office;Literature;
StartupWMClass=inkvault
EOF

# ── Post-install (sandbox + cache bureau de desktop) ──
cat > "$STAGE/control/postinst" <<'EOF'
#!/bin/sh
set -e
if [ -f /opt/InkVault/chrome-sandbox ]; then
  chmod 4755 /opt/InkVault/chrome-sandbox
fi
command -v update-desktop-database >/dev/null 2>&1 \
  && update-desktop-database -q /usr/share/applications || true
exit 0
EOF
chmod 755 "$STAGE/control/postinst"

SIZE=$(du -sk "$STAGE/data" | cut -f1)
cat > "$STAGE/control/control" <<EOF
Package: inkvault
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${DEB_ARCH}
Installed-Size: ${SIZE}
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0
Maintainer: DmzGamingYT <DmzGamingYT@users.noreply.github.com>
Homepage: https://github.com/DmzGamingYT/InkVault
Description: InkVault - bibliotheque comics & mangas avec IA locale
 Catalogue, statistiques, ordres de lecture, recherche par ambiance,
 fiches d'auteurs et optimiseur de panier — tout hors-ligne.
EOF

# ── Archives (uid/gid 0 pour un install propre, sans AppleDouble) ──
# Portabilité macOS ↔ Linux : GNU tar refuse --disable-copyfile/--uid,
# bsdtar ne connaît pas --owner/--group de la même façon.
if tar --version 2>/dev/null | head -n1 | grep -qi 'gnu'; then
  TARFLAGS=(--owner=0 --group=0)                 # GNU tar (Linux, CI)
else
  TARFLAGS=(--disable-copyfile --uid 0 --gid 0)  # bsdtar (macOS)
fi
(cd "$STAGE/data"     && COPYFILE_DISABLE=1 tar "${TARFLAGS[@]}" -czf "$STAGE/data.tar.gz" .)
(cd "$STAGE/control"  && COPYFILE_DISABLE=1 tar "${TARFLAGS[@]}" -czf "$STAGE/control.tar.gz" .)
echo "2.0" > "$STAGE/debian-binary"

# ── Assemblage final (ar sans dépendance : ar système cassé sous macOS26) ──
python3 scripts/mk-ar.py "$STAGE/ink.deb" \
  "$STAGE/debian-binary" "$STAGE/control.tar.gz" "$STAGE/data.tar.gz"
mkdir -p dist
mv "$STAGE/ink.deb" "$OUT"

echo "✔ $OUT ($(du -h "$OUT" | cut -f1)) — contrôle :"
python3 - "$OUT" <<'PY'
import struct, sys
data = open(sys.argv[1], "rb").read()
assert data[:8] == b"!<arch>\n", "magie absente"
pos = 8
names = []
while pos + 60 <= len(data):
    h = data[pos:pos + 60]
    name = h[:16].decode().strip()
    size = int(h[48:58].decode().strip())
    names.append(f"{name} ({size} o)")
    pos += 60 + size + (size % 2)
print("   " + " → ".join(names))
PY
