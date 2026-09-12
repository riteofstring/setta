from __future__ import annotations

import json
import os
import struct
import tempfile
import unittest
from pathlib import Path

from platform_contract import required_platform_tag
from scripts._stage_setta_wheel import (
    StageAppInputs,
    StageError,
    StageInputs,
    parse_target,
    stage,
)
from setta.runtime import (
    PackagedRuntime,
    RuntimeTarget,
    _canonical_json_bytes,
    current_target,
)


class WheelStagingTests(unittest.TestCase):
    def test_windows_arm64_target_is_rejected_before_staging(self) -> None:
        with self.assertRaisesRegex(
            StageError,
            "unsupported Setta release target: windows-arm64",
        ):
            parse_target("windows-arm64")

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
        self.bench_native = self.root / (
            "bench.exe" if self.target.os == "windows" else "bench"
        )
        self.bench_native.write_bytes(_native_binary(self.target))
        self.bench_native.chmod(0o755)
        self.realtime_native = self.root / (
            "realtime.exe" if self.target.os == "windows" else "realtime"
        )
        self.realtime_native.write_bytes(_native_binary(self.target))
        self.realtime_native.chmod(0o755)
        self.web = self.root / "web"
        (self.web / "assets").mkdir(parents=True)
        (self.web / "index.html").write_text("<!doctype html>", encoding="utf-8")
        (self.web / "assets" / "app.js").write_text(
            "console.log('setta')", encoding="utf-8"
        )
        self.bench_web = self.root / "bench-web"
        (self.bench_web / "assets").mkdir(parents=True)
        (self.bench_web / "index.html").write_text("<!doctype html>", encoding="utf-8")
        (self.bench_web / "assets" / "app.js").write_text(
            "console.log('bench')", encoding="utf-8"
        )
        self.realtime_web = self.root / "realtime-web"
        (self.realtime_web / "assets").mkdir(parents=True)
        (self.realtime_web / "index.html").write_text(
            "<!doctype html>", encoding="utf-8"
        )
        (self.realtime_web / "assets" / "app.js").write_text(
            "console.log('realtime')", encoding="utf-8"
        )

    def _inputs(self, output: Path) -> StageInputs:
        return StageInputs(
            apps=(
                StageAppInputs("bench", self.bench_native, self.bench_web),
                StageAppInputs("realtime", self.realtime_native, self.realtime_web),
                StageAppInputs("python-canvas", self.native, self.web),
            ),
            output=output,
            target=self.target,
            wheel_platform_tag=required_platform_tag(self.target.os, self.target.arch),
        )

    def test_stages_a_closed_canonical_runtime_tree(self) -> None:
        runtime_root = stage(self._inputs(self.root / "stage"))
        manifest = PackagedRuntime(runtime_root, expected_target=self.target).manifest()
        self.assertEqual(manifest.target, self.target)
        manifest_bytes = (runtime_root / "manifest.json").read_bytes()
        self.assertEqual(
            manifest_bytes, _canonical_json_bytes(json.loads(manifest_bytes))
        )
        self.assertEqual(
            sorted(manifest.assets),
            [
                "bench/web/assets/app.js",
                "bench/web/index.html",
                "bin/bench.exe" if self.target.os == "windows" else "bin/bench",
                "bin/python-canvas.exe"
                if self.target.os == "windows"
                else "bin/python-canvas",
                "bin/realtime.exe" if self.target.os == "windows" else "bin/realtime",
                "python-canvas/web/assets/app.js",
                "python-canvas/web/index.html",
                "realtime/web/assets/app.js",
                "realtime/web/index.html",
            ],
        )
        self.assertEqual(tuple(manifest.apps), ("bench", "python-canvas", "realtime"))

    def test_staging_is_deterministic_for_identical_inputs(self) -> None:
        first = stage(self._inputs(self.root / "stage-one"))
        second = stage(self._inputs(self.root / "stage-two"))
        self.assertEqual(_tree_bytes(first), _tree_bytes(second))

    def test_rejects_duplicate_app_ids_before_creating_output(self) -> None:
        output = self.root / "duplicate-stage"
        inputs = self._inputs(output)
        duplicate = StageInputs(
            apps=(inputs.apps[0], inputs.apps[0]),
            output=output,
            target=inputs.target,
            wheel_platform_tag=inputs.wheel_platform_tag,
        )
        with self.assertRaisesRegex(StageError, "invalid or duplicated"):
            stage(duplicate)
        self.assertFalse(output.exists())

    def test_rejects_a_web_symlink_before_it_can_enter_the_runtime(self) -> None:
        link = self.web / "assets" / "linked.js"
        try:
            os.symlink(self.web / "assets" / "app.js", link)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with self.assertRaises(StageError):
            stage(self._inputs(self.root / "stage"))

    def test_rejects_native_binary_for_the_wrong_operating_system(self) -> None:
        wrong_operating_system = next(
            value for value in ("darwin", "linux", "windows") if value != self.target.os
        )
        self.native.write_bytes(
            _native_binary(
                RuntimeTarget(os=wrong_operating_system, arch=self.target.arch)
            )
        )
        with self.assertRaises(StageError):
            stage(self._inputs(self.root / "stage"))

    def test_rejects_native_binary_for_the_wrong_architecture(self) -> None:
        wrong_architecture = "arm64" if self.target.arch == "amd64" else "amd64"
        self.native.write_bytes(
            _native_binary(RuntimeTarget(os=self.target.os, arch=wrong_architecture))
        )
        with self.assertRaises(StageError):
            stage(self._inputs(self.root / "stage"))

    def test_rejects_truncated_or_fat_native_headers(self) -> None:
        self.native.write_bytes(b"\xca\xfe\xba\xbe")
        with self.assertRaises(StageError):
            stage(self._inputs(self.root / "fat-stage"))
        self.native.write_bytes(b"MZ")
        with self.assertRaises(StageError):
            stage(self._inputs(self.root / "truncated-stage"))


def _tree_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


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
