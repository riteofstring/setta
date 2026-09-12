from __future__ import annotations

import json
import unittest

from scripts import check_auditwheel_report as auditwheel_report


class AuditwheelReportValidationTests(unittest.TestCase):
    def test_accepts_a_wrapped_more_compatible_manylinux_tag(self) -> None:
        report = _report(
            "manylinux_2_17_x86_64",
            external_libraries={"libc.so.6": {"GLIBC_2.2.5": "libc.so.6"}},
            wrap_tag=True,
        )
        tag = auditwheel_report._assert_report(
            report,
            expected_architecture="x86_64",
            max_glibc_minor=28,
        )
        self.assertEqual(tag, "manylinux_2_17_x86_64")

    def test_rejects_a_manylinux_floor_above_the_declared_policy(self) -> None:
        with self.assertRaisesRegex(
            auditwheel_report.AuditwheelReportError, "above 2.28"
        ):
            auditwheel_report._assert_report(
                _report("manylinux_2_29_x86_64"),
                expected_architecture="x86_64",
                max_glibc_minor=28,
            )

    def test_rejects_a_compatible_tag_for_the_wrong_architecture(self) -> None:
        with self.assertRaisesRegex(
            auditwheel_report.AuditwheelReportError, "wrong architecture"
        ):
            auditwheel_report._assert_report(
                _report("manylinux_2_28_aarch64"),
                expected_architecture="x86_64",
                max_glibc_minor=28,
            )

    def test_rejects_an_unsafe_generic_linux_tag(self) -> None:
        with self.assertRaisesRegex(
            auditwheel_report.AuditwheelReportError, "generic linux"
        ):
            auditwheel_report._assert_report(
                "wheel is consistent with the following platform tag: "
                '"linux_x86_64".\n',
                expected_architecture="x86_64",
                max_glibc_minor=28,
            )

    def test_rejects_a_non_policy_external_shared_library(self) -> None:
        report = _report(
            "manylinux_2_28_x86_64",
            external_libraries={"libgmodule-2.0.so.0": "/usr/lib/libgmodule-2.0.so.0"},
        )
        with self.assertRaisesRegex(
            auditwheel_report.AuditwheelReportError,
            "non-policy external shared libraries",
        ):
            auditwheel_report._assert_report(
                report,
                expected_architecture="x86_64",
                max_glibc_minor=28,
            )

    def test_rejects_a_malformed_external_library_section(self) -> None:
        report = (
            "wheel is consistent with the following platform tag: "
            '"manylinux_2_28_x86_64".\n'
            "The following external shared libraries are required by the wheel:\n"
            "{not json}\n"
        )
        with self.assertRaisesRegex(
            auditwheel_report.AuditwheelReportError, "not valid JSON"
        ):
            auditwheel_report._assert_report(
                report,
                expected_architecture="x86_64",
                max_glibc_minor=28,
            )


def _report(
    tag: str,
    *,
    external_libraries: dict[str, object] | None = None,
    wrap_tag: bool = False,
) -> str:
    if wrap_tag:
        compatibility = (
            f'wheel is consistent with the following platform tag:\n    "{tag}".\n'
        )
    else:
        compatibility = (
            f'wheel is consistent with the following platform tag: "{tag}".\n'
        )
    if external_libraries is None:
        return compatibility + "The wheel requires no external shared libraries! :)\n"
    return (
        compatibility
        + "The following external shared libraries are required by the wheel:\n"
        + json.dumps(external_libraries, sort_keys=True)
        + "\n"
    )


if __name__ == "__main__":
    unittest.main()
