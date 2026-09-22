#!/usr/bin/env python3
"""Assemble une archive `ar` (format .deb) à partir de fichiers, sans ar système.

Usage : mk-ar.py <sortie> <membre1> <membre2> ...

Le format ar : magie «!<arch>», puis par membre un en-tête de60 octets
au format POSIX/SysV (nom suivi de «/», champs remplis d'espaces),
données alignées sur un nombre pair d'octets. dpkg et libarchive
lisent ce format (les symboles SYMDEF sont facultatifs).
"""
import sys
import time


def ar_header(name, size, mtime):
    # nom SysV : nom + "/" calé sur16 octets (15 caractères max)
    n = (name + "/").ljust(16)
    h = (
        n                          #16 : nom
        + str(int(mtime)).ljust(12) #12 : date de modif
        + "0".ljust(6)             # 6 : uid
        + "0".ljust(6)             # 6 : gid
        + "100644".ljust(8)        # 8 : mode
        + str(size).ljust(10)      #10 : taille
        + "`\n"                    # 2 : magie de fin
    )
    assert len(h) == 60, len(h)
    return h.encode()


def main():
    if len(sys.argv) < 3:
        print("usage: mk-ar.py <sortie> <membre...>", file=sys.stderr)
        return 2
    out, members = sys.argv[1], sys.argv[2:]
    mtime = int(time.time())
    buf = bytearray(b"!<arch>\n")
    for path in members:
        # nom interne : nom de base du fichier
        name = path.rstrip("/").split("/")[-1]
        with open(path, "rb") as f:
            data = f.read()
        buf += ar_header(name, len(data), mtime)
        buf += data
        if len(data) % 2:          # alignement pair obligatoire
            buf += b"\n"
    with open(out, "wb") as f:
        f.write(buf)
    print(f"  ar: {out} ({len(buf)} octets, {len(members)} membres)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
