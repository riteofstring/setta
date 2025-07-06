from pathlib import Path

from lsprotocol import types as LSPTypes

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.code_gen.utils import (
    CLASS_NAME,
    sanitize_name,
)
from setta.database.utils import create_new_id
from setta.project_state.code import (
    BashCode,
    PythonCode,
)
from setta.project_state.lsp_response_handlers.completion import (
    process_completion_response,
)
from setta.project_state.lsp_response_handlers.diagnostics import (
    process_gen_code_diagnostics,
)
from setta.project_state.lsp_response_handlers.signatureHelp import (
    process_signature_help_response,
)
from setta.types.code_obj_impls import CodeCallableCodeObjImpl
from setta.types.generated.cores import CallableSectionCore, create_code_obj_core
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_creation_fns import createCodeCallableCodeObjImpl
from setta.types.generated.layerings import CallableSectionLayering
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers import (
    add_children_of_callable,
    add_code_obj,
    callable_has_been_selected_before,
    callable_is_already_selected,
    get_code_obj_impl_layering,
    get_effective_section_impl,
    get_section_impl_layering,
    get_section_path_full_name,
)
from setta.types.lsp import SettaProjectConfigDiagnostics
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    CallableSectionImpl,
    CodeSectionImpl,
)


class ProjectGenPythonCode(PythonCode):
    def __init__(
        self,
        temp_folder,
        lsp_writers,
        websocket_msg_handler,
        project_config_id: str,
        dep_graph: DependencyGraph,
        code_generator: PythonCodeGenerator,
    ):
        super().__init__(temp_folder, lsp_writers, websocket_msg_handler)
        # with open("test_project_state.json", "w") as f:
        # json.dump(project_state, f)
        self.project_config_id = project_config_id
        self.dep_graph = dep_graph
        self.code_generator = code_generator
        self.diagnostics_callback = self.process_diagnostics_response

    async def update_file(self):
        await super().update_file(self.code_generator.code)

    async def insert_code_at_position(
        self, sectionId: str, paramInfoId: str | None, fullText: str, position: int
    ):
        graph_key = self.dep_graph.create_graph_key(sectionId, paramInfoId)
        start = self.code_generator.change_value(graph_key, fullText)
        await self.update_file()
        if start is None:
            return None
        position += start
        line, col = position_to_line_col(self.code_generator.code, position)
        return line, col

    async def text_field_autocomplete(
        self, sectionId: str, paramInfoId: str | None, fullText: str, position: int
    ):
        line_col = await self.insert_code_at_position(
            sectionId, paramInfoId, fullText, position
        )
        if line_col is None:
            return []
        else:
            line, col = line_col
            request_id = create_new_id()
            response = await self.lsp_writer.send_and_wait(
                self.lsp_writer.send_autocomplete_request(
                    filepath=self.temp_file,
                    line=line,
                    character=col,
                    request_id=request_id,
                ),
                request_id,
            )
            return process_completion_response(response, self.code_generator.code)

    async def clear_text_field_completion(
        self, sectionId: str, paramInfoId: str | None
    ):
        await self.insert_code_at_position(sectionId, paramInfoId, "", 0)

    async def set_callable(
        self,
        settings: SettingsState,
        project_state: ProjectStateSingleConfig,
        sectionId: str,
        callableName: str,
        refetchParams: bool,
    ):
        if not refetchParams and callable_is_already_selected(
            project_state, sectionId, callableName
        ):
            return

        section_layering = get_section_impl_layering(project_state, sectionId)
        base_section_impl = project_state.sectionImpls[section_layering.impl]
        section_core = project_state.sections[sectionId]
        section_impl = get_effective_impl(
            base_section_impl,
            section_core,
            section_layering,
        )

        if not (
            isinstance(base_section_impl, CallableSectionImpl)
            and isinstance(section_impl, CallableSectionImpl)
            and isinstance(section_core, CallableSectionCore)
            and isinstance(section_layering, CallableSectionLayering)
        ):
            raise TypeError

        if callableName == "":
            section_impl = set_effective_impl_value(
                base_section_impl,
                section_core,
                section_layering,
                {"callable": None},
            )

        prev_selected = callable_has_been_selected_before(
            project_state, sectionId, callableName
        )

        if prev_selected and not refetchParams:
            section_impl = set_effective_impl_value(
                base_section_impl,
                section_core,
                section_layering,
                {"callable": prev_selected},
            )
            return

        line_col = await self.insert_code_at_position(
            sectionId, None, callableName, len(callableName)
        )
        if line_col is None:
            return

        line, col = line_col
        col += 1  # put cursor inside parentheses
        request_id = create_new_id()
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_signature_help_request(
                filepath=self.temp_file,
                line=line,
                character=col,
                request_id=request_id,
            ),
            request_id,
        )

        if not prev_selected:
            callable_code_obj_impl = createCodeCallableCodeObjImpl(
                settings.codeCallableDefault
            )
            callable_code_obj = create_code_obj_core(
                callable_code_obj_impl.type, name=callableName
            )
            callable_code_obj_impl_layering = add_code_obj(
                project_state, sectionId, callable_code_obj, callable_code_obj_impl
            )
        else:
            callable_code_obj = project_state.codeObjs[prev_selected]
            callable_code_obj_impl_layering = get_code_obj_impl_layering(
                project_state, callable_code_obj.id, section_impl=section_impl
            )
            callable_code_obj_impl = get_effective_impl(
                callable_code_obj_impl_layering,
                callable_code_obj,
                project_state.codeObjImpls,
            )

        if not isinstance(callable_code_obj_impl, CodeCallableCodeObjImpl):
            raise TypeError

        result = process_signature_help_response(settings, response)
        if result is None:
            return

        [documentation, codeObjs, codeObjImplMap] = result
        set_effective_impl_value(
            callable_code_obj_impl_layering,
            callable_code_obj,
            project_state.codeObjImpls,
            "description",
            documentation,
        )

        add_children_of_callable(
            project_state, sectionId, callable_code_obj.id, codeObjs, codeObjImplMap
        )
        set_effective_impl_value(
            section_layering,
            project_state.sections[sectionId],
            project_state.sectionImpls,
            "callable",
            callable_code_obj.id,
        )

    async def gen_code_prefix_autocomplete(self, fullText, position):
        self.code_generator.set_gen_code_prefix(fullText)
        await self.update_file()
        line, col = position_to_line_col(self.code_generator.code, position)
        request_id = create_new_id()
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_autocomplete_request(
                filepath=self.temp_file,
                line=line,
                character=col,
                request_id=request_id,
            ),
            request_id,
        )
        return process_completion_response(response, fullText)

    async def type_check(self):
        await self.send_document_open_request(self.code_generator.code)

    async def process_diagnostics_response(
        self, lsp_response: LSPTypes.TextDocumentPublishDiagnosticsNotification
    ):
        params = lsp_response.params
        if self.lsp_writer.get_latest_version_number(self.uri) != params.version:
            return
        diagnostics = process_gen_code_diagnostics(
            params.diagnostics,
            self.code_generator,
            self.dep_graph,
        )
        content = SettaProjectConfigDiagnostics(
            projectConfigId=self.project_config_id,
            diagnostics=diagnostics,
            isGenCode=True,
        )

        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)

    def get_base_filename(self):
        return "setta_gen"

    def get_gen_python_code_path(self):
        return self.temp_file

    def get_gen_python_code(self):
        return self.code_generator.code

    def write_to_folder(self, folder: Path, as_entry_code_block: bool):
        code = self.code_generator.code
        if as_entry_code_block:
            # if we're using this as the entry code block, then just append S()
            code = f"{code}\n\n{CLASS_NAME}()"
        return super().write_to_folder(code, folder)


class ProjectPythonCode(PythonCode):
    def __init__(
        self,
        temp_folder,
        lsp_writers,
        websocket_msg_handler,
        project_state: ProjectStateSingleConfig,
        sectionId,
    ):
        super().__init__(temp_folder, lsp_writers, websocket_msg_handler)
        self.section_path_full_name = get_section_path_full_name(
            project_state, sectionId
        )
        self.sectionId = sectionId
        section_impl = get_effective_section_impl(project_state, sectionId)
        if not isinstance(section_impl, CodeSectionImpl):
            raise TypeError
        self.code = section_impl.code
        self.diagnostics_callback = self.process_diagnostics_response

    async def update_file(self):
        await super().update_file(self.code)

    def get_base_filename(self):
        return sanitize_name(self.section_path_full_name)

    async def code_area_autocomplete(self, fullText, position):
        self.code = fullText
        await self.update_file()
        line, col = position_to_line_col(fullText, position)
        request_id = create_new_id()
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_autocomplete_request(
                filepath=self.temp_file,
                line=line,
                character=col,
                request_id=request_id,
            ),
            request_id,
        )
        return process_completion_response(response, self.code)

    async def type_check(self):
        await self.send_document_open_request(self.code)

    async def process_diagnostics_response(self, lsp_response):
        # TODO
        pass

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)


class ProjectBashCode(BashCode):
    def __init__(self, temp_folder, project_state: ProjectStateSingleConfig, sectionId):
        super().__init__(temp_folder)
        self.section_path_full_name = get_section_path_full_name(
            project_state, sectionId
        )
        self.sectionId = sectionId
        section_impl = get_effective_section_impl(project_state, sectionId)
        if not isinstance(section_impl, CodeSectionImpl):
            raise TypeError
        self.code = section_impl.code

    def get_base_filename(self):
        return sanitize_name(self.section_path_full_name)

    async def update_file(self):
        super().update_file(self.code)

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)
