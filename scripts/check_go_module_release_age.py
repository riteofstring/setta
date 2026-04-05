#!/usr/bin/env python3

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail when any selected Go module version is newer than the allowed age."
    )
    parser.add_argument(
        "--days",
        type=int,
        required=True,
        help="Minimum allowed module age in whole days.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help=argparse.SUPPRESS,
    )
    return parser.parse_args()


def parse_json_stream(payload: str) -> list[dict[str, object]]:
    decoder = json.JSONDecoder()
    index = 0
    modules: list[dict[str, object]] = []
    while index < len(payload):
        while index < len(payload) and payload[index].isspace():
            index += 1
        if index >= len(payload):
            break
        module, index = decoder.raw_decode(payload, index)
        modules.append(module)
    return modules


def selected_module(entry: dict[str, object]) -> dict[str, object] | None:
    replacement = entry.get("Replace")
    if isinstance(replacement, dict):
        if replacement.get("Version"):
            return replacement
        return None
    return entry


def parse_published_at(raw_time: str) -> datetime:
    return datetime.fromisoformat(raw_time.replace("Z", "+00:00"))


def run_go_module_list(repo_root: Path) -> subprocess.CompletedProcess[str]:
    go_script = repo_root / "scripts" / "go.sh"
    return subprocess.run(
        [str(go_script), "list", "-m", "-json", "all"],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )


def selected_release_entry(
    entry: dict[str, object],
) -> tuple[str, str, datetime] | None:
    if entry.get("Main") is True:
        return None

    module = selected_module(entry)
    if module is None:
        return None

    path = module.get("Path")
    version = module.get("Version")
    published = module.get("Time")
    if (
        not isinstance(path, str)
        or not isinstance(version, str)
        or not isinstance(published, str)
    ):
        return None

    return path, version, parse_published_at(published)


def collect_release_age_failures(
    payload: str, cutoff: datetime
) -> tuple[list[tuple[str, str, datetime]], int]:
    too_new: list[tuple[str, str, datetime]] = []
    checked_modules = 0
    for entry in parse_json_stream(payload):
        release_entry = selected_release_entry(entry)
        if release_entry is None:
            continue
        checked_modules += 1
        path, version, published_at = release_entry
        if published_at > cutoff:
            too_new.append(release_entry)

    return too_new, checked_modules


def report_failures(
    too_new: list[tuple[str, str, datetime]], minimum_age_days: int
) -> None:
    print(
        f"Go module release-age policy failed: {len(too_new)} module(s) are newer than {minimum_age_days} day(s)."
    )
    for path, version, published_at in sorted(too_new):
        print(f"- {path}@{version} published {published_at.isoformat()}")


def report_success(checked_modules: int, minimum_age_days: int) -> None:
    print(
        f"Go module release-age policy passed: checked {checked_modules} module(s) with minimum age {minimum_age_days} day(s)."
    )


def main() -> int:
    args = parse_args()
    if args.days < 0:
        raise SystemExit("--days must be a non-negative integer")

    repo_root = args.repo_root.resolve()
    result = run_go_module_list(repo_root)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        return result.returncode

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    too_new, checked_modules = collect_release_age_failures(result.stdout, cutoff)

    if too_new:
        report_failures(too_new, args.days)
        return 1

    report_success(checked_modules, args.days)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
