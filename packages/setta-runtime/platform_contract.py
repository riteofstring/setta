"""One authoritative compatibility contract for Setta platform wheels.

The build runner selects a platform tag explicitly.  This module validates that
selection against the staged native executable, rather than inferring a tag
from the host Python version or operating-system release.
"""

from __future__ import annotations

import re
import struct
from collections.abc import Mapping
from pathlib import Path

MACOS_DEPLOYMENT_TARGET = "13.0"
_MACOS_VERSION = (13, 0, 0)
_ELF_MACHINE = {"amd64": 62, "arm64": 183}
_MACH_CPU_TYPE = {"amd64": 0x01000007, "arm64": 0x0100000C}
_PE_MACHINE = {"amd64": 0x8664}
_LINUX_GLIBC_FLOOR = (2, 28, 0)
_LC_BUILD_VERSION = 0x32
_LC_VERSION_MIN_MACOSX = 0x24
_PLATFORM_MACOS = 1
_SHT_GNU_VERNEED = 0x6FFFFFFE
_SHT_STRTAB = 3
_PT_INTERP = 3
_GLIBC_VERSION = re.compile(r"^GLIBC_(\d+)\.(\d+)(?:\.(\d+))?$")
_RELEASE_PLATFORM_TAGS = {
    ("darwin", "amd64"): "macosx_13_0_x86_64",
    ("darwin", "arm64"): "macosx_13_0_arm64",
    ("linux", "amd64"): "manylinux_2_28_x86_64",
    ("linux", "arm64"): "manylinux_2_28_aarch64",
    ("windows", "amd64"): "win_amd64",
}


class PlatformContractError(ValueError):
    """A native artifact cannot truthfully support its requested wheel tag."""


def required_platform_tag(operating_system: str, architecture: str) -> str:
    """Return the one supported release tag for a target architecture."""

    try:
        return _RELEASE_PLATFORM_TAGS[(operating_system, architecture)]
    except KeyError as error:
        supported = ", ".join(
            f"{os_name}-{arch}" for os_name, arch in sorted(_RELEASE_PLATFORM_TAGS)
        )
        raise PlatformContractError(
            f"unsupported Setta release target: {operating_system}-{architecture}; "
            f"supported release targets are {supported}"
        ) from error


def release_platform_tag(
    operating_system: str,
    architecture: str,
    requested_tag: str | None = None,
) -> str:
    """Validate the release tag selection without consulting host platform data."""

    expected = required_platform_tag(operating_system, architecture)
    if operating_system == "linux" and requested_tag is None:
        raise PlatformContractError(
            "Linux publication requires an explicit --wheel-platform-tag "
            f"{expected} from its matching manylinux_2_28 build container."
        )
    if requested_tag is not None and requested_tag != expected:
        raise PlatformContractError(
            f"{operating_system}-{architecture} must use wheel platform tag {expected}, "
            f"not {requested_tag}."
        )
    return expected


def native_build_environment(
    inherited: Mapping[str, str], operating_system: str
) -> dict[str, str]:
    """Return the exact compiler environment required for a native target."""

    environment = dict(inherited)
    if operating_system == "darwin":
        environment["MACOSX_DEPLOYMENT_TARGET"] = MACOS_DEPLOYMENT_TARGET
        compiler_flag = f"-mmacosx-version-min={MACOS_DEPLOYMENT_TARGET}"
        environment["CGO_CFLAGS"] = _append_compiler_flag(
            environment.get("CGO_CFLAGS"), compiler_flag
        )
        environment["CGO_LDFLAGS"] = _append_compiler_flag(
            environment.get("CGO_LDFLAGS"), compiler_flag
        )
    return environment


def validate_native_binary(
    path: Path,
    *,
    operating_system: str,
    architecture: str,
    platform_tag: str,
) -> None:
    """Prove the executable is compatible with its exact wheel contract."""

    release_platform_tag(operating_system, architecture, platform_tag)
    try:
        content = path.read_bytes()
    except OSError as error:
        raise PlatformContractError(f"cannot read native server: {path}") from error
    if operating_system == "darwin":
        minimum = _mach_o_minimum_macos(content, architecture)
        if minimum > _MACOS_VERSION:
            actual = _format_version(minimum)
            raise PlatformContractError(
                "native server requires macOS "
                f"{actual}, above wheel claim macOS {MACOS_DEPLOYMENT_TARGET}"
            )
        return
    if operating_system == "linux":
        _validate_elf_machine(content, architecture)
        _validate_manylinux_glibc(content)
        return
    if operating_system == "windows":
        _validate_pe_machine(content, architecture)
        return
    raise PlatformContractError(
        f"unsupported wheel operating system: {operating_system}"
    )


def _append_compiler_flag(existing: str | None, flag: str) -> str:
    if existing is None or not existing.strip():
        return flag
    if flag in existing.split():
        return existing
    return f"{existing} {flag}"


def _mach_o_minimum_macos(content: bytes, architecture: str) -> tuple[int, int, int]:
    _require(
        content[:4] == b"\xcf\xfa\xed\xfe",
        "native server is not a thin Mach-O executable",
    )
    _require(len(content) >= 32, "native server has a truncated Mach-O header")
    cpu_type = _unpack_from(
        "<I", content, 4, "native server has a truncated Mach-O header"
    )
    _require(
        cpu_type == _MACH_CPU_TYPE[architecture],
        "native server has the wrong Mach-O architecture",
    )
    command_count = _unpack_from(
        "<I", content, 16, "native server has a truncated Mach-O header"
    )
    commands_size = _unpack_from(
        "<I", content, 20, "native server has a truncated Mach-O header"
    )
    _require(command_count <= 4096, "native server has too many Mach-O load commands")
    command_end = 32 + commands_size
    _require(
        command_end <= len(content), "native server has truncated Mach-O load commands"
    )
    versions: list[tuple[int, int, int]] = []
    offset = 32
    for _ in range(command_count):
        _require(
            offset + 8 <= command_end,
            "native server has malformed Mach-O load commands",
        )
        command = _unpack_from(
            "<I", content, offset, "native server has malformed Mach-O load commands"
        )
        command_size = _unpack_from(
            "<I",
            content,
            offset + 4,
            "native server has malformed Mach-O load commands",
        )
        _require(
            command_size >= 8
            and command_size % 8 == 0
            and offset + command_size <= command_end,
            "native server has malformed Mach-O load commands",
        )
        version = _macos_version_load_command(content, offset, command, command_size)
        if version is not None:
            versions.append(version)
        offset += command_size
    _require(
        len(versions) == 1,
        "native server must declare exactly one macOS deployment target",
    )
    return versions[0]


def _macos_version_load_command(
    content: bytes, offset: int, command: int, command_size: int
) -> tuple[int, int, int] | None:
    if command == _LC_BUILD_VERSION:
        _require(command_size >= 24, "native server has malformed LC_BUILD_VERSION")
        platform = _unpack_from(
            "<I", content, offset + 8, "native server has malformed LC_BUILD_VERSION"
        )
        _require(platform == _PLATFORM_MACOS, "native server is not built for macOS")
        raw_version = _unpack_from(
            "<I", content, offset + 12, "native server has malformed LC_BUILD_VERSION"
        )
        return _decode_macos_version(raw_version)
    if command == _LC_VERSION_MIN_MACOSX:
        _require(
            command_size >= 16, "native server has malformed LC_VERSION_MIN_MACOSX"
        )
        raw_version = _unpack_from(
            "<I",
            content,
            offset + 8,
            "native server has malformed LC_VERSION_MIN_MACOSX",
        )
        return _decode_macos_version(raw_version)
    return None


def _decode_macos_version(raw_version: int) -> tuple[int, int, int]:
    version = (
        (raw_version >> 16) & 0xFFFF,
        (raw_version >> 8) & 0xFF,
        raw_version & 0xFF,
    )
    _require(
        version != (0, 0, 0), "native server has an invalid macOS deployment target"
    )
    return version


def _validate_elf_machine(content: bytes, architecture: str) -> None:
    _require(len(content) >= 64, "native server has a truncated ELF header")
    _require(content[:4] == b"\x7fELF", "native server is not an ELF executable")
    _require(
        content[4:7] == b"\x02\x01\x01",
        "native server is not a 64-bit little-endian ELF executable",
    )
    machine = _unpack_from(
        "<H", content, 18, "native server has a truncated ELF header"
    )
    _require(
        machine == _ELF_MACHINE[architecture],
        "native server has the wrong ELF architecture",
    )
    executable_type = _unpack_from(
        "<H", content, 16, "native server has a truncated ELF header"
    )
    _require(
        executable_type in {2, 3},
        "native server is not an ELF executable or shared executable",
    )


def _validate_manylinux_glibc(content: bytes) -> None:
    if not _elf_has_interpreter(content):
        return
    versions = _elf_glibc_requirements(content)
    _require(
        versions, "dynamic Linux native server has no inspectable GLIBC requirements"
    )
    above_floor = [version for version in versions if version > _LINUX_GLIBC_FLOOR]
    if above_floor:
        actual = ", ".join(_format_version(version) for version in sorted(above_floor))
        raise PlatformContractError(
            "native server requires GLIBC "
            f"{actual}, above manylinux_2_28's GLIBC 2.28 contract"
        )


def _elf_has_interpreter(content: bytes) -> bool:
    program_offset = _unpack_from(
        "<Q", content, 32, "native server has a truncated ELF header"
    )
    entry_size = _unpack_from(
        "<H", content, 54, "native server has a truncated ELF header"
    )
    entry_count = _unpack_from(
        "<H", content, 56, "native server has a truncated ELF header"
    )
    _require(
        entry_count <= 4096 and entry_size >= 56,
        "native server has malformed ELF program headers",
    )
    _require(
        program_offset + entry_size * entry_count <= len(content),
        "native server has truncated ELF program headers",
    )
    return any(
        _unpack_from(
            "<I",
            content,
            program_offset + index * entry_size,
            "native server has malformed ELF program headers",
        )
        == _PT_INTERP
        for index in range(entry_count)
    )


def _elf_glibc_requirements(content: bytes) -> set[tuple[int, int, int]]:
    sections = _elf_sections(content)
    versions: set[tuple[int, int, int]] = set()
    for section in sections:
        if section[0] != _SHT_GNU_VERNEED:
            continue
        string_table = _linked_string_table(sections, section[3])
        versions.update(_version_requirements(content, section, string_table))
    return versions


def _elf_sections(content: bytes) -> list[tuple[int, int, int, int]]:
    section_offset = _unpack_from(
        "<Q", content, 40, "native server has a truncated ELF header"
    )
    entry_size = _unpack_from(
        "<H", content, 58, "native server has a truncated ELF header"
    )
    entry_count = _unpack_from(
        "<H", content, 60, "native server has a truncated ELF header"
    )
    _require(
        entry_count <= 16384 and entry_size >= 64,
        "native server has malformed ELF section headers",
    )
    _require(
        section_offset + entry_size * entry_count <= len(content),
        "native server has truncated ELF section headers",
    )
    return [
        (
            _unpack_from(
                "<I",
                content,
                section_offset + index * entry_size + 4,
                "native server has malformed ELF section headers",
            ),
            _unpack_from(
                "<Q",
                content,
                section_offset + index * entry_size + 24,
                "native server has malformed ELF section headers",
            ),
            _unpack_from(
                "<Q",
                content,
                section_offset + index * entry_size + 32,
                "native server has malformed ELF section headers",
            ),
            _unpack_from(
                "<I",
                content,
                section_offset + index * entry_size + 40,
                "native server has malformed ELF section headers",
            ),
        )
        for index in range(entry_count)
    ]


def _linked_string_table(
    sections: list[tuple[int, int, int, int]], link: int
) -> tuple[int, int]:
    _require(link < len(sections), "native server has an invalid ELF string-table link")
    section_type, offset, size, _ = sections[link]
    _require(
        section_type == _SHT_STRTAB, "native server has an invalid ELF string table"
    )
    return offset, size


def _version_requirements(
    content: bytes,
    section: tuple[int, int, int, int],
    string_table: tuple[int, int],
) -> set[tuple[int, int, int]]:
    _, section_offset, section_size, _ = section
    section_end = section_offset + section_size
    _require(
        section_end <= len(content), "native server has a truncated ELF version section"
    )
    versions: set[tuple[int, int, int]] = set()
    offset = section_offset
    while offset < section_end:
        count = _unpack_from(
            "<H",
            content,
            offset + 2,
            "native server has malformed ELF version requirements",
        )
        auxiliary = _unpack_from(
            "<I",
            content,
            offset + 8,
            "native server has malformed ELF version requirements",
        )
        following = _unpack_from(
            "<I",
            content,
            offset + 12,
            "native server has malformed ELF version requirements",
        )
        _require(
            0 < count <= 1024 and auxiliary > 0,
            "native server has malformed ELF version requirements",
        )
        versions.update(
            _version_auxiliaries(
                content, offset, count, auxiliary, section_end, string_table
            )
        )
        if following == 0:
            break
        _require(
            following >= 16, "native server has malformed ELF version requirements"
        )
        offset += following
        _require(
            offset < section_end, "native server has malformed ELF version requirements"
        )
    return versions


def _version_auxiliaries(
    content: bytes,
    record_offset: int,
    count: int,
    auxiliary: int,
    section_end: int,
    string_table: tuple[int, int],
) -> set[tuple[int, int, int]]:
    offset = record_offset + auxiliary
    versions: set[tuple[int, int, int]] = set()
    for index in range(count):
        _require(
            offset + 16 <= section_end,
            "native server has malformed ELF version requirements",
        )
        name_offset = _unpack_from(
            "<I",
            content,
            offset + 8,
            "native server has malformed ELF version requirements",
        )
        following = _unpack_from(
            "<I",
            content,
            offset + 12,
            "native server has malformed ELF version requirements",
        )
        versions.update(_glibc_version(_elf_string(content, string_table, name_offset)))
        if index + 1 == count:
            continue
        _require(
            following >= 16, "native server has malformed ELF version requirements"
        )
        offset += following
        _require(
            offset + 16 <= section_end,
            "native server has malformed ELF version requirements",
        )
    return versions


def _glibc_version(name: str) -> set[tuple[int, int, int]]:
    match = _GLIBC_VERSION.fullmatch(name)
    if match is None:
        if name.startswith("GLIBC_"):
            raise PlatformContractError(
                "native server has a malformed GLIBC version requirement"
            )
        return set()
    return {
        (
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3) or "0"),
        )
    }


def _elf_string(content: bytes, string_table: tuple[int, int], offset: int) -> str:
    table_offset, table_size = string_table
    start = table_offset + offset
    end_limit = table_offset + table_size
    _require(
        start < end_limit <= len(content),
        "native server has an invalid ELF version string",
    )
    end = content.find(b"\x00", start, end_limit)
    _require(end >= 0, "native server has an unterminated ELF version string")
    try:
        return content[start:end].decode("ascii")
    except UnicodeDecodeError as error:
        raise PlatformContractError(
            "native server has a non-ASCII ELF version string"
        ) from error


def _validate_pe_machine(content: bytes, architecture: str) -> None:
    _require(
        len(content) >= 0x40 and content[:2] == b"MZ",
        "native server is not a PE executable",
    )
    offset = _unpack_from(
        "<I", content, 0x3C, "native server has a truncated PE header"
    )
    _require(
        offset >= 0x40 and offset + 6 <= len(content),
        "native server has a truncated PE header",
    )
    _require(
        content[offset : offset + 4] == b"PE\x00\x00",
        "native server has an invalid PE signature",
    )
    machine = _unpack_from(
        "<H", content, offset + 4, "native server has a truncated PE header"
    )
    _require(
        machine == _PE_MACHINE[architecture],
        "native server has the wrong PE architecture",
    )


def _unpack_from(format_string: str, content: bytes, offset: int, message: str) -> int:
    size = struct.calcsize(format_string)
    _require(0 <= offset <= len(content) - size, message)
    return int(struct.unpack_from(format_string, content, offset)[0])


def _format_version(version: tuple[int, int, int] | tuple[int, int]) -> str:
    if len(version) == 2 or version[2] == 0:
        return f"{version[0]}.{version[1]}"
    return f"{version[0]}.{version[1]}.{version[2]}"


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PlatformContractError(message)
