#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

from check_external_artifact_declarations import (
    audit_repository,
    parse_bash_assignments,
    parse_ts_const_object,
)


VALID_BASH_DECLARATION = """#!/usr/bin/env bash
# setta-supply-chain-artifact: local-macos-voice.whisper-xcframework
# setta-supply-chain-owner-file: scripts/build_local_macos_voice_helper.sh
whisper_release_version="v1.9.1"
whisper_xcframework_filename="whisper-${whisper_release_version}-xcframework.zip"
whisper_xcframework_url="https://github.com/ggml-org/whisper.cpp/releases/download/${whisper_release_version}/${whisper_xcframework_filename}"
whisper_xcframework_sha256="8c3ecbe73f48b0cb9318fc3058264f951ab336fd530e82c4ccdd2298d1311a4c"
whisper_xcframework_bytes=50438515
"""

VALID_TS_DECLARATION = """// setta-supply-chain-artifact: local-macos-voice.default-whisper-model
// setta-supply-chain-owner-file: desktop/src/main/local-macos-voice-model-download.ts
const defaultLocalMacOSVoiceModelDownloadSpec = {
  bytes: 147_964_211,
  filename: "ggml-base.en.bin",
  name: "base.en",
  sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en.bin",
} as const satisfies LocalMacOSVoiceModelDownloadSpec;
"""


class ExternalArtifactDeclarationTests(unittest.TestCase):
    def test_parses_bash_assignments_and_expands_artifact_url(self) -> None:
        values = parse_bash_assignments(VALID_BASH_DECLARATION)

        self.assertEqual(values["whisper_release_version"], "v1.9.1")
        self.assertEqual(
            values["whisper_xcframework_url"],
            "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-v1.9.1-xcframework.zip",
        )

    def test_parses_bash_assignments_and_expands_bare_variable_references(self) -> None:
        declaration = VALID_BASH_DECLARATION.replace(
            "${whisper_release_version}", "$whisper_release_version"
        ).replace("${whisper_xcframework_filename}", "$whisper_xcframework_filename")

        values = parse_bash_assignments(declaration)

        self.assertEqual(
            values["whisper_xcframework_url"],
            "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-v1.9.1-xcframework.zip",
        )

    def test_parses_typescript_const_object_fields(self) -> None:
        fields = parse_ts_const_object(
            VALID_TS_DECLARATION, "defaultLocalMacOSVoiceModelDownloadSpec"
        )

        self.assertEqual(fields["bytes"], "147964211")
        self.assertEqual(fields["filename"], "ggml-base.en.bin")
        self.assertEqual(
            fields["sha256"],
            "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
        )

    def test_accepts_valid_local_voice_artifact_declarations(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-artifact-audit-") as raw_root:
            root = Path(raw_root)
            write_artifact_files(root, VALID_BASH_DECLARATION, VALID_TS_DECLARATION)

            self.assertEqual(audit_repository(root), [])

    def test_rejects_missing_xcframework_hash(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-artifact-audit-") as raw_root:
            root = Path(raw_root)
            write_artifact_files(
                root,
                VALID_BASH_DECLARATION.replace(
                    "whisper_xcframework_sha256", "whisper_xcframework_digest"
                ),
                VALID_TS_DECLARATION,
            )

            findings = audit_repository(root)

        self.assertTrue(
            any(
                "missing expected SHA-256 field whisper_xcframework_sha256" in finding
                for finding in findings
            ),
            findings,
        )

    def test_rejects_unresolved_bare_bash_variable(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-artifact-audit-") as raw_root:
            root = Path(raw_root)
            write_artifact_files(
                root,
                VALID_BASH_DECLARATION.replace(
                    "${whisper_xcframework_filename}", "$missing_xcframework_filename"
                ),
                VALID_TS_DECLARATION,
            )

            findings = audit_repository(root)

        self.assertTrue(
            any("must be fully resolved" in finding for finding in findings),
            findings,
        )

    def test_rejects_floating_model_source_url(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-artifact-audit-") as raw_root:
            root = Path(raw_root)
            write_artifact_files(
                root,
                VALID_BASH_DECLARATION,
                VALID_TS_DECLARATION.replace(
                    "/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/",
                    "/resolve/main/",
                ),
            )

            findings = audit_repository(root)

        self.assertTrue(
            any(
                "must not use floating path component main" in finding
                for finding in findings
            ),
            findings,
        )

    def test_rejects_missing_owner_metadata(self) -> None:
        with tempfile.TemporaryDirectory(prefix="setta-artifact-audit-") as raw_root:
            root = Path(raw_root)
            write_artifact_files(
                root,
                VALID_BASH_DECLARATION.replace(
                    "# setta-supply-chain-owner-file: scripts/build_local_macos_voice_helper.sh\n",
                    "",
                ),
                VALID_TS_DECLARATION,
            )

            findings = audit_repository(root)

        self.assertTrue(
            any(
                "expected setta-supply-chain-owner-file" in finding
                for finding in findings
            ),
            findings,
        )


def write_artifact_files(root: Path, bash_text: str, ts_text: str) -> None:
    build_script = root / "scripts" / "build_local_macos_voice_helper.sh"
    model_download = root / "desktop" / "src" / "main" / "local-macos-voice-model-download.ts"
    build_script.parent.mkdir(parents=True)
    model_download.parent.mkdir(parents=True)
    build_script.write_text(bash_text, encoding="utf-8")
    model_download.write_text(ts_text, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
