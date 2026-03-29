#!/usr/bin/env python3

import argparse
import json
import os
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from pathlib import Path

DEFAULT_REGISTRY_URL = "https://registry.npmjs.org"
MAX_WORKERS = 8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail when pnpm lockfiles contain npm packages newer than the minimum age."
    )
    parser.add_argument(
        "--days",
        type=int,
        required=True,
        help="Minimum package age in whole days.",
    )
    parser.add_argument(
        "--lockfile",
        type=Path,
        required=True,
        help="Path to the pnpm-lock.yaml file to inspect.",
    )
    parser.add_argument(
        "--registry-url",
        default=os.environ.get("SETTA_NPM_REGISTRY_URL", DEFAULT_REGISTRY_URL),
        help=argparse.SUPPRESS,
    )
    return parser.parse_args()


def iter_package_keys(lockfile_text: str) -> list[str]:
    package_keys: list[str] = []
    in_packages = False

    for raw_line in lockfile_text.splitlines():
        if raw_line == "packages:":
            in_packages = True
            continue

        if not in_packages:
            continue

        if raw_line and not raw_line.startswith(" "):
            break

        if not raw_line.startswith("  ") or raw_line.startswith("    "):
            continue

        stripped = raw_line.strip()
        if not stripped.endswith(":"):
            continue

        key = stripped[:-1].strip()
        if len(key) >= 2 and key[0] == key[-1] and key[0] in {"'", '"'}:
            key = key[1:-1]
        package_keys.append(key)

    return package_keys


def parse_registry_package(raw_key: str) -> tuple[str, str] | None:
    base_key = raw_key.split("(", 1)[0]
    if "@" not in base_key:
        return None

    package_name, version = base_key.rsplit("@", 1)
    if not package_name or not version:
        return None

    if "@npm:" in package_name:
        package_name = package_name.split("@npm:", 1)[1]

    if "://" in package_name or version.startswith(("file:", "link:", "workspace:")):
        return None

    return package_name, version


def parse_published_at(raw_time: str) -> datetime:
    return datetime.fromisoformat(raw_time.replace("Z", "+00:00")).astimezone(UTC)


def fetch_package_times(package_name: str, registry_url: str) -> dict[str, str]:
    encoded_name = urllib.parse.quote(package_name, safe="")
    metadata_url = f"{registry_url.rstrip('/')}/{encoded_name}"
    request = urllib.request.Request(metadata_url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load npm metadata for {package_name} from {metadata_url}: {exc}"
        ) from exc

    package_times = payload.get("time")
    if not isinstance(package_times, dict):
        raise RuntimeError(
            f"npm metadata for {package_name} did not include a usable version time map."
        )
    return {
        version: published_at
        for version, published_at in package_times.items()
        if isinstance(version, str) and isinstance(published_at, str)
    }


def load_time_maps(
    package_names: set[str], registry_url: str
) -> dict[str, dict[str, str]]:
    time_maps: dict[str, dict[str, str]] = {}
    max_workers = min(MAX_WORKERS, max(1, len(package_names)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fetch_package_times, package_name, registry_url): package_name
            for package_name in package_names
        }
        for future in as_completed(futures):
            package_name = futures[future]
            time_maps[package_name] = future.result()
    return time_maps


def main() -> int:
    args = parse_args()
    if args.days < 0:
        raise SystemExit("--days must be a non-negative integer")

    lockfile_text = args.lockfile.read_text(encoding="utf-8")
    resolved_packages: set[tuple[str, str]] = set()
    unsupported_keys: list[str] = []

    for raw_key in iter_package_keys(lockfile_text):
        parsed = parse_registry_package(raw_key)
        if parsed is None:
            unsupported_keys.append(raw_key)
            continue
        resolved_packages.add(parsed)

    if unsupported_keys:
        print(
            f"pnpm release-age policy failed: unsupported lockfile entries found in {args.lockfile}."
        )
        for raw_key in sorted(unsupported_keys):
            print(f"- {raw_key}")
        return 1

    cutoff = datetime.now(UTC) - timedelta(days=args.days)
    time_maps = load_time_maps(
        package_names={package_name for package_name, _ in resolved_packages},
        registry_url=args.registry_url,
    )

    too_new: list[tuple[str, str, datetime]] = []
    missing_versions: list[tuple[str, str]] = []

    for package_name, version in sorted(resolved_packages):
        package_times = time_maps[package_name]
        published_at_raw = package_times.get(version)
        if published_at_raw is None:
            missing_versions.append((package_name, version))
            continue

        published_at = parse_published_at(published_at_raw)
        if published_at > cutoff:
            too_new.append((package_name, version, published_at))

    if missing_versions:
        print(
            f"pnpm release-age policy failed: registry metadata did not include {len(missing_versions)} locked version(s) from {args.lockfile}."
        )
        for package_name, version in missing_versions:
            print(f"- {package_name}@{version}")
        return 1

    if too_new:
        print(
            f"pnpm release-age policy failed: {len(too_new)} package(s) in {args.lockfile} are newer than {args.days} day(s)."
        )
        for package_name, version, published_at in too_new:
            print(f"- {package_name}@{version} published {published_at.isoformat()}")
        return 1

    print(
        f"pnpm release-age policy passed: checked {len(resolved_packages)} package version(s) from {args.lockfile} with minimum age {args.days} day(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
