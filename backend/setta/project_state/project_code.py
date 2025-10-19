import copy
from pathlib import Path

from lsprotocol import types as LSPTypes

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.code_gen.python.position_line_col import position_to_line_col
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
from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeObjType
from setta.types.core import Core
from setta.types.generated.effective_impls import (
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    CallableSectionImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import create_code_obj_impl
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_code_obj_variant,
    get_curr_effective_section_impl,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    add_children_of_callable,
    add_code_obj,
    callable_has_been_selected_before,
    callable_is_already_selected,
)
from setta.types.lsp import SettaProjectConfigDiagnostics
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import CodeFileBinding, CodeSectionImpl


class ProjectGenPythonCode(PythonCode):
    def __init__(
        self,
        dbe,
        binding: CodeFileBinding,
        lsp_writers,
        websocket_msg_handler,
        project_config_id: str,
        dep_graph: DependencyGraph,
        code_generator: PythonCodeGenerator,
    ):
        super().__init__(dbe, binding, lsp_writers, websocket_msg_handler)
        # with open("test_project_state.json", "w") as f:
        # json.dump(project_state, f)
        self.project_config_id = project_config_id
        self.dep_graph = dep_graph
        self.code_generator = code_generator

    async def update_file(self):
        await super().update_file(self.code)

    def _clone_generator(self) -> PythonCodeGenerator:
        dep_graph_copy = copy.deepcopy(self.dep_graph)
        generator_copy = PythonCodeGenerator(
            dep_graph_copy,
            self.code_generator.gen_code_prefix,
            self.code_generator.gen_code_suffix,
        )
        generator_copy.generate_code()
        return generator_copy

    def _build_param_completion_context(
        self,
        sectionId: str,
        paramInfoId: str | None,
        fullText: str,
        position: int,
    ) -> tuple[str, int, int] | None:
        generator = self._clone_generator()
        graph_key = generator.dep_graph.create_graph_key(sectionId, paramInfoId)
        start = generator.change_value(graph_key, fullText)
        if start is None:
            return None
        absolute_position = position + start
        line, col = position_to_line_col(generator.code, absolute_position)
        return generator.code, line, col

    async def _request_completion_response(
        self, code: str, line: int, col: int
    ) -> LSPTypes.CompletionList | LSPTypes.CompletionItem | None:
        async with self.temporary_document(code) as filepath:
            request_id = create_new_id()
            return await self.lsp_writer.send_and_wait(
                self.lsp_writer.send_autocomplete_request(
                    filepath=filepath,
                    line=line,
                    character=col,
                    request_id=request_id,
                ),
                request_id,
            )

    async def _insert_code_and_update_state(
        self, sectionId: str, paramInfoId: str | None, fullText: str, position: int
    ) -> tuple[int, int] | None:
        graph_key = self.dep_graph.create_graph_key(sectionId, paramInfoId)
        start = self.code_generator.change_value(graph_key, fullText)
        await self.update_file()
        if start is None:
            return None
        absolute_position = position + start
        line, col = position_to_line_col(self.code, absolute_position)
        return line, col

    async def text_field_completion(
        self, sectionId: str, paramInfoId: str | None, fullText: str, position: int
    ):
        context = self._build_param_completion_context(
            sectionId, paramInfoId, fullText, position
        )
        if context is None:
            return []
        code, line, col = context
        response = await self._request_completion_response(code, line, col)
        return process_completion_response(response, fullText)

    async def clear_text_field_completion(
        self, sectionId: str, paramInfoId: str | None
    ):
        return None

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

        if callableName == "":
            set_curr_effective_section_impl_value(
                project_state,
                sectionId,
                CallableSectionImplArgsWithCallable(callable=None),
            )

        prev_selected = callable_has_been_selected_before(
            project_state, sectionId, callableName
        )

        if prev_selected and not refetchParams:
            set_curr_effective_section_impl_value(
                project_state,
                sectionId,
                CallableSectionImplArgsWithCallable(callable=prev_selected),
            )
            return

        line_col = await self._insert_code_and_update_state(
            sectionId, None, callableName, len(callableName)
        )
        if line_col is None:
            return

        line, col = line_col
        col += 1  # put cursor inside parentheses
        request_id = create_new_id()
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_signature_help_request(
                filepath=self.binding.canonical_path,
                line=line,
                character=col,
                request_id=request_id,
            ),
            request_id,
        )

        if not prev_selected:
            callable_base_impl = create_code_obj_impl(
                CodeObjType.CodeCallable,
                settings.codeCallableCodeObjDefault,
            )
            callable_code_obj = Core(name=callableName)
            callable_code_obj_variant = add_code_obj(
                project_state, [sectionId], callable_code_obj, callable_base_impl
            )
        else:
            callable_code_obj = project_state.codeObjs[prev_selected]
            callable_code_obj_variant = get_curr_code_obj_variant(
                project_state,
                sectionId,
                callable_code_obj.id,
            )
            callable_base_impl = project_state.codeObjImpls[
                callable_code_obj_variant.impl
            ]

        if not isinstance(callable_base_impl, CodeCallableCodeObjImpl):
            raise TypeError

        result = process_signature_help_response(settings, response)
        if result is None:
            return

        [documentation, codeObjs, codeObjImplMap] = result
        set_effective_impl_value(
            callable_base_impl,
            callable_code_obj,
            callable_code_obj_variant,
            CodeCallableCodeObjImplArgsWithCallable(description=documentation),
        )

        add_children_of_callable(
            project_state, sectionId, callable_code_obj.id, codeObjs, codeObjImplMap
        )

        set_curr_effective_section_impl_value(
            project_state,
            sectionId,
            CallableSectionImplArgsWithCallable(
                callable=callable_code_obj.id,
                codeObjVariantMap=lambda currMap: {
                    **currMap,
                    callable_code_obj.id: callable_code_obj_variant.id,
                },
            ),
        )

    async def gen_code_prefix_completion(self, fullText, position):
        generator = self._clone_generator()
        generator.set_gen_code_prefix(fullText)
        line, col = position_to_line_col(generator.code, position)
        response = await self._request_completion_response(generator.code, line, col)
        return process_completion_response(response, fullText)

    async def gen_code_suffix_completion(self, fullText, position):
        generator = self._clone_generator()
        insertion_offset = generator.set_gen_code_suffix(fullText)
        absolute_position = position + insertion_offset
        line, col = position_to_line_col(generator.code, absolute_position)
        response = await self._request_completion_response(generator.code, line, col)
        return process_completion_response(response, fullText)

    async def type_check(self):
        await self.send_document_open_request(self.code)

    async def diagnostics_callback(
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

    def get_gen_python_code_path(self):
        return self.binding.canonical_path

    @property
    def code(self):
        return self.code_generator.code

    def write_to_folder(self, folder: Path):
        return super().write_to_folder(self.code, folder)


class ProjectPythonCode(PythonCode):
    def __init__(
        self,
        dbe,
        lsp_writers,
        websocket_msg_handler,
        project_state: ProjectStateSingleConfig,
        sectionId,
    ):
        section_impl = get_curr_effective_section_impl(project_state, sectionId)
        if not isinstance(section_impl, CodeSectionImpl):
            raise TypeError
        binding = section_impl.codeFileBinding
        if binding is None:
            raise ValueError("Code section missing codeFileBinding")
        super().__init__(dbe, binding, lsp_writers, websocket_msg_handler)
        self.sectionId = sectionId
        self.code = section_impl.code

    async def update_file(self):
        await super().update_file(self.code)

    async def code_area_completion(self, fullText, position):
        line, col = position_to_line_col(fullText, position)
        async with self.temporary_document(fullText) as filepath:
            request_id = create_new_id()
            response = await self.lsp_writer.send_and_wait(
                self.lsp_writer.send_autocomplete_request(
                    filepath=filepath,
                    line=line,
                    character=col,
                    request_id=request_id,
                ),
                request_id,
            )
        return process_completion_response(response, fullText)

    async def type_check(self):
        await self.send_document_open_request(self.code)

    async def diagnostics_callback(self, lsp_response):
        # TODO
        pass

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)


class ProjectBashCode(BashCode):
    def __init__(
        self, dbe, project_state: ProjectStateSingleConfig, sectionId
    ):
        section_impl = get_curr_effective_section_impl(project_state, sectionId)
        if not isinstance(section_impl, CodeSectionImpl):
            raise TypeError
        binding = section_impl.codeFileBinding
        if binding is None:
            raise ValueError("Code section missing codeFileBinding")
        super().__init__(dbe, binding)
        self.sectionId = sectionId
        self.code = section_impl.code

    async def update_file(self):
        super().update_file(self.code)

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)
