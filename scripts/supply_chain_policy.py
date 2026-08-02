#!/usr/bin/env python3

import re
from pathlib import Path

DEFAULT_MIN_RELEASE_AGE_DAYS = 7
MINUTES_PER_DAY = 24 * 60
MIN_RELEASE_AGE_KEY = "SETTA_MIN_RELEASE_AGE_DAYS"
POLICY_FILE = Path("supply_chain_policy.env")
PNPM_MIN_RELEASE_AGE_EXCLUDE_KEY = "minimum-release-age-exclude"
EXACT_NPM_PACKAGE_VERSION_SELECTOR = re.compile(
    r"(?P<package>@[A-Za-z0-9._~-]+/[A-Za-z0-9._~-]+|[A-Za-z0-9._~-]+)@"
    r"(?P<version>[0-9]+\.[0-9]+\.[0-9]+"
    r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)"
)


class PolicyError(ValueError):
    pass


def days_to_minutes(days: int) -> int:
    return days * MINUTES_PER_DAY


def parse_exact_npm_package_version_selector(
    selector: str, *, source: str
) -> tuple[str, str]:
    match = EXACT_NPM_PACKAGE_VERSION_SELECTOR.fullmatch(selector)
    if match is None:
        raise PolicyError(
            f"{source}: {PNPM_MIN_RELEASE_AGE_EXCLUDE_KEY} must pin one exact "
            f"package version, found {selector!r}"
        )
    return match.group("package"), match.group("version")


def read_pnpm_release_age_exclusions(npmrc: Path) -> set[tuple[str, str]]:
    if not npmrc.exists():
        return set()

    exclusions: set[tuple[str, str]] = set()
    first_lines: dict[tuple[str, str], int] = {}
    for line_number, line in enumerate(
        npmrc.read_text(encoding="utf-8").splitlines(), start=1
    ):
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", ";")) or "=" not in stripped:
            continue

        raw_key, raw_value = stripped.split("=", 1)
        key = raw_key.strip()
        if key not in (
            PNPM_MIN_RELEASE_AGE_EXCLUDE_KEY,
            f"{PNPM_MIN_RELEASE_AGE_EXCLUDE_KEY}[]",
        ):
            continue

        exclusion = parse_exact_npm_package_version_selector(
            raw_value.strip(), source=f"{npmrc}:{line_number}"
        )
        if exclusion in exclusions:
            raise PolicyError(
                f"{npmrc}:{line_number}: duplicate "
                f"{PNPM_MIN_RELEASE_AGE_EXCLUDE_KEY}; first defined on line "
                f"{first_lines[exclusion]}"
            )
        exclusions.add(exclusion)
        first_lines[exclusion] = line_number

    return exclusions


def _parse_policy_days(policy_file: Path) -> int:
    found_days: int | None = None
    found_line: int | None = None
    for line_number, line in enumerate(
        policy_file.read_text(encoding="utf-8").splitlines(), start=1
    ):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            raise PolicyError(f"{policy_file}:{line_number}: expected KEY=VALUE")

        key, value = stripped.split("=", 1)
        if key.strip() != MIN_RELEASE_AGE_KEY:
            continue

        value = value.strip()
        if not value.isdigit():
            raise PolicyError(
                f"{policy_file}:{line_number}: {MIN_RELEASE_AGE_KEY} must be a non-negative integer"
            )
        if found_days is not None:
            raise PolicyError(
                f"{policy_file}:{line_number}: duplicate {MIN_RELEASE_AGE_KEY}; "
                f"first defined on line {found_line}"
            )

        found_days = int(value)
        found_line = line_number

    if found_days is None:
        raise PolicyError(f"{policy_file}: missing {MIN_RELEASE_AGE_KEY}")
    return found_days


def read_min_release_age_days(repo_root: Path) -> int:
    policy_file = repo_root / POLICY_FILE
    if not policy_file.exists():
        raise PolicyError(f"Missing supply-chain policy file: {policy_file}")
    return _parse_policy_days(policy_file)


def read_optional_min_release_age_days(repo_root: Path) -> int | None:
    policy_file = repo_root / POLICY_FILE
    if not policy_file.exists():
        return None
    return _parse_policy_days(policy_file)


def write_min_release_age_policy(repo_root: Path, *, days: int) -> None:
    if days < 0:
        raise PolicyError("--days must be a non-negative integer")

    policy_file = repo_root / POLICY_FILE
    policy_file.write_text(
        f"# Repo-local dependency install policy.\n{MIN_RELEASE_AGE_KEY}={days}\n",
        encoding="utf-8",
    )
