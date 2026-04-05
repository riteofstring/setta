#!/usr/bin/env python3

import argparse
import subprocess
from pathlib import Path

DEFAULT_MIN_RELEASE_AGE_DAYS = 7
MINUTES_PER_DAY = 24 * 60
LOCAL_PNPM_PROJECTS = (
    Path("frontend"),
    Path("backend/setta/agentic/external_adapters/sidecars"),
)
LOCAL_POLICY_FILE = Path("supply_chain_policy.env")
NPMRC_KEY_ALIASES = ("minimum-release-age", "min-release-age", "minimumReleaseAge")


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
        help=f"Minimum package age in whole days (default: existing repo policy or {DEFAULT_MIN_RELEASE_AGE_DAYS}).",
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


def read_existing_days(repo_root: Path) -> int | None:
    policy_file = repo_root / LOCAL_POLICY_FILE
    if not policy_file.exists():
        return None
    for line in policy_file.read_text(encoding="utf-8").splitlines():
        if not line.startswith("SETTA_MIN_RELEASE_AGE_DAYS="):
            continue
        value = line.split("=", 1)[1].strip()
        if value.isdigit():
            return int(value)
    return None


def resolve_days(args: argparse.Namespace) -> int:
    if args.days is not None:
        return args.days
    existing_days = read_existing_days(args.repo_root.resolve())
    if existing_days is not None:
        return existing_days
    return DEFAULT_MIN_RELEASE_AGE_DAYS


def days_to_minutes(days: int) -> int:
    return days * MINUTES_PER_DAY


def upsert_npmrc(path: Path, *, days: int) -> None:
    minutes = days_to_minutes(days)
    lines: list[str]
    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
    else:
        lines = []

    updated_lines: list[str] = []
    replaced = False
    for line in lines:
        stripped = line.strip()
        key = stripped.split("=", 1)[0].strip() if "=" in stripped else None
        if key in NPMRC_KEY_ALIASES:
            if not replaced:
                updated_lines.append(f"minimum-release-age={minutes}")
                replaced = True
            continue
        updated_lines.append(line)

    if not replaced:
        updated_lines.append(f"minimum-release-age={minutes}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(updated_lines).rstrip() + "\n", encoding="utf-8")


def write_local_policy(repo_root: Path, *, days: int) -> None:
    policy_file = repo_root / LOCAL_POLICY_FILE
    policy_file.write_text(
        f"# Repo-local dependency install policy.\nSETTA_MIN_RELEASE_AGE_DAYS={days}\n",
        encoding="utf-8",
    )


def configure_local(repo_root: Path, *, days: int) -> None:
    write_local_policy(repo_root, days=days)
    for project_dir in LOCAL_PNPM_PROJECTS:
        upsert_npmrc(repo_root / project_dir / ".npmrc", days=days)

    print(f"Configured repo-local minimum release age: {days} day(s).")
    print(f"- Updated {(repo_root / LOCAL_POLICY_FILE).relative_to(repo_root)}")
    for project_dir in LOCAL_PNPM_PROJECTS:
        print(
            f"- Updated {(repo_root / project_dir / '.npmrc').relative_to(repo_root)}"
        )
    print(
        "Go has no native install-time release-age setting; use ./audit_supply_chain.sh for Go module age checks."
    )
    print(
        "pnpm uses minimum-release-age in minutes, and this repo also verifies checked-in pnpm lockfiles with audit/update scripts."
    )
    print(
        "uv only supports an absolute cutoff date, so this repo enforces Python age gating through init_env.sh and audit_supply_chain.sh."
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
        "Skipped uv: current uv only supports an absolute exclude-newer date, not a rolling global minimum-age policy."
    )
    print(
        "Skipped Go: Go modules do not expose a native install-time release-age setting."
    )
    print(
        "Use ./configure_supply_chain.sh --local-only if you want repo-local Python enforcement via init_env.sh."
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
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode) from exc
