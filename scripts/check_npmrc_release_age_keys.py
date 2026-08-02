#!/usr/bin/env python3

import argparse
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from supply_chain_policy import (
    PolicyError,
    days_to_minutes,
    read_pnpm_release_age_exclusions,
)

IGNORED_PROJECT_PARTS = (
    ".git",
    ".tools",
    "build",
    "dist",
    "node_modules",
    "out",
    "coverage",
    "test-results",
    "playwright-report",
)
RELEASE_AGE_KEY = "minimum-release-age"
STALE_RELEASE_AGE_KEYS = ("min-release-age", "minimumReleaseAge")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check npmrc release-age policy in a repository."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root to scan.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Expected package-local minimum release age in whole days.",
    )
    args = parser.parse_args()
    if args.days is not None and args.days < 0:
        parser.error("--days must be a non-negative integer")
    return args


def npmrc_key(line: str) -> str | None:
    stripped = line.strip()
    if "=" not in stripped:
        return None
    return stripped.split("=", 1)[0].strip()


def npmrc_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for root, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [
            dirname for dirname in dirnames if dirname not in IGNORED_PROJECT_PARTS
        ]
        if ".npmrc" in filenames:
            files.append(Path(root) / ".npmrc")
    return sorted(files)


def package_projects(repo_root: Path) -> list[Path]:
    projects: list[Path] = []
    for root, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [
            dirname for dirname in dirnames if dirname not in IGNORED_PROJECT_PARTS
        ]
        if "package.json" in filenames:
            projects.append(Path(root))
    return sorted(projects)


def release_age_values(path: Path) -> list[tuple[int, str]]:
    values: list[tuple[int, str]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        key = npmrc_key(line)
        if key == RELEASE_AGE_KEY:
            values.append((line_number, line.split("=", 1)[1].strip()))
    return values


def stale_key_findings(repo_root: Path) -> list[str]:
    findings: list[str] = []
    for path in npmrc_files(repo_root):
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            key = npmrc_key(line)
            if key in STALE_RELEASE_AGE_KEYS:
                findings.append(
                    f"{path}:{line_number}: stale npmrc key {key}; "
                    f"remove it and use {RELEASE_AGE_KEY}"
                )
    return findings


def release_age_exclusion_findings(repo_root: Path) -> list[str]:
    findings: list[str] = []
    for path in npmrc_files(repo_root):
        try:
            read_pnpm_release_age_exclusions(path)
        except PolicyError as error:
            findings.append(str(error))
    return findings


def release_age_policy_findings(repo_root: Path, *, days: int) -> list[str]:
    expected_minutes = days_to_minutes(days)
    findings: list[str] = []
    for project_dir in package_projects(repo_root):
        path = project_dir / ".npmrc"
        if not path.exists():
            findings.append(
                f"{path}: missing {RELEASE_AGE_KEY}={expected_minutes}; "
                "run ./configure_supply_chain.sh --local-only"
            )
            continue

        values = release_age_values(path)
        if not values:
            findings.append(f"{path}: missing {RELEASE_AGE_KEY}={expected_minutes}")
            continue
        if len(values) > 1:
            line_numbers = ", ".join(str(line_number) for line_number, _ in values)
            findings.append(
                f"{path}: duplicate {RELEASE_AGE_KEY} on lines {line_numbers}"
            )
            continue

        line_number, value = values[0]
        if not value.isdigit():
            findings.append(
                f"{path}:{line_number}: {RELEASE_AGE_KEY} must be a non-negative integer"
            )
            continue
        if int(value) != expected_minutes:
            findings.append(
                f"{path}:{line_number}: expected "
                f"{RELEASE_AGE_KEY}={expected_minutes}, found {value}"
            )
    return findings


def main() -> int:
    repo_root = args.repo_root.resolve()
    findings = stale_key_findings(repo_root)
    findings.extend(release_age_exclusion_findings(repo_root))
    if args.days is not None:
        findings.extend(release_age_policy_findings(repo_root, days=args.days))
    if findings:
        print("\n".join(findings))
        return 1
    return 0


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(main())
