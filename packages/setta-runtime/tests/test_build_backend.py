from __future__ import annotations

import base64
import hashlib
import os
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

import setta_build_backend as backend
from platform_contract import required_platform_tag
from scripts._stage_setta_wheel import StageInputs, stage
from setta.runtime import RuntimeTarget, current_target


class SettaBuildBackendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.target = current_target()
        self.native = self.root / (
            "python-canvas.exe" if self.target.os == "windows" else "python-canvas"
        )
        self.native.write_bytes(_native_binary(self.target))
        self.native.chmod(0o755)
        self.web = self.root / "web"
        self.web.mkdir()
        (self.web / "index.html").write_text("<!doctype html>", encoding="utf-8")

    def _runtime_root(self) -> Path:
        return stage(
            StageInputs(
                native_server=self.native,
                web_root=self.web,
                output=self.root / "stage",
                target=self.target,
                wheel_platform_tag=required_platform_tag(
                    self.target.os, self.target.arch
                ),
            )
        )

    def test_wheel_has_platform_tag_metadata_entry_point_and_complete_record(
        self,
    ) -> None:
        runtime_root = self._runtime_root()
        wheel_directory = self.root / "wheels"
        config_settings = {
            "setta-platform-tag": required_platform_tag(
                self.target.os, self.target.arch
            )
        }
        with mock.patch.object(backend, "_stage_root", return_value=runtime_root):
            wheel_name = backend.build_wheel(str(wheel_directory), config_settings)
            metadata_name = backend.prepare_metadata_for_build_wheel(
                str(self.root / "metadata"), config_settings
            )
        self.assertIn("-py3-none-", wheel_name)
        self.assertNotIn("-any.whl", wheel_name)
        self.assertEqual(
            wheel_name,
            "setta-0.1.0-py3-none-"
            f"{required_platform_tag(self.target.os, self.target.arch)}.whl",
        )
        self.assertEqual(metadata_name, "setta-0.1.0.dist-info")
        wheel_path = wheel_directory / wheel_name
        self.assertEqual(stat.S_IMODE(wheel_path.stat().st_mode), 0o644)
        with zipfile.ZipFile(wheel_path) as archive:
            names = set(archive.namelist())
            dist_info = "setta-0.1.0.dist-info"
            metadata = archive.read(f"{dist_info}/METADATA").decode("utf-8")
            wheel = archive.read(f"{dist_info}/WHEEL").decode("utf-8")
            entry_points = archive.read(f"{dist_info}/entry_points.txt").decode("utf-8")
            record = archive.read(f"{dist_info}/RECORD").decode("utf-8")
            self.assertIn("Requires-Dist: basedpyright==1.39.9", metadata)
            self.assertIn("Requires-Dist: nodejs-wheel-binaries==24.16.0", metadata)
            self.assertIn("Root-Is-Purelib: false", wheel)
            platform_tag = wheel_name.removesuffix(".whl").split("-py3-none-", 1)[1]
            self.assertIn(
                f"Tag: py3-none-{platform_tag}",
                wheel,
            )
            self.assertIn("setta = setta.cli:main", entry_points)
            self.assertIn("setta/_guardian.py", names)
            self.assertIn("setta/_runtime/manifest.json", names)
            notice_path = f"{dist_info}/licenses/conpty-MIT.txt"
            self.assertIn(notice_path, names)
            self.assertIn(
                "Copyright (c) 2020 UserExistsError",
                archive.read(notice_path).decode("utf-8"),
            )
            self._assert_complete_record(archive, record, names)
            extract_root = self.root / "installed-wheel"
            archive.extractall(extract_root)
        completed = subprocess.run(
            [
                sys.executable,
                "-c",
                "from setta.cli import main; raise SystemExit(main(['--version']))",
            ],
            check=False,
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONPATH": str(extract_root)},
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout, "0.1.0\n")
        self.assertTrue((self.root / "metadata" / metadata_name / "METADATA").is_file())
        self.assertTrue(
            (
                self.root / "metadata" / metadata_name / "licenses" / "conpty-MIT.txt"
            ).is_file()
        )

    def test_backend_rejects_unmanifested_runtime_content(self) -> None:
        runtime_root = self._runtime_root()
        (runtime_root / "unmanifested.js").write_text("unexpected", encoding="utf-8")
        with (
            mock.patch.object(backend, "_stage_root", return_value=runtime_root),
            self.assertRaises(backend.BuildBackendError),
        ):
            backend.build_wheel(
                str(self.root / "wheels"),
                {
                    "setta-platform-tag": required_platform_tag(
                        self.target.os, self.target.arch
                    )
                },
            )

    def test_backend_requires_manylinux_config_and_rejects_generic_linux_tags(
        self,
    ) -> None:
        target = RuntimeTarget(os="linux", arch="amd64")
        native = self.root / "linux-server"
        native.write_bytes(_native_binary(target))
        native.chmod(0o755)
        runtime_root = stage(
            StageInputs(
                native_server=native,
                web_root=self.web,
                output=self.root / "linux-stage",
                target=target,
                wheel_platform_tag="manylinux_2_28_x86_64",
            )
        )
        from setta import runtime

        with (
            mock.patch.object(runtime, "current_target", return_value=target),
            mock.patch.object(backend, "_stage_root", return_value=runtime_root),
        ):
            with self.assertRaisesRegex(
                backend.BuildBackendError, "requires an explicit"
            ):
                backend.build_wheel(str(self.root / "missing-config"))
            with self.assertRaisesRegex(
                backend.BuildBackendError, "must use wheel platform tag"
            ):
                backend.build_wheel(
                    str(self.root / "generic-config"),
                    {"setta-platform-tag": "linux_x86_64"},
                )
            wheel_name = backend.build_wheel(
                str(self.root / "list-config"),
                {"setta-platform-tag": ["manylinux_2_28_x86_64"]},
            )
        self.assertEqual(wheel_name, "setta-0.1.0-py3-none-manylinux_2_28_x86_64.whl")

    def test_backend_rejects_duplicate_platform_config_values(self) -> None:
        with self.assertRaisesRegex(backend.BuildBackendError, "one string value"):
            backend._platform_tag_from_config(
                {
                    "setta-platform-tag": [
                        "manylinux_2_28_x86_64",
                        "manylinux_2_28_x86_64",
                    ]
                }
            )

    def _assert_complete_record(
        self, archive: zipfile.ZipFile, record: str, names: set[str]
    ) -> None:
        records = {
            path: (digest, int(size) if size else None)
            for path, digest, size in (
                line.split(",", 2) for line in record.splitlines()
            )
        }
        self.assertEqual(set(records), names)
        record_path = next(path for path in names if path.endswith(".dist-info/RECORD"))
        self.assertEqual(records[record_path], ("", None))
        for path in names - {record_path}:
            digest, size = records[path]
            content = archive.read(path)
            expected = (
                base64.urlsafe_b64encode(hashlib.sha256(content).digest())
                .decode("ascii")
                .rstrip("=")
            )
            self.assertEqual(digest, f"sha256={expected}")
            self.assertEqual(size, len(content))


def _native_binary(
    target: RuntimeTarget, *, macos_minimum: tuple[int, int, int] = (13, 0, 0)
) -> bytes:
    if target.os == "linux":
        header = bytearray(120)
        header[:7] = b"\x7fELF\x02\x01\x01"
        struct.pack_into("<H", header, 16, 2)
        struct.pack_into("<H", header, 18, {"amd64": 62, "arm64": 183}[target.arch])
        struct.pack_into("<I", header, 20, 1)
        struct.pack_into("<Q", header, 32, 64)
        struct.pack_into("<H", header, 52, 64)
        struct.pack_into("<H", header, 54, 56)
        struct.pack_into("<H", header, 56, 1)
        struct.pack_into("<I", header, 64, 1)
        return bytes(header) + b"private server"
    if target.os == "darwin":
        cpu_type = {"amd64": 0x01000007, "arm64": 0x0100000C}[target.arch]
        header = bytearray(56)
        header[:4] = b"\xcf\xfa\xed\xfe"
        struct.pack_into("<I", header, 4, cpu_type)
        struct.pack_into("<I", header, 16, 1)
        struct.pack_into("<I", header, 20, 24)
        struct.pack_into("<I", header, 32, 0x32)
        struct.pack_into("<I", header, 36, 24)
        struct.pack_into("<I", header, 40, 1)
        encoded = macos_minimum[0] << 16 | macos_minimum[1] << 8 | macos_minimum[2]
        struct.pack_into("<I", header, 44, encoded)
        return bytes(header) + b"private server"
    header = bytearray(0x80)
    header[:2] = b"MZ"
    struct.pack_into("<I", header, 0x3C, 0x40)
    header[0x40:0x44] = b"PE\x00\x00"
    struct.pack_into(
        "<H", header, 0x44, {"amd64": 0x8664, "arm64": 0xAA64}[target.arch]
    )
    return bytes(header) + b"private server"
