#!/usr/bin/env python3
"""Validate Setta's eval-container supply-chain policy without Docker."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

from supply_chain_policy import (
    PolicyError as SupplyChainPolicyError,
    read_min_release_age_days,
)


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
IMAGE_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
SCANNER_IMAGE_PREFIX = "docker.io/aquasec/trivy@sha256:"
TOOLCHAIN_IMAGE_PREFIX = "docker.io/library/node@sha256:"
ALLOWED_INSTRUCTIONS = {
    "ARG",
    "COPY",
    "ENTRYPOINT",
    "ENV",
    "EXPOSE",
    "FROM",
    "USER",
    "WORKDIR",
}
DOCKERFILE_BASES = {
    "phase0.Dockerfile": ["FROM scratch"],
    "phase1-agent.Dockerfile": ["ARG TOOLCHAIN_IMAGE", "FROM ${TOOLCHAIN_IMAGE}"],
    "phase1-backend.Dockerfile": ["FROM scratch"],
    "phase1-verifier.Dockerfile": ["ARG TOOLCHAIN_IMAGE", "FROM ${TOOLCHAIN_IMAGE}"],
}


class PolicyError(ValueError):
    pass


def exact_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise PolicyError(f"JSON repeats key {key!r}")
        value[key] = item
    return value


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as source:
            value = json.load(source, object_pairs_hook=exact_object)
    except (OSError, UnicodeError, json.JSONDecodeError, PolicyError) as error:
        raise PolicyError(f"read {path}: {error}") from error
    if not isinstance(value, dict):
        raise PolicyError(f"{path} must contain one JSON object")
    return value


def require_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise PolicyError(f"{label} keys differ: missing={missing}, extra={extra}")


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value.strip() != value:
        raise PolicyError(f"{label} must be a non-empty trimmed string")
    return value


def require_sha256(value: Any, label: str, prefix: bool = False) -> str:
    text = require_string(value, label)
    digest = text.removeprefix("sha256:") if prefix else text
    if not SHA256_RE.fullmatch(digest) or (prefix and not text.startswith("sha256:")):
        raise PolicyError(f"{label} must be an exact lowercase SHA-256 digest")
    return text


def validate_toolchain_pin(sandbox: Path) -> None:
    pin = load_json(sandbox / "phase1-toolchain.json")
    require_keys(
        pin,
        {
            "schemaVersion",
            "platform",
            "baseImage",
            "baseImageId",
            "nodeVersion",
            "pnpmVersion",
            "pnpmBundleSha256",
            "pnpmLicenseSha256",
        },
        "Phase 1 toolchain pin",
    )
    if type(pin["schemaVersion"]) is not int or pin["schemaVersion"] != 1:
        raise PolicyError("Phase 1 toolchain pin must use schema 1")
    if pin["platform"] != "linux/arm64":
        raise PolicyError("Phase 1 toolchain pin must use schema 1 and linux/arm64")
    image = require_string(pin["baseImage"], "Phase 1 base image")
    if not image.startswith(TOOLCHAIN_IMAGE_PREFIX) or not SHA256_RE.fullmatch(
        image.removeprefix(TOOLCHAIN_IMAGE_PREFIX)
    ):
        raise PolicyError("Phase 1 base image must be pinned by an exact Node manifest digest")
    if not IMAGE_ID_RE.fullmatch(require_string(pin["baseImageId"], "Phase 1 base image id")):
        raise PolicyError("Phase 1 base image id must be an exact lowercase image config digest")
    for key in ("nodeVersion", "pnpmVersion"):
        if not VERSION_RE.fullmatch(require_string(pin[key], f"Phase 1 {key}")):
            raise PolicyError(f"Phase 1 {key} must be an exact numeric version")
    require_sha256(pin["pnpmBundleSha256"], "pnpm bundle digest")
    require_sha256(pin["pnpmLicenseSha256"], "pnpm license digest")


def validate_scanner_pin(sandbox: Path, minimum_release_age_days: int) -> None:
    policy = load_json(sandbox / "container-security-policy.json")
    require_keys(
        policy,
        {"schemaVersion", "platform", "scanner", "database", "policy"},
        "container policy",
    )
    if type(policy["schemaVersion"]) is not int or policy["schemaVersion"] != 1:
        raise PolicyError("container policy must use schema 1")
    if policy["platform"] != "linux/arm64":
        raise PolicyError("container policy must use schema 1 and linux/arm64")

    scanner = policy["scanner"]
    if not isinstance(scanner, dict):
        raise PolicyError("container scanner must be an object")
    require_keys(
        scanner,
        {
            "name",
            "version",
            "image",
            "imageId",
            "platformManifestDigest",
            "attestationManifestDigest",
            "sbomAttestationDigest",
            "provenanceAttestationDigest",
            "release",
        },
        "container scanner",
    )
    version = require_string(scanner["version"], "scanner version")
    if scanner["name"] != "trivy" or not VERSION_RE.fullmatch(version):
        raise PolicyError("container scanner must be one exact Trivy version")
    image = require_string(scanner["image"], "scanner image")
    if not image.startswith(SCANNER_IMAGE_PREFIX) or not SHA256_RE.fullmatch(
        image.removeprefix(SCANNER_IMAGE_PREFIX)
    ):
        raise PolicyError("scanner image must be the exact official Trivy registry digest")
    if not IMAGE_ID_RE.fullmatch(require_string(scanner["imageId"], "scanner image id")):
        raise PolicyError("scanner image id must be an exact lowercase image config digest")
    for key in (
        "platformManifestDigest",
        "attestationManifestDigest",
        "sbomAttestationDigest",
        "provenanceAttestationDigest",
    ):
        require_sha256(scanner[key], f"scanner {key}", prefix=True)

    release = scanner["release"]
    if not isinstance(release, dict):
        raise PolicyError("scanner release must be an object")
    require_keys(
        release,
        {
            "publishedAt",
            "url",
            "sbomUrl",
            "sbomSha256",
            "checksumsSigstoreBundleUrl",
            "checksumsSigstoreBundleSha256",
        },
        "scanner release",
    )
    try:
        published = datetime.fromisoformat(
            require_string(release["publishedAt"], "scanner release date").replace(
                "Z", "+00:00"
            )
        )
    except ValueError as error:
        raise PolicyError(
            "scanner release date must be a non-future RFC3339 timestamp"
        ) from error
    if published.tzinfo is None or published > datetime.now(timezone.utc):
        raise PolicyError("scanner release date must be a non-future RFC3339 timestamp")
    if datetime.now(timezone.utc) - published < timedelta(
        days=minimum_release_age_days
    ):
        raise PolicyError(
            f"scanner release must be at least {minimum_release_age_days} days old"
        )
    release_prefix = "https://github.com/aquasecurity/trivy/releases"
    expected_urls = {
        "url": f"{release_prefix}/tag/v{version}",
        "sbomUrl": f"{release_prefix}/download/v{version}/bom.json",
        "checksumsSigstoreBundleUrl": (
            f"{release_prefix}/download/v{version}/"
            f"trivy_{version}_checksums.txt.sigstore.json"
        ),
    }
    for key, expected in expected_urls.items():
        if require_string(release[key], f"scanner release {key}") != expected:
            raise PolicyError(
                f"scanner release {key} must be the exact official release asset"
            )
    require_sha256(release["sbomSha256"], "scanner release SBOM digest")
    require_sha256(
        release["checksumsSigstoreBundleSha256"],
        "scanner release Sigstore bundle digest",
    )

    database = policy["database"]
    if not isinstance(database, dict):
        raise PolicyError("scanner database policy must be an object")
    require_keys(
        database,
        {"repository", "schemaVersion", "maximumAgeHours"},
        "scanner database policy",
    )
    if (
        database["repository"] != "ghcr.io/aquasecurity/trivy-db:2"
        or type(database["schemaVersion"]) is not int
        or database["schemaVersion"] != 2
    ):
        raise PolicyError("scanner database must use the explicit official schema-2 repository")
    if (
        type(database["maximumAgeHours"]) is not int
        or not 1 <= database["maximumAgeHours"] <= 72
    ):
        raise PolicyError("scanner database maximum age must be 1-72 hours")

    findings = policy["policy"]
    if not isinstance(findings, dict):
        raise PolicyError("scanner finding policy must be an object")
    require_keys(
        findings,
        {"failSeverities", "maximumImageBytes", "maximumReportBytes"},
        "scanner finding policy",
    )
    if findings["failSeverities"] != ["HIGH", "CRITICAL"]:
        raise PolicyError("scanner must fail on HIGH and CRITICAL findings")
    for key in ("maximumImageBytes", "maximumReportBytes"):
        if type(findings[key]) is not int or findings[key] <= 0:
            raise PolicyError(f"scanner {key} must be a positive integer")


def logical_dockerfile_lines(path: Path, content: str) -> list[tuple[int, str]]:
    logical: list[tuple[int, str]] = []
    pending = ""
    pending_line = 0
    for number, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            if pending:
                raise PolicyError(
                    f"{path.name}:{number} may not break a continued instruction"
                )
            continue
        if line.startswith("#"):
            if pending:
                raise PolicyError(
                    f"{path.name}:{number} may not continue through a comment"
                )
            if re.match(r"^#\s*(?:syntax|escape|check)\s*=", line, re.IGNORECASE):
                raise PolicyError(f"{path.name}:{number} may not change Dockerfile parsing")
            continue
        continued = line.endswith("\\")
        fragment = line[:-1].rstrip() if continued else line
        if pending:
            pending += " " + fragment
        else:
            pending = fragment
            pending_line = number
        if continued:
            first_word = pending.split(maxsplit=1)[0].upper()
            if first_word != "ENV":
                raise PolicyError(
                    f"{path.name}:{pending_line} may continue only an ENV instruction"
                )
            continue
        logical.append((pending_line, pending))
        pending = ""
        pending_line = 0
    if pending:
        raise PolicyError(f"{path.name}:{pending_line} has a dangling continuation")
    return logical


def docker_instructions(path: Path) -> list[str]:
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise PolicyError(f"read {path}: {error}") from error
    if "\x00" in content or "\r" in content:
        raise PolicyError(f"{path.name} contains unsupported control characters")
    instructions: list[str] = []
    for number, line in logical_dockerfile_lines(path, content):
        match = re.match(r"^([A-Za-z]+)(?:\s+|$)", line)
        if match is None:
            raise PolicyError(f"{path.name}:{number} is not one complete Docker instruction")
        instruction = match.group(1).upper()
        if instruction not in ALLOWED_INSTRUCTIONS:
            raise PolicyError(f"{path.name}:{number} uses forbidden instruction {instruction}")
        if instruction == "COPY":
            lowered = line.lower()
            if any(
                marker in lowered
                for marker in ("--from", "http://", "https://", "git://")
            ):
                raise PolicyError(
                    f"{path.name}:{number} COPY must use only local build-context inputs"
                )
        instructions.append(instruction + line[len(match.group(1)) :])
    return instructions


def validate_dockerfiles(sandbox: Path) -> None:
    actual = {path.name for path in sandbox.glob("*.Dockerfile")}
    expected = set(DOCKERFILE_BASES)
    if actual != expected:
        raise PolicyError(
            "eval Dockerfile set differs: "
            f"missing={sorted(expected - actual)}, "
            f"extra={sorted(actual - expected)}"
        )
    for name, prefix in DOCKERFILE_BASES.items():
        instructions = docker_instructions(sandbox / name)
        if instructions[: len(prefix)] != prefix:
            raise PolicyError(f"{name} must begin with {prefix!r}")
        from_instructions = [item for item in instructions if item.startswith("FROM ")]
        if from_instructions != [prefix[-1]]:
            raise PolicyError(f"{name} must have exactly one approved FROM instruction")
        user_instructions = [item for item in instructions if item.startswith("USER ")]
        if not user_instructions or user_instructions[-1] != "USER 65532:65532":
            raise PolicyError(f"{name} must finish configuration as user 65532:65532")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=Path(__file__).resolve().parents[1], type=Path)
    parser.add_argument(
        "--print-scanner-image",
        action="store_true",
        help="print the validated exact scanner image instead of the status message",
    )
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    sandbox = repo_root / "evals" / "sandbox"
    try:
        minimum_release_age_days = read_min_release_age_days(repo_root)
    except (OSError, SupplyChainPolicyError) as error:
        raise PolicyError(f"read supply-chain release-age policy: {error}") from error
    validate_toolchain_pin(sandbox)
    validate_scanner_pin(sandbox, minimum_release_age_days)
    validate_dockerfiles(sandbox)
    if args.print_scanner_image:
        print(load_json(sandbox / "container-security-policy.json")["scanner"]["image"])
    else:
        print(
            "Evaluation container policy: pinned inputs and offline-only "
            "Dockerfiles are valid."
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PolicyError as error:
        raise SystemExit(f"Evaluation container policy failed: {error}") from error
