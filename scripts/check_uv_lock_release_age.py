#!/usr/bin/env python3

import argparse
import tomllib
from datetime import UTC, datetime, timedelta
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail when uv.lock contains Python packages newer than the minimum age."
    )
    parser.add_argument(
        "--days", type=int, required=True, help="Minimum package age in whole days."
    )
    parser.add_argument(
        "--lockfile",
        type=Path,
        default=Path("./uv.lock"),
        help="Path to the uv.lock file to inspect.",
    )
    return parser.parse_args()


def parse_upload_time(raw_value: str) -> datetime:
    return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).astimezone(UTC)


def main() -> int:
    args = parse_args()
    if args.days < 0:
        raise SystemExit("days must be a non-negative integer")

    lockfile = args.lockfile
    data = tomllib.loads(lockfile.read_text(encoding="utf-8"))
    cutoff = datetime.now(UTC) - timedelta(days=args.days)
    failures: list[tuple[str, str, datetime]] = []
    checked_packages = 0

    for package in data.get("package", []):
        name = package.get("name")
        version = package.get("version")
        if not name or not version:
            continue
        upload_times: list[datetime] = []

        sdist = package.get("sdist")
        if isinstance(sdist, dict) and "upload-time" in sdist:
            upload_times.append(parse_upload_time(sdist["upload-time"]))

        for wheel in package.get("wheels", []):
            if "upload-time" in wheel:
                upload_times.append(parse_upload_time(wheel["upload-time"]))

        if not upload_times:
            continue

        checked_packages += 1
        newest_upload = max(upload_times)
        if newest_upload > cutoff:
            failures.append((name, version, newest_upload))

    if failures:
        print(
            f"Python release-age policy failed: {len(failures)} package(s) are newer than {args.days} day(s)."
        )
        for name, version, newest_upload in sorted(failures):
            print(
                f"- {name}=={version} newest artifact uploaded at {newest_upload.isoformat()}"
            )
        return 1

    print(
        f"Python release-age policy passed: checked {checked_packages} package(s) with minimum age {args.days} day(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
