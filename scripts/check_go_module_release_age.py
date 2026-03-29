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


def main() -> int:
    args = parse_args()
    if args.days < 0:
        raise SystemExit("--days must be a non-negative integer")

    repo_root = args.repo_root.resolve()
    go_script = repo_root / "scripts" / "go.sh"
    result = subprocess.run(
        [str(go_script), "list", "-m", "-json", "all"],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        return result.returncode

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    too_new: list[tuple[str, str, datetime]] = []
    checked_modules = 0

    for entry in parse_json_stream(result.stdout):
        if entry.get("Main") is True:
            continue

        module = selected_module(entry)
        if module is None:
            continue

        path = module.get("Path")
        version = module.get("Version")
        published = module.get("Time")
        if not isinstance(path, str) or not isinstance(version, str) or not isinstance(published, str):
            continue

        published_at = parse_published_at(published)
        checked_modules += 1
        if published_at > cutoff:
            too_new.append((path, version, published_at))

    if too_new:
        print(
            f"Go module release-age policy failed: {len(too_new)} module(s) are newer than {args.days} day(s)."
        )
        for path, version, published_at in sorted(too_new):
            print(f"- {path}@{version} published {published_at.isoformat()}")
        return 1

    print(
        f"Go module release-age policy passed: checked {checked_modules} module(s) with minimum age {args.days} day(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
