#!/usr/bin/env python3


from __future__ import annotations

import argparse
import json
import re
import stat
from collections.abc import Sequence
from pathlib import Path

_MAX_REPORT_BYTES = 256 * 1024
_SUPPORTED_ARCHITECTURES = frozenset({"aarch64", "x86_64"})
_MANYLINUX_2_28_ALLOWED_EXTERNAL_LIBRARIES = frozenset(
    {
        "libGL.so.1",
        "libICE.so.6",
        "libSM.so.6",
        "libX11.so.6",
        "libXext.so.6",
        "libXrender.so.1",
        "libanl.so.1",
        "libatomic.so.1",
        "libc.so.6",
        "libdl.so.2",
        "libexpat.so.1",
        "libgcc_s.so.1",
        "libglib-2.0.so.0",
        "libgobject-2.0.so.0",
        "libgthread-2.0.so.0",
        "libm.so.6",
        "libmvec.so.1",
        "libnsl.so.1",
        "libpthread.so.0",
        "libresolv.so.2",
        "librt.so.1",
        "libstdc++.so.6",
        "libutil.so.1",
        "libz.so.1",
    }
)
_COMPATIBLE_TAG_PATTERN = re.compile(
    r"\bconsistent\s+with\b.{0,1024}?\bplatform\s+tag(?:s)?\s*:\s*[\"']?"
    r"(?P<tag>manylinux_2_(?P<minor>[0-9]+)_(?P<architecture>x86_64|aarch64))[\"']?",
    re.IGNORECASE | re.DOTALL,
)
_GENERIC_LINUX_TAG_PATTERN = re.compile(
    r"(?<!many)\blinux_(?:x86_64|aarch64)\b", re.IGNORECASE
)
_EXTERNAL_LIBRARY_MARKER = (
    "The following external shared libraries are required by the wheel:"
)


class AuditwheelReportError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report", required=True, type=Path, help="auditwheel show output"
    )
    parser.add_argument(
        "--expected-architecture",
        required=True,
        choices=sorted(_SUPPORTED_ARCHITECTURES),
        help="wheel architecture expected from the build matrix",
    )
    parser.add_argument(
        "--max-glibc-minor",
        required=True,
        type=int,
        help="highest permitted manylinux_2_N glibc minor",
    )
    namespace = parser.parse_args(arguments)
    try:
        tag = check_auditwheel_report(
            namespace.report,
            expected_architecture=namespace.expected_architecture,
            max_glibc_minor=namespace.max_glibc_minor,
        )
    except AuditwheelReportError as error:
        parser.exit(1, f"check_auditwheel_report: {error}\n")
    print(f"auditwheel report passed: {tag}")
    return 0


def check_auditwheel_report(
    report_path: Path, *, expected_architecture: str, max_glibc_minor: int
) -> str:

    if expected_architecture not in _SUPPORTED_ARCHITECTURES:
        raise AuditwheelReportError(
            f"unsupported expected auditwheel architecture: {expected_architecture!r}"
        )
    if max_glibc_minor < 0:
        raise AuditwheelReportError(
            "maximum manylinux glibc minor must be non-negative"
        )
    report = _read_report(report_path)
    return _assert_report(
        report,
        expected_architecture=expected_architecture,
        max_glibc_minor=max_glibc_minor,
    )


def _read_report(value: Path) -> str:
    path = value.expanduser()
    try:
        information = path.lstat()
    except OSError as error:
        raise AuditwheelReportError(
            f"auditwheel report is unavailable: {path}"
        ) from error
    if stat.S_ISLNK(information.st_mode) or not stat.S_ISREG(information.st_mode):
        raise AuditwheelReportError(
            "auditwheel report must be a regular non-symlink file"
        )
    if information.st_size > _MAX_REPORT_BYTES:
        raise AuditwheelReportError("auditwheel report exceeds the bounded read limit")
    try:
        with path.open("rb") as source:
            content = source.read(_MAX_REPORT_BYTES + 1)
    except OSError as error:
        raise AuditwheelReportError(f"cannot read auditwheel report: {path}") from error
    if len(content) > _MAX_REPORT_BYTES:
        raise AuditwheelReportError("auditwheel report exceeds the bounded read limit")
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise AuditwheelReportError("auditwheel report is not valid UTF-8") from error


def _assert_report(
    report: str, *, expected_architecture: str, max_glibc_minor: int
) -> str:
    if _GENERIC_LINUX_TAG_PATTERN.search(report) is not None:
        raise AuditwheelReportError(
            "auditwheel reported an unsafe generic linux platform tag"
        )

    matches = tuple(_COMPATIBLE_TAG_PATTERN.finditer(report))
    if len(matches) != 1:
        raise AuditwheelReportError(
            "auditwheel must report exactly one compatible manylinux platform tag"
        )
    match = matches[0]
    architecture = match.group("architecture")
    minor = int(match.group("minor"))
    if architecture != expected_architecture:
        raise AuditwheelReportError(
            "auditwheel reported a manylinux tag for the wrong architecture"
        )
    if minor > max_glibc_minor:
        raise AuditwheelReportError(
            f"auditwheel requires a manylinux glibc floor above 2.{max_glibc_minor}"
        )

    _assert_external_library_policy(report)
    return match.group("tag")


def _assert_external_library_policy(report: str) -> None:
    marker_offset = report.find(_EXTERNAL_LIBRARY_MARKER)
    if marker_offset < 0:
        return
    object_offset = report.find("{", marker_offset + len(_EXTERNAL_LIBRARY_MARKER))
    if object_offset < 0:
        raise AuditwheelReportError(
            "auditwheel external-library section is not valid JSON"
        )
    try:
        libraries, _ = json.JSONDecoder().raw_decode(report[object_offset:])
    except json.JSONDecodeError as error:
        raise AuditwheelReportError(
            "auditwheel external-library section is not valid JSON"
        ) from error
    if not isinstance(libraries, dict) or any(
        not isinstance(name, str) for name in libraries
    ):
        raise AuditwheelReportError(
            "auditwheel external-library section has an invalid shape"
        )
    library_names = {name for name in libraries if isinstance(name, str)}
    non_policy_libraries = sorted(
        library_names - _MANYLINUX_2_28_ALLOWED_EXTERNAL_LIBRARIES
    )
    if non_policy_libraries:
        joined = ", ".join(non_policy_libraries)
        raise AuditwheelReportError(
            "auditwheel reports non-policy external shared libraries requiring "
            f"repair: {joined}"
        )


if __name__ == "__main__":
    raise SystemExit(main())
