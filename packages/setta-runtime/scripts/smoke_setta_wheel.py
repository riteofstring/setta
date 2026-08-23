#!/usr/bin/env python3
"""Run the clean-install acceptance for one built Setta platform wheel.

This is the sole command-line entrypoint. Its implementation is split into
small, stdlib-only modules for archive inspection, process control, and live
server acceptance.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from setta_wheel_smoke.acceptance import smoke_wheel
from setta_wheel_smoke.inspection import inspect_wheel
from setta_wheel_smoke.models import SmokeError, WheelInspection

__all__ = ["SmokeError", "WheelInspection", "inspect_wheel", "main", "smoke_wheel"]


def main(arguments: Sequence[str] | None = None) -> int:
    """Parse the release-check contract and run one clean installation."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wheel", required=True, type=Path, help="one built platform wheel"
    )
    parser.add_argument(
        "--expected-platform-tag",
        help="require this exact platform component from the wheel tag",
    )
    parser.add_argument(
        "--python",
        type=Path,
        default=Path(sys.executable),
        help="Python interpreter used to create the clean temporary environment",
    )
    parser.add_argument(
        "--keep-temporary-directory",
        action="store_true",
        help="retain the temporary test directory after the smoke run",
    )
    namespace = parser.parse_args(arguments)
    try:
        inspection = smoke_wheel(
            namespace.wheel,
            python=namespace.python,
            expected_platform_tag=namespace.expected_platform_tag,
            keep_temporary_directory=namespace.keep_temporary_directory,
        )
    except SmokeError as error:
        parser.exit(1, f"smoke_setta_wheel: {error}\n")
    print(
        f"Setta wheel smoke passed: {inspection.path.name} ({inspection.platform_tag})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
