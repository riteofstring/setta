from setta.types.helpers_lvl3 import filter_lsp_diagnostics_payload
from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
    SettaLspDiagnosticsPayload,
    SettaProjectConfigDiagnostics,
    SettaSectionTypeErrors,
)


def _make_diag(message: str) -> SettaLspDiagnostic:
    return SettaLspDiagnostic(
        message=message,
        severity=1,
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(line=0, character=0),
            end=SettaLspDiagnosticPosition(line=0, character=1),
        ),
        uri=None,
        code=None,
        source=None,
    )


def test_filter_lsp_diagnostics_payload_limits_sections_and_unmapped() -> None:
    project_config_id = ID("project-1")
    allowed_section_id = ID("allowed")
    blocked_section_id = ID("blocked")

    payload = SettaLspDiagnosticsPayload(
        projectConfigId=project_config_id,
        genCode=SettaProjectConfigDiagnostics(
            projectConfigId=project_config_id,
            isGenCode=True,
            errors={
                allowed_section_id: SettaSectionTypeErrors(callable=["ok"]),
                blocked_section_id: SettaSectionTypeErrors(callable=["nope"]),
            },
        ),
        codeSections={
            allowed_section_id: [_make_diag("allowed diag")],
            blocked_section_id: [_make_diag("blocked diag")],
        },
        unmappedGenCode=[_make_diag("unmapped")],
    )

    filtered = filter_lsp_diagnostics_payload(
        payload,
        allowed_section_ids={allowed_section_id},
        include_unmapped=False,
    )

    assert set(filtered.genCode.errors.keys()) == {allowed_section_id}
    assert set(filtered.codeSections.keys()) == {allowed_section_id}
    assert filtered.unmappedGenCode == []

    filtered_with_unmapped = filter_lsp_diagnostics_payload(
        payload,
        allowed_section_ids={allowed_section_id},
        include_unmapped=True,
    )
    assert filtered_with_unmapped.unmappedGenCode
