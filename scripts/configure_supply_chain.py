#!/usr/bin/env python3

import argparse
import os
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from supply_chain_policy import (
    DEFAULT_MIN_RELEASE_AGE_DAYS,
    POLICY_FILE,
    PolicyError,
    days_to_minutes,
    read_optional_min_release_age_days,
    write_min_release_age_policy,
)

IGNORED_PROJECT_PARTS = (
    ".git",
    ".tools",
    "build",
    "dist",
    "node_modules",
)
NPMRC_RELEASE_AGE_KEY = "minimum-release-age"
STALE_NPMRC_RELEASE_AGE_KEYS = ("min-release-age", "minimumReleaseAge")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Configure dependency release-age policy for this repo or for the current user."
        )
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--local-only",
        action="store_true",
        help="Update repo-local policy files and pnpm package configs (default).",
    )
    mode.add_argument(
        "--global",
        dest="global_mode",
        action="store_true",
        help="Update global npm and pnpm user config instead of repo-local files.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help=(
            "Minimum package age in whole days "
            f"(default: existing repo policy or {DEFAULT_MIN_RELEASE_AGE_DAYS})."
        ),
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()
    if args.days is not None and args.days < 0:
        parser.error("--days must be a non-negative integer")
    if not args.local_only and not args.global_mode:
        args.local_only = True
    return args


def resolve_days(args: argparse.Namespace) -> int:
    if args.days is not None:
        return args.days
    existing_days = read_optional_min_release_age_days(args.repo_root.resolve())
    if existing_days is not None:
        return existing_days
    return DEFAULT_MIN_RELEASE_AGE_DAYS


def load_npmrc_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def npmrc_key(line: str) -> str | None:
    stripped = line.strip()
    if "=" not in stripped:
        return None
    return stripped.split("=", 1)[0].strip()


def validate_npmrc_release_age_keys(path: Path, lines: list[str]) -> None:
    for line in lines:
        key = npmrc_key(line)
        if key in STALE_NPMRC_RELEASE_AGE_KEYS:
            raise ValueError(
                f"{path} uses stale npmrc key {key}; remove it and use {NPMRC_RELEASE_AGE_KEY}"
            )


def upsert_release_age_npmrc_lines(
    path: Path, lines: list[str], *, minutes: int
) -> list[str]:
    validate_npmrc_release_age_keys(path, lines)
    policy_line = f"{NPMRC_RELEASE_AGE_KEY}={minutes}"
    kept_lines: list[str] = []
    insert_at: int | None = None
    for line in lines:
        if npmrc_key(line) != NPMRC_RELEASE_AGE_KEY:
            kept_lines.append(line)
            continue
        if insert_at is None:
            insert_at = len(kept_lines)
    if insert_at is None:
        kept_lines.append(policy_line)
        return kept_lines
    kept_lines.insert(insert_at, policy_line)
    return kept_lines


def upsert_npmrc(path: Path, *, days: int) -> None:
    updated_lines = upsert_release_age_npmrc_lines(
        path, load_npmrc_lines(path), minutes=days_to_minutes(days)
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(updated_lines).rstrip() + "\n", encoding="utf-8")


def discover_pnpm_projects(repo_root: Path) -> list[Path]:
    projects: list[Path] = []
    for root, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [
            dirname for dirname in dirnames if dirname not in IGNORED_PROJECT_PARTS
        ]
        root_path = Path(root)
        if "package.json" not in filenames:
            continue
        projects.append(root_path.relative_to(repo_root))
    return sorted(projects)


def configure_local(repo_root: Path, *, days: int) -> None:
    write_min_release_age_policy(repo_root, days=days)
    pnpm_projects = discover_pnpm_projects(repo_root)
    for project_dir in pnpm_projects:
        upsert_npmrc(repo_root / project_dir / ".npmrc", days=days)

    print(f"Configured repo-local minimum release age: {days} day(s).")
    print(f"- Updated {(repo_root / POLICY_FILE).relative_to(repo_root)}")
    for project_dir in pnpm_projects:
        print(
            f"- Updated {(repo_root / project_dir / '.npmrc').relative_to(repo_root)}"
        )
    if not pnpm_projects:
        print("- No package.json files found yet; skipped pnpm project .npmrc files.")
    print(
        "Go has no native install-time release-age setting; "
        "./update_dependencies.sh checks Go module release age when go.mod exists."
    )
    print(
        "pnpm uses minimum-release-age in minutes; "
        "./update_dependencies.sh refreshes and verifies checked-in pnpm lockfiles "
        "when package.json files exist."
    )


def run_checked(command: list[str], *, cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def configure_global(repo_root: Path, *, days: int) -> None:
    minutes = days_to_minutes(days)
    run_checked(
        [
            "npm",
            "config",
            "set",
            "minimum-release-age",
            str(minutes),
            "--location=user",
        ],
        cwd=repo_root,
    )
    run_checked(
        ["pnpm", "config", "set", "minimum-release-age", str(minutes), "--global"],
        cwd=repo_root,
    )

    print(f"Configured global npm/pnpm minimum release age: {days} day(s).")
    print(
        "Skipped Go: Go modules do not expose a native install-time release-age setting."
    )


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    days = resolve_days(args)
    if args.global_mode:
        configure_global(repo_root, days=days)
    else:
        configure_local(repo_root, days=days)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (PolicyError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode) from exc
