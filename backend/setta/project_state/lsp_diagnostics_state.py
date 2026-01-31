from setta.project_state.lsp_response_handlers.diagnostics import (
    apply_code_section_diagnostics_ignore,
)
from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticsPayload,
    SettaProjectConfigDiagnostics,
)
from setta.types.section_impls import CodeSectionDiagnosticsIgnoreState
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


def _diagnostics_equal(
    left: list[SettaLspDiagnostic],
    right: list[SettaLspDiagnostic],
) -> bool:
    if len(left) != len(right):
        return False
    for left_item, right_item in zip(left, right):
        if left_item.model_dump() != right_item.model_dump():
            return False
    return True


class ProjectLspDiagnosticsState:
    def __init__(
        self,
        project_config_id: ID,
        websocket_msg_handler: WMHFrontendSender,
    ):
        self.project_config_id = project_config_id
        self.websocket_msg_handler = websocket_msg_handler
        self.gen_code = self._empty_gen_code()
        self.raw_code_sections: dict[ID, list[SettaLspDiagnostic]] = {}
        self.code_sections: dict[ID, list[SettaLspDiagnostic]] = {}
        self.unmapped_gen_code: list[SettaLspDiagnostic] = []

    def _empty_gen_code(self) -> SettaProjectConfigDiagnostics:
        return SettaProjectConfigDiagnostics(
            projectConfigId=self.project_config_id,
            errors={},
            isGenCode=True,
        )

    def snapshot(self) -> SettaLspDiagnosticsPayload:
        return SettaLspDiagnosticsPayload(
            projectConfigId=self.project_config_id,
            genCode=self.gen_code,
            codeSections=self.code_sections,
            unmappedGenCode=self.unmapped_gen_code,
        )

    async def broadcast(self) -> None:
        await self.websocket_msg_handler.broadcast_lsp_diagnostics(self.snapshot())

    async def update_gen_code(
        self,
        gen_code: SettaProjectConfigDiagnostics,
        unmapped_gen_code: list[SettaLspDiagnostic],
    ) -> None:
        if self.gen_code.model_dump() == gen_code.model_dump() and _diagnostics_equal(
            self.unmapped_gen_code, unmapped_gen_code
        ):
            return
        self.gen_code = gen_code
        self.unmapped_gen_code = unmapped_gen_code
        await self.broadcast()

    async def update_code_section(
        self,
        section_id: ID,
        diagnostics: list[SettaLspDiagnostic],
        *,
        ignore_state: CodeSectionDiagnosticsIgnoreState | None = None,
    ) -> None:
        existing_raw = self.raw_code_sections.get(section_id, [])
        raw_changed = not _diagnostics_equal(existing_raw, diagnostics)
        if raw_changed:
            if diagnostics:
                self.raw_code_sections[section_id] = diagnostics
            else:
                self.raw_code_sections.pop(section_id, None)
        filtered = apply_code_section_diagnostics_ignore(diagnostics, ignore_state)
        existing_filtered = self.code_sections.get(section_id, [])
        filtered_changed = not _diagnostics_equal(existing_filtered, filtered)
        if filtered_changed:
            if filtered:
                self.code_sections[section_id] = filtered
            else:
                self.code_sections.pop(section_id, None)
        if filtered_changed:
            await self.broadcast()

    async def reapply_code_section_ignore_state(
        self,
        section_id: ID,
        ignore_state: CodeSectionDiagnosticsIgnoreState | None,
    ) -> None:
        diagnostics = self.raw_code_sections.get(section_id, [])
        filtered = apply_code_section_diagnostics_ignore(diagnostics, ignore_state)
        existing_filtered = self.code_sections.get(section_id, [])
        filtered_changed = not _diagnostics_equal(existing_filtered, filtered)
        if filtered_changed:
            if filtered:
                self.code_sections[section_id] = filtered
            else:
                self.code_sections.pop(section_id, None)
            await self.broadcast()

    async def prune_code_sections(self, valid_section_ids: set[ID]) -> None:
        changed = False
        for section_id in list(self.raw_code_sections.keys()):
            if section_id not in valid_section_ids:
                self.raw_code_sections.pop(section_id, None)
                changed = True
        for section_id in list(self.code_sections.keys()):
            if section_id not in valid_section_ids:
                self.code_sections.pop(section_id, None)
                changed = True
        if changed:
            await self.broadcast()

    async def reset(
        self,
        *,
        clear_gen_code: bool = False,
        clear_code_sections: bool = False,
        clear_unmapped: bool = False,
    ) -> None:
        changed = False
        if clear_gen_code:
            if self.gen_code.errors:
                self.gen_code = self._empty_gen_code()
                changed = True
        if clear_code_sections:
            if self.raw_code_sections or self.code_sections:
                self.raw_code_sections = {}
                self.code_sections = {}
                changed = True
        if clear_unmapped:
            if self.unmapped_gen_code:
                self.unmapped_gen_code = []
                changed = True
        if changed:
            await self.broadcast()
