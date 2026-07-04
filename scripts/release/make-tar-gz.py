#!/usr/bin/env python3
"""Create a gzip-compressed tar archive with normalized metadata."""

from __future__ import annotations

import gzip
import stat
import sys
import tarfile
from pathlib import Path


def usage() -> None:
    print("Usage: make-tar-gz.py <archive.tar.gz> <source-dir>", file=sys.stderr)


def normalized_info(tar: tarfile.TarFile, source: Path, arcname: str) -> tarfile.TarInfo:
    info = tar.gettarinfo(str(source), arcname)
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = 0
    if info.isdir():
        info.mode = 0o755
    elif info.isfile():
        info.mode = 0o755 if source.stat().st_mode & stat.S_IXUSR else 0o644
    return info


def add_path(tar: tarfile.TarFile, source: Path, arcname: str) -> None:
    info = normalized_info(tar, source, arcname)
    if source.is_file():
        with source.open("rb") as handle:
            tar.addfile(info, handle)
        return
    tar.addfile(info)


def create_archive(archive_path: Path, source_dir: Path) -> None:
    with archive_path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gzipped:
            with tarfile.open(
                fileobj=gzipped, mode="w", format=tarfile.USTAR_FORMAT
            ) as archive:
                add_path(archive, source_dir, source_dir.name)
                for path in sorted(source_dir.rglob("*")):
                    relative = path.relative_to(source_dir)
                    add_path(archive, path, str(Path(source_dir.name) / relative))


def main() -> int:
    if len(sys.argv) != 3:
        usage()
        return 2
    archive_path = Path(sys.argv[1])
    source_dir = Path(sys.argv[2])
    if not source_dir.is_dir():
        print(f"source dir is not a directory: {source_dir}", file=sys.stderr)
        return 1
    create_archive(archive_path, source_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
