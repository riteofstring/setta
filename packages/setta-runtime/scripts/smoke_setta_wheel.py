#!/usr/bin/env python3

from __future__ import annotations

import sys
from collections.abc import Sequence
from pathlib import Path


def main(arguments: Sequence[str] | None = None) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts._smoke_setta_wheel import main as smoke_main

    return smoke_main(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
