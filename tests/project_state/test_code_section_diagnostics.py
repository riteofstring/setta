from pathlib import Path
from tempfile import TemporaryDirectory

from lsprotocol import types as LSPTypes
import pytest
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.code_files import CodeFiles
from setta.project_state.lsp_diagnostics_state import ProjectLspDiagnosticsState
from setta.project_state.project_code import ProjectPythonCode
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionDiagnosticsIgnoreState,
    CodeSectionImpl,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def build_code_section_state(
    root: Path,
    *,
    ignore_state: CodeSectionDiagnosticsIgnoreState | None = None,
):
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    binding = CodeFileBinding(
        canonical_path=root / "code" / "DiagnosticsProject" / "section.py",
        access_mode=CodeFileAccessMode.read_write,
    )
    section_impl = CodeSectionImpl(
        id=section_impl_id,
        code="print('hi')",
        codeLanguage=CodeLanguage.python,
        codeFileBinding=binding,
        diagnosticsIgnoreState=ignore_state or CodeSectionDiagnosticsIgnoreState(),
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    project_config = ProjectConfig(
        id=ID("project-1"),
        name="DiagnosticsProject",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
    )
    return project_state, section_id, binding


def build_notification(
    uri: str,
    diagnostics: list[LSPTypes.Diagnostic],
    *,
    version: int | None = 0,
):
    return LSPTypes.TextDocumentPublishDiagnosticsNotification(
        params=LSPTypes.PublishDiagnosticsParams(
            uri=uri,
            diagnostics=diagnostics,
            version=version,
        )
    )


def build_diagnostic(code: str):
    return LSPTypes.Diagnostic(
        range=LSPTypes.Range(
            start=LSPTypes.Position(line=0, character=0),
            end=LSPTypes.Position(line=0, character=5),
        ),
        message="Bad code",
        severity=LSPTypes.DiagnosticSeverity.Error,
        code=code,
        source="pyright",
    )


@pytest.mark.asyncio
async def test_code_section_diagnostics_update_state() -> None:
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        dbe = DBE(root)
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        specific_file_watcher = SpecificFileWatcher()
        code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
        lsps = LSPServers({})
        lsp_writers = LSPWriters(lsps)

        project_state, section_id, binding = build_code_section_state(root)
        diagnostics_state = ProjectLspDiagnosticsState(
            project_state.projectConfig.id,
            frontend_sender,
        )
        code = ProjectPythonCode(
            dbe,
            code_files,
            lsp_writers,
            frontend_sender,
            diagnostics_state,
            project_state,
            section_id,
        )

        uri = lsp_writers.full.get_uri(binding.canonical_path)
        code.uri = uri
        lsp_writers.full.latest_version_numbers[uri] = 0

        notification = build_notification(uri, [build_diagnostic("reportFoo")])
        await code.diagnostics_callback(notification)

        stored = diagnostics_state.code_sections[section_id]
        assert len(stored) == 1
        assert stored[0].message == "Bad code"
        assert stored[0].code == "reportFoo"
        assert stored[0].uri == uri


@pytest.mark.asyncio
async def test_code_section_diagnostics_respect_suppression() -> None:
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        dbe = DBE(root)
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        specific_file_watcher = SpecificFileWatcher()
        code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
        lsps = LSPServers({})
        lsp_writers = LSPWriters(lsps)

        ignore_state = CodeSectionDiagnosticsIgnoreState(
            muted=False,
            suppressedCodes=["reportFoo"],
        )
        project_state, section_id, binding = build_code_section_state(
            root,
            ignore_state=ignore_state,
        )
        diagnostics_state = ProjectLspDiagnosticsState(
            project_state.projectConfig.id,
            frontend_sender,
        )
        code = ProjectPythonCode(
            dbe,
            code_files,
            lsp_writers,
            frontend_sender,
            diagnostics_state,
            project_state,
            section_id,
        )

        uri = lsp_writers.full.get_uri(binding.canonical_path)
        code.uri = uri
        lsp_writers.full.latest_version_numbers[uri] = 0

        notification = build_notification(uri, [build_diagnostic("reportFoo")])
        await code.diagnostics_callback(notification)

        assert section_id not in diagnostics_state.code_sections
        assert section_id in diagnostics_state.raw_code_sections


@pytest.mark.asyncio
async def test_code_section_diagnostics_prune_drops_stale_sections() -> None:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager)
    diagnostics_state = ProjectLspDiagnosticsState(ID("project-1"), frontend_sender)

    diagnostic = SettaLspDiagnostic(
        message="Bad code",
        severity=1,
        code="reportFoo",
        source="pyright",
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(line=0, character=0),
            end=SettaLspDiagnosticPosition(line=0, character=5),
        ),
        uri="file:///tmp/section.py",
    )
    section_keep = ID("section-keep")
    section_drop = ID("section-drop")
    await diagnostics_state.update_code_section(section_keep, [diagnostic])
    await diagnostics_state.update_code_section(section_drop, [diagnostic])

    await diagnostics_state.prune_code_sections({section_keep})

    assert section_keep in diagnostics_state.code_sections
    assert section_keep in diagnostics_state.raw_code_sections
    assert section_drop not in diagnostics_state.code_sections
    assert section_drop not in diagnostics_state.raw_code_sections


@pytest.mark.asyncio
async def test_code_section_diagnostics_ignores_versionless_publish() -> None:
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        dbe = DBE(root)
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        specific_file_watcher = SpecificFileWatcher()
        code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
        lsps = LSPServers({})
        lsp_writers = LSPWriters(lsps)

        project_state, section_id, binding = build_code_section_state(root)
        diagnostics_state = ProjectLspDiagnosticsState(
            project_state.projectConfig.id,
            frontend_sender,
        )
        code = ProjectPythonCode(
            dbe,
            code_files,
            lsp_writers,
            frontend_sender,
            diagnostics_state,
            project_state,
            section_id,
        )

        uri = lsp_writers.full.get_uri(binding.canonical_path)
        code.uri = uri
        lsp_writers.full.latest_version_numbers[uri] = 0

        notification = build_notification(
            uri,
            [build_diagnostic("reportFoo")],
            version=None,
        )
        await code.diagnostics_callback(notification)

        assert section_id not in diagnostics_state.code_sections
        assert section_id not in diagnostics_state.raw_code_sections


@pytest.mark.asyncio
async def test_code_section_diagnostics_restore_after_ignore_change() -> None:
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        dbe = DBE(root)
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        specific_file_watcher = SpecificFileWatcher()
        code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
        lsps = LSPServers({})
        lsp_writers = LSPWriters(lsps)

        ignore_state = CodeSectionDiagnosticsIgnoreState(muted=True)
        project_state, section_id, binding = build_code_section_state(
            root,
            ignore_state=ignore_state,
        )
        diagnostics_state = ProjectLspDiagnosticsState(
            project_state.projectConfig.id,
            frontend_sender,
        )
        code = ProjectPythonCode(
            dbe,
            code_files,
            lsp_writers,
            frontend_sender,
            diagnostics_state,
            project_state,
            section_id,
        )

        uri = lsp_writers.full.get_uri(binding.canonical_path)
        code.uri = uri
        lsp_writers.full.latest_version_numbers[uri] = 0

        notification = build_notification(uri, [build_diagnostic("reportFoo")])
        await code.diagnostics_callback(notification)

        assert section_id not in diagnostics_state.code_sections

        await diagnostics_state.reapply_code_section_ignore_state(
            section_id,
            CodeSectionDiagnosticsIgnoreState(),
        )

        stored = diagnostics_state.code_sections[section_id]
        assert len(stored) == 1
