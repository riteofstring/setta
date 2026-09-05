#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path


def main(arguments: list[str] | None = None) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(runtime_root), str(runtime_root / "src")]
    from scripts._stage_setta_wheel import main as stage_main

    return stage_main(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
