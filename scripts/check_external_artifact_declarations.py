#!/usr/bin/env python3

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True

ARTIFACT_METADATA_RE = re.compile(
    r"^\s*(?://|#)\s*setta-supply-chain-(artifact|owner-file):\s*(\S+)\s*$",
    re.MULTILINE,
)
BASH_ASSIGNMENT_RE = re.compile(
    r"""^\s*([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^#\n]*))""",
    re.MULTILINE,
)
BASH_VARIABLE_RE = re.compile(
    r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)"
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PINNED_RELEASE_RE = re.compile(r"^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
TS_FIELD_RE = re.compile(
    r"""^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(?:"([^"]*)"|([0-9][0-9_]*)),?\s*$""",
    re.MULTILINE,
)


@dataclass(frozen=True)
class RequiredField:
    label: str
    name: str
    validator: str


@dataclass(frozen=True)
class ArtifactAudit:
    artifact_id: str
    kind: str
    owner_file: str
    fields: tuple[RequiredField, ...]
    object_name: str | None = None


LOCAL_MACOS_VOICE_ARTIFACTS = (
    ArtifactAudit(
        artifact_id="local-macos-voice.whisper-xcframework",
        kind="bash",
        owner_file="scripts/build_local_macos_voice_helper.sh",
        fields=(
            RequiredField("pinned release version", "whisper_release_version", "release"),
            RequiredField("artifact filename", "whisper_xcframework_filename", "identity"),
            RequiredField("source URL", "whisper_xcframework_url", "url"),
            RequiredField("expected SHA-256", "whisper_xcframework_sha256", "sha256"),
            RequiredField("expected byte size", "whisper_xcframework_bytes", "positive_int"),
        ),
    ),
    ArtifactAudit(
        artifact_id="local-macos-voice.default-whisper-model",
        kind="ts_object",
        owner_file="desktop/src/main/local-macos-voice-model-download.ts",
        object_name="defaultLocalMacOSVoiceModelDownloadSpec",
        fields=(
            RequiredField("model name", "name", "identity"),
            RequiredField("artifact filename", "filename", "identity"),
            RequiredField("source URL", "url", "url"),
            RequiredField("expected SHA-256", "sha256", "sha256"),
            RequiredField("expected byte size", "bytes", "positive_int"),
        ),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check checked-in external artifact declarations."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root containing the artifact owner files.",
    )
    return parser.parse_args()


def parse_artifact_metadata(text: str) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for key, value in ARTIFACT_METADATA_RE.findall(text):
        metadata[key] = value
    return metadata


def parse_bash_assignments(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for match in BASH_ASSIGNMENT_RE.finditer(text):
        raw_value = next(
            value for value in match.groups()[1:] if value is not None
        ).strip()
        values[match.group(1)] = raw_value
    return expand_bash_assignments(values)


def expand_bash_assignments(values: dict[str, str]) -> dict[str, str]:
    expanded = dict(values)
    for _ in range(len(expanded)):
        changed = False
        for name, value in list(expanded.items()):
            next_value = BASH_VARIABLE_RE.sub(
                lambda match: expanded.get(
                    match.group(1) or match.group(2), match.group(0)
                ),
                value,
            )
            if next_value != value:
                expanded[name] = next_value
                changed = True
        if not changed:
            break
    return expanded


def parse_ts_const_object(text: str, object_name: str) -> dict[str, str]:
    object_re = re.compile(
        rf"const\s+{re.escape(object_name)}\s*=\s*\{{(?P<body>.*?)^\}}\s+as\s+const",
        re.MULTILINE | re.DOTALL,
    )
    match = object_re.search(text)
    if match is None:
        return {}

    fields: dict[str, str] = {}
    for field_match in TS_FIELD_RE.finditer(match.group("body")):
        string_value = field_match.group(2)
        numeric_value = field_match.group(3)
        if string_value is not None:
            fields[field_match.group(1)] = string_value
        elif numeric_value is not None:
            fields[field_match.group(1)] = numeric_value.replace("_", "")
    return fields


def audit_repository(
    repo_root: Path,
    artifacts: tuple[ArtifactAudit, ...] = LOCAL_MACOS_VOICE_ARTIFACTS,
) -> list[str]:
    findings: list[str] = []
    for artifact in artifacts:
        findings.extend(audit_artifact(repo_root, artifact))
    return findings


def audit_artifact(repo_root: Path, artifact: ArtifactAudit) -> list[str]:
    owner_path = repo_root / artifact.owner_file
    if not owner_path.is_file():
        return [f"{artifact.owner_file}: missing owner file for {artifact.artifact_id}"]

    text = owner_path.read_text(encoding="utf-8")
    findings = metadata_findings(artifact, text)
    fields = artifact_fields(artifact, text)
    for field in artifact.fields:
        value = fields.get(field.name)
        if value is None or value == "":
            findings.append(
                f"{artifact.owner_file}: missing {field.label} field {field.name}"
            )
            continue
        findings.extend(
            f"{artifact.owner_file}: {field.label} field {field.name} {message}"
            for message in validator_findings(field.validator, value)
        )
    return findings


def metadata_findings(artifact: ArtifactAudit, text: str) -> list[str]:
    metadata = parse_artifact_metadata(text)
    findings: list[str] = []
    declared_artifact = metadata.get("artifact")
    if declared_artifact != artifact.artifact_id:
        findings.append(
            f"{artifact.owner_file}: expected setta-supply-chain-artifact "
            f"{artifact.artifact_id}, found {declared_artifact or '<missing>'}"
        )

    declared_owner = metadata.get("owner-file")
    if declared_owner != artifact.owner_file:
        findings.append(
            f"{artifact.owner_file}: expected setta-supply-chain-owner-file "
            f"{artifact.owner_file}, found {declared_owner or '<missing>'}"
        )
    return findings


def artifact_fields(artifact: ArtifactAudit, text: str) -> dict[str, str]:
    if artifact.kind == "bash":
        return parse_bash_assignments(text)
    if artifact.kind == "ts_object" and artifact.object_name is not None:
        return parse_ts_const_object(text, artifact.object_name)
    raise ValueError(f"unsupported artifact declaration kind: {artifact.kind}")


def validator_findings(validator: str, value: str) -> list[str]:
    if validator == "identity":
        return identity_findings(value)
    if validator == "positive_int":
        return positive_int_findings(value)
    if validator == "release":
        return release_findings(value)
    if validator == "sha256":
        return sha256_findings(value)
    if validator == "url":
        return url_findings(value)
    raise ValueError(f"unsupported artifact validator: {validator}")


def identity_findings(value: str) -> list[str]:
    if BASH_VARIABLE_RE.search(value) or "$(" in value:
        return [f"must be fully resolved, found {value}"]
    if value in {"main", "master", "latest"}:
        return [f"must not use floating identity {value}"]
    return []


def positive_int_findings(value: str) -> list[str]:
    if not value.isdigit():
        return [f"must be a positive integer, found {value}"]
    if int(value) <= 0:
        return [f"must be greater than zero, found {value}"]
    return []


def release_findings(value: str) -> list[str]:
    if not PINNED_RELEASE_RE.fullmatch(value):
        return [f"must be a pinned release tag, found {value}"]
    return []


def sha256_findings(value: str) -> list[str]:
    if not SHA256_RE.fullmatch(value):
        return [f"must be 64 lowercase hex characters, found {value}"]
    return []


def url_findings(value: str) -> list[str]:
    findings = identity_findings(value)
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc == "":
        findings.append(f"must be an absolute HTTPS URL, found {value}")
    floating_path_parts = {"main", "master", "latest"}
    path_parts = {part.lower() for part in parsed.path.split("/") if part}
    floating_parts = sorted(path_parts & floating_path_parts)
    if floating_parts:
        findings.append(f"must not use floating path component {floating_parts[0]}")
    return findings


def main() -> int:
    args = parse_args()
    findings = audit_repository(args.repo_root.resolve())
    if findings:
        print("External artifact declaration check failed.", file=sys.stderr)
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        return 1
    print("External artifact declaration check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
