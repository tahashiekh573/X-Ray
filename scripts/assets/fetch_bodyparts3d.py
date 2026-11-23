"""Fetch the BodyParts3D source data needed by the asset pipeline.

BodyParts3D (c) The Database Center for Life Science, licensed under CC BY 4.0.
Source page (verified): https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
License page (verified): https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

Instead of downloading the complete 136 MB IS-A archive, this script reads the remote ZIP's
central directory with HTTP range requests and extracts only the OBJ members (FJ*.obj) that the
anatomy build needs. The server advertises ``Accept-Ranges: bytes``.

Usage:
    python -I scripts/assets/fetch_bodyparts3d.py --raw-dir data/raw/bodyparts3d
"""

from __future__ import annotations

import argparse
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST"
TABLES = (
    "isa_parts_list_e.txt",
    "isa_element_parts.txt",
    "partof_parts_list_e.txt",
    "partof_element_parts.txt",
    "partof_inclusion_relation_list.txt",
    "README_e.html",
)
ARCHIVES = ("partof_BP3D_4.0_obj_99.zip", "isa_BP3D_4.0_obj_99.zip")
USER_AGENT = "xray-mirror-pro-asset-pipeline/0.1"


class HttpRangeFile(io.RawIOBase):
    """Minimal seekable, read-only file object backed by HTTP range requests."""

    def __init__(self, url: str) -> None:
        super().__init__()
        self.url = url
        self.pos = 0
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.headers.get("Accept-Ranges", "").lower() != "bytes":
                raise RuntimeError(f"Server does not support range requests for {url}")
            self.size = int(resp.headers["Content-Length"])

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def read(self, size: int = -1) -> bytes:
        if self.pos >= self.size:
            return b""
        end = self.size - 1 if size < 0 else min(self.size - 1, self.pos + size - 1)
        headers = {"Range": f"bytes={self.pos}-{end}", "User-Agent": USER_AGENT}
        req = urllib.request.Request(self.url, headers=headers)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data: bytes = resp.read()
                break
            except OSError:
                if attempt == 3:
                    raise
        self.pos += len(data)
        return data

    def readinto(self, b: bytearray) -> int:  # type: ignore[override]
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        print(f"  present  {target.name}")
        return
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=300) as resp:
        target.write_bytes(resp.read())
    print(f"  fetched  {target.name} ({target.stat().st_size} bytes)")


def extract_members(archive: zipfile.ZipFile, wanted: set[str], out_dir: Path) -> set[str]:
    """Extract FJ*.obj members whose stem is in ``wanted``; return the stems extracted."""
    found: set[str] = set()
    for info in archive.infolist():
        stem = Path(info.filename).stem
        if stem in wanted and info.filename.lower().endswith(".obj"):
            target = out_dir / f"{stem}.obj"
            if not target.exists():
                target.write_bytes(archive.read(info))
            found.add(stem)
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw/bodyparts3d"))
    parser.add_argument(
        "--elements",
        type=Path,
        help="Text file with one FJ element id per line (written by build_anatomy_assets.py "
        "--list-elements). Defaults to every element the build spec needs.",
    )
    args = parser.parse_args(argv)
    raw: Path = args.raw_dir
    raw.mkdir(parents=True, exist_ok=True)
    obj_dir = raw / "obj"
    obj_dir.mkdir(exist_ok=True)

    print("Tables:")
    for name in TABLES:
        download(f"{BASE_URL}/{name}", raw / name)

    if args.elements:
        wanted = {ln.strip() for ln in args.elements.read_text().splitlines() if ln.strip()}
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from parts_spec import required_elements  # noqa: PLC0415

        wanted = required_elements(raw)
    missing = {fj for fj in wanted if not (obj_dir / f"{fj}.obj").exists()}
    print(f"Elements: {len(wanted)} required, {len(missing)} not yet extracted")

    for archive_name in ARCHIVES:
        if not missing:
            break
        local = raw / archive_name
        if local.exists():
            print(f"  reading local {archive_name}")
            try:
                with zipfile.ZipFile(local) as zf:
                    missing -= extract_members(zf, missing, obj_dir)
                continue
            except zipfile.BadZipFile:
                print(f"  {archive_name} is incomplete; falling back to range requests")
        print(f"  range-reading remote {archive_name}")
        with zipfile.ZipFile(io.BufferedReader(HttpRangeFile(f"{BASE_URL}/{archive_name}"),
                                               buffer_size=1 << 20)) as zf:
            missing -= extract_members(zf, missing, obj_dir)

    if missing:
        print(f"ERROR: {len(missing)} elements could not be found: {sorted(missing)[:20]}")
        return 1
    print("All required OBJ elements are available in", obj_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
