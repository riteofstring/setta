from setta.project_state.lsp_response_handlers.diagnostics import (
    apply_code_section_diagnostics_ignore,
)
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
)
from setta.types.section_impls import CodeSectionDiagnosticsIgnoreState


def _build_diagnostic(code: str | int | None) -> SettaLspDiagnostic:
    return SettaLspDiagnostic(
        message="Example diagnostic",
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(line=0, character=0),
            end=SettaLspDiagnosticPosition(line=0, character=1),
        ),
        code=code,
    )


def test_mute_clears_diagnostics() -> None:
    diagnostics = [_build_diagnostic("reportFoo"), _build_diagnostic(None)]
    ignore_state = CodeSectionDiagnosticsIgnoreState(
        muted=True,
        suppressedCodes=["reportFoo"],
    )

    assert apply_code_section_diagnostics_ignore(diagnostics, ignore_state) == []


def test_suppressed_codes_filter_diagnostics() -> None:
    diagnostics = [
        _build_diagnostic("reportFoo"),
        _build_diagnostic("reportBar"),
    ]
    ignore_state = CodeSectionDiagnosticsIgnoreState(
        muted=False,
        suppressedCodes=["reportFoo"],
    )

    filtered = apply_code_section_diagnostics_ignore(diagnostics, ignore_state)

    assert [entry.code for entry in filtered] == ["reportBar"]
