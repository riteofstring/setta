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


def _parse_upload_time(raw_value: str) -> datetime:
    return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).astimezone(UTC)


def _collect_upload_times(package: dict[str, object]) -> list[datetime]:
    upload_times: list[datetime] = []
    sdist = package.get("sdist")
    if isinstance(sdist, dict) and "upload-time" in sdist:
        upload_times.append(_parse_upload_time(sdist["upload-time"]))

    for wheel in package.get("wheels", []):
        if "upload-time" in wheel:
            upload_times.append(_parse_upload_time(wheel["upload-time"]))

    return upload_times


def _collect_release_age_failures(
    packages: list[dict[str, object]], cutoff: datetime
) -> tuple[int, list[tuple[str, str, datetime]]]:
    failures: list[tuple[str, str, datetime]] = []
    checked_packages = 0

    for package in packages:
        name = package.get("name")
        version = package.get("version")
        if not name or not version:
            continue
        upload_times = _collect_upload_times(package)
        if not upload_times:
            continue

        checked_packages += 1
        newest_upload = max(upload_times)
        if newest_upload > cutoff:
            failures.append((name, version, newest_upload))

    return checked_packages, failures


def _print_failures(days: int, failures: list[tuple[str, str, datetime]]) -> None:
    print(
        f"Python release-age policy failed: {len(failures)} package(s) are newer than {days} day(s)."
    )
    for name, version, newest_upload in sorted(failures):
        print(
            f"- {name}=={version} newest artifact uploaded at {newest_upload.isoformat()}"
        )


def _print_success(days: int, checked_packages: int) -> None:
    print(
        f"Python release-age policy passed: checked {checked_packages} package(s) with minimum age {days} day(s)."
    )


def main() -> int:
    args = parse_args()
    if args.days < 0:
        raise SystemExit("days must be a non-negative integer")

    lockfile = args.lockfile
    data = tomllib.loads(lockfile.read_text(encoding="utf-8"))
    cutoff = datetime.now(UTC) - timedelta(days=args.days)
    checked_packages, failures = _collect_release_age_failures(
        data.get("package", []), cutoff
    )

    if failures:
        _print_failures(args.days, failures)
        return 1

    _print_success(args.days, checked_packages)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
