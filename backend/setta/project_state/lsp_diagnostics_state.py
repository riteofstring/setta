from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticsPayload,
    SettaProjectConfigDiagnostics,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ProjectLspDiagnosticsState:
    def __init__(
        self,
        project_config_id: ID,
        websocket_msg_handler: WMHFrontendSender,
    ):
        self.project_config_id = project_config_id
        self.websocket_msg_handler = websocket_msg_handler
        self.gen_code = self._empty_gen_code()
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
        self.gen_code = gen_code
        self.unmapped_gen_code = unmapped_gen_code
        await self.broadcast()

    async def update_code_section(
        self,
        section_id: ID,
        diagnostics: list[SettaLspDiagnostic],
    ) -> None:
        if diagnostics:
            self.code_sections[section_id] = diagnostics
        else:
            self.code_sections.pop(section_id, None)
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
            self.gen_code = self._empty_gen_code()
            changed = True
        if clear_code_sections:
            self.code_sections = {}
            changed = True
        if clear_unmapped:
            self.unmapped_gen_code = []
            changed = True
        if changed:
            await self.broadcast()
