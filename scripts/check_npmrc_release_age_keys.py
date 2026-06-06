#!/usr/bin/env python3

import argparse
import os
from pathlib import Path

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
STALE_RELEASE_AGE_KEYS = ("min-release-age", "minimumReleaseAge")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reject stale npmrc release-age keys in a repository."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root to scan.",
    )
    return parser.parse_args()


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


def stale_key_findings(repo_root: Path) -> list[str]:
    findings: list[str] = []
    for path in npmrc_files(repo_root):
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            key = npmrc_key(line)
            if key in STALE_RELEASE_AGE_KEYS:
                findings.append(
                    f"{path}:{line_number}: stale npmrc key {key}; remove it and use minimum-release-age"
                )
    return findings


def main() -> int:
    repo_root = args.repo_root.resolve()
    findings = stale_key_findings(repo_root)
    if findings:
        print("\n".join(findings))
        return 1
    return 0


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(main())
