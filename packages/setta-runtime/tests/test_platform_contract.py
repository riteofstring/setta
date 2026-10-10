from __future__ import annotations

import struct
import tempfile
import unittest
from pathlib import Path

from platform_contract import (
    PlatformContractError,
    native_build_environment,
    release_platform_tag,
    required_platform_tag,
    validate_native_binary,
)


class PlatformContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.binary = Path(self.temporary.name) / "native-server"

    def test_macos_tag_and_native_build_environment_have_one_13_0_floor(self) -> None:
        self.assertEqual(release_platform_tag("darwin", "arm64"), "macosx_13_0_arm64")
        environment = native_build_environment({"CGO_CFLAGS": "-O2"}, "darwin")
        self.assertEqual(environment["MACOSX_DEPLOYMENT_TARGET"], "13.0")
        self.assertEqual(environment["CGO_CFLAGS"], "-O2 -mmacosx-version-min=13.0")
        self.assertEqual(environment["CGO_LDFLAGS"], "-mmacosx-version-min=13.0")

    def test_macos_accepts_build_version_and_legacy_deployment_commands(self) -> None:
        for legacy in (False, True):
            self.binary.write_bytes(_mach_binary("arm64", (13, 0, 0), legacy=legacy))
            validate_native_binary(
                self.binary,
                operating_system="darwin",
                architecture="arm64",
                platform_tag="macosx_13_0_arm64",
            )

    def test_macos_rejects_a_higher_or_malformed_deployment_command(self) -> None:
        self.binary.write_bytes(_mach_binary("arm64", (13, 1, 0)))
        with self.assertRaisesRegex(PlatformContractError, "above wheel claim"):
            validate_native_binary(
                self.binary,
                operating_system="darwin",
                architecture="arm64",
                platform_tag="macosx_13_0_arm64",
            )
        self.binary.write_bytes(_mach_binary("arm64", (13, 0, 0), command_size=8))
        with self.assertRaisesRegex(
            PlatformContractError, "malformed LC_BUILD_VERSION"
        ):
            validate_native_binary(
                self.binary,
                operating_system="darwin",
                architecture="arm64",
                platform_tag="macosx_13_0_arm64",
            )
        self.binary.write_bytes(_mach_binary("arm64", (13, 0, 0))[:36])
        with self.assertRaisesRegex(
            PlatformContractError, "truncated Mach-O load commands"
        ):
            validate_native_binary(
                self.binary,
                operating_system="darwin",
                architecture="arm64",
                platform_tag="macosx_13_0_arm64",
            )

    def test_linux_requires_exact_manylinux_tag_and_checks_every_glibc_requirement(
        self,
    ) -> None:
        expected = "manylinux_2_28_x86_64"
        with self.assertRaisesRegex(PlatformContractError, "require an explicit"):
            release_platform_tag("linux", "amd64")
        with self.assertRaisesRegex(
            PlatformContractError, "must use wheel platform tag"
        ):
            release_platform_tag("linux", "amd64", "linux_aarch64")
        self.assertEqual(release_platform_tag("linux", "amd64", expected), expected)
        self.binary.write_bytes(_dynamic_elf(("GLIBC_2.28",)))
        validate_native_binary(
            self.binary,
            operating_system="linux",
            architecture="amd64",
            platform_tag=expected,
        )
        self.binary.write_bytes(_dynamic_elf(("GLIBC_2.28", "GLIBC_2.28.1")))
        with self.assertRaisesRegex(PlatformContractError, "GLIBC 2.28.1"):
            validate_native_binary(
                self.binary,
                operating_system="linux",
                architecture="amd64",
                platform_tag=expected,
            )

    def test_linux_rejects_malformed_glibc_tokens(self) -> None:
        self.binary.write_bytes(_dynamic_elf(("GLIBC_2.28", "GLIBC_two.28")))
        with self.assertRaisesRegex(PlatformContractError, "malformed GLIBC"):
            validate_native_binary(
                self.binary,
                operating_system="linux",
                architecture="amd64",
                platform_tag="manylinux_2_28_x86_64",
            )

    def test_local_linux_wheel_accepts_host_glibc_without_a_manylinux_claim(
        self,
    ) -> None:
        self.binary.write_bytes(_dynamic_elf(("GLIBC_2.39",)))
        validate_native_binary(
            self.binary,
            operating_system="linux",
            architecture="amd64",
            platform_tag="linux_x86_64",
        )
        with self.assertRaisesRegex(PlatformContractError, "GLIBC 2.39"):
            validate_native_binary(
                self.binary,
                operating_system="linux",
                architecture="amd64",
                platform_tag="manylinux_2_28_x86_64",
            )

    def test_windows_keeps_the_standard_amd64_tag(self) -> None:
        self.assertEqual(required_platform_tag("windows", "amd64"), "win_amd64")
        self.assertEqual(release_platform_tag("windows", "amd64"), "win_amd64")

    def test_release_contract_has_exactly_five_publishable_targets(self) -> None:
        expected = {
            ("darwin", "amd64"): "macosx_13_0_x86_64",
            ("darwin", "arm64"): "macosx_13_0_arm64",
            ("linux", "amd64"): "manylinux_2_28_x86_64",
            ("linux", "arm64"): "manylinux_2_28_aarch64",
            ("windows", "amd64"): "win_amd64",
        }
        self.assertEqual(
            {target: required_platform_tag(*target) for target in expected},
            expected,
        )

    def test_windows_arm64_is_not_a_publishable_release_target(self) -> None:
        with self.assertRaisesRegex(
            PlatformContractError,
            "unsupported Setta release target: windows-arm64",
        ):
            required_platform_tag("windows", "arm64")
        with self.assertRaisesRegex(
            PlatformContractError,
            "supported release targets are .*windows-amd64",
        ):
            release_platform_tag("windows", "arm64", "win_arm64")


def _mach_binary(
    architecture: str,
    minimum: tuple[int, int, int],
    *,
    legacy: bool = False,
    command_size: int | None = None,
) -> bytes:
    command = 0x24 if legacy else 0x32
    size = command_size if command_size is not None else (16 if legacy else 24)
    header = bytearray(max(32 + size, 56 if not legacy else 48))
    header[:4] = b"\xcf\xfa\xed\xfe"
    struct.pack_into(
        "<I", header, 4, {"amd64": 0x01000007, "arm64": 0x0100000C}[architecture]
    )
    struct.pack_into("<I", header, 16, 1)
    struct.pack_into("<I", header, 20, size)
    struct.pack_into("<I", header, 32, command)
    struct.pack_into("<I", header, 36, size)
    encoded = minimum[0] << 16 | minimum[1] << 8 | minimum[2]
    if legacy:
        struct.pack_into("<I", header, 40, encoded)
    else:
        struct.pack_into("<I", header, 40, 1)
        struct.pack_into("<I", header, 44, encoded)
    return bytes(header)


def _dynamic_elf(glibc_versions: tuple[str, ...]) -> bytes:
    version_offset = 160
    version_size = 16 + 16 * len(glibc_versions)
    string_offset = version_offset + version_size
    strings = b"\x00" + b"".join(
        name.encode("ascii") + b"\x00" for name in glibc_versions
    )
    section_offset = 320
    document = bytearray(section_offset + 3 * 64)
    document[:7] = b"\x7fELF\x02\x01\x01"
    struct.pack_into("<H", document, 16, 2)
    struct.pack_into("<H", document, 18, 62)
    struct.pack_into("<I", document, 20, 1)
    struct.pack_into("<Q", document, 32, 64)
    struct.pack_into("<Q", document, 40, section_offset)
    struct.pack_into("<H", document, 52, 64)
    struct.pack_into("<H", document, 54, 56)
    struct.pack_into("<H", document, 56, 1)
    struct.pack_into("<H", document, 58, 64)
    struct.pack_into("<H", document, 60, 3)
    struct.pack_into("<I", document, 64, 3)
    struct.pack_into(
        "<HHIII", document, version_offset, 1, len(glibc_versions), 0, 16, 0
    )
    name_offset = 1
    for index, name in enumerate(glibc_versions):
        auxiliary_offset = version_offset + 16 + index * 16
        following = 16 if index + 1 < len(glibc_versions) else 0
        struct.pack_into(
            "<IHHII", document, auxiliary_offset, 0, 0, 0, name_offset, following
        )
        name_offset += len(name) + 1
    document[string_offset : string_offset + len(strings)] = strings
    version_section = section_offset + 64
    struct.pack_into("<I", document, version_section + 4, 0x6FFFFFFE)
    struct.pack_into("<Q", document, version_section + 24, version_offset)
    struct.pack_into("<Q", document, version_section + 32, version_size)
    struct.pack_into("<I", document, version_section + 40, 2)
    string_section = section_offset + 128
    struct.pack_into("<I", document, string_section + 4, 3)
    struct.pack_into("<Q", document, string_section + 24, string_offset)
    struct.pack_into("<Q", document, string_section + 32, len(strings))
    return bytes(document)
