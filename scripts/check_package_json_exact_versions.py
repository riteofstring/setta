#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

DEPENDENCY_SECTIONS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)
FORBIDDEN_VERSION_PREFIXES = ("^", "~", ">", ">=", "*")
EXACT_SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
EXACT_PNPM = re.compile(r"^pnpm@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def load_package(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def invalid_dependency_versions(package_json: dict[str, object]) -> list[str]:
    failures: list[str] = []
    for section in DEPENDENCY_SECTIONS:
        dependencies = package_json.get(section, {})
        if not isinstance(dependencies, dict):
            failures.append(f"{section} must be an object")
            continue
        for name, version in sorted(dependencies.items()):
            if not isinstance(version, str):
                failures.append(f"{section}.{name} must be a string")
                continue
            if version == "latest" or version.startswith(FORBIDDEN_VERSION_PREFIXES):
                failures.append(f"{section}.{name} uses a floating version: {version}")
                continue
            if not EXACT_SEMVER.fullmatch(version):
                failures.append(f"{section}.{name} must use an exact registry version: {version}")
    return failures


def invalid_package_manager(package_json: dict[str, object]) -> str | None:
    package_manager = package_json.get("packageManager")
    if package_manager is None:
        return None
    if not isinstance(package_manager, str):
        return "packageManager must be a string"
    if not EXACT_PNPM.fullmatch(package_manager):
        return f"packageManager must pin pnpm exactly: {package_manager}"
    return None


def main() -> int:
    status = 0
    for raw_path in sys.argv[1:]:
        path = Path(raw_path)
        package_json = load_package(path)
        failures = invalid_dependency_versions(package_json)
        package_manager_failure = invalid_package_manager(package_json)
        if package_manager_failure is not None:
            failures.append(package_manager_failure)
        if failures:
            status = 1
            print(f"Exact dependency version check failed for {path}.", file=sys.stderr)
            for failure in failures:
                print(f"- {failure}", file=sys.stderr)
        else:
            print(f"Exact dependency version check passed for {path}.")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
