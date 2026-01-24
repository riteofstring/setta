import copy
from pathlib import Path
from typing import Awaitable, Callable

from lsprotocol import types as LSPTypes

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.python.meta_generator import build_python_meta_code
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.code_gen.utils import GEN_CODE_INSTANCE_NAME
from setta.code_gen.value_mode import PythonValueMode
from setta.database.utils import create_new_id
from setta.project_state.code import BashCode, Code, PythonCode
from setta.project_state.code_files import (
    GEN_CODE_SECTION_ID,
    GEN_CODE_VARIANT_ID,
    RegisteredCodeFileBinding,
)
from setta.project_state.lsp_response_handlers.completion import (
    process_completion_response,
)
from setta.project_state.lsp_response_handlers.diagnostics import (
    process_gen_code_diagnostics_with_undefined_symbols,
)
from setta.project_state.lsp_response_handlers.signatureHelp import (
    SignatureHelpStatus,
    process_signature_help_response,
)
from setta.project_state.project_manager_types import (
    SetCallableChildCodeObj,
    SetCallableResponse,
)
from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeObjType
from setta.types.core import Core
from setta.types.dependency_key import create_dep_key
from setta.types.edges import Edge
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
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
    get_variant_base_and_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    add_children_of_callable,
    add_code_obj,
    callable_has_been_selected_before,
    callable_is_already_selected,
    get_curr_section_callable_code_obj,
)
from setta.types.id import ID
from setta.types.lsp import SettaProjectConfigDiagnostics
from setta.types.project_config import get_python_codegen_target_with_type_guard
from setta.types.project_state import CODE_LANGUAGE_EXTENSIONS, ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseSectionWithParamsImpl,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    TypeErrorIgnoreState,
)
from setta.utils.constants import C
from setta.utils.utils import GEN_CODE_META_FILENAME


def build_python_code_generator(
    project_state: ProjectStateSingleConfig,
    dep_graph: DependencyGraph,
    *,
    value_mode: PythonValueMode = PythonValueMode.PACKAGED_RUNTIME,
) -> PythonCodeGenerator:
    project_config = project_state.projectConfig
    python_target = get_python_codegen_target_with_type_guard(project_config)
    meta_code = None
    if python_target.generateMetadata:
        meta_code = build_python_meta_code(project_state, dep_graph)
    return PythonCodeGenerator(
        dep_graph,
        python_target.genCodePrefix,
        python_target.genCodeSuffix,
        value_mode=value_mode,
        meta_code=meta_code,
    )


class ProjectGenPythonCode(PythonCode):
    def __init__(
        self,
        dbe,
        code_files,
        binding: CodeFileBinding,
        lsp_writers,
        websocket_msg_handler,
        project_config_id: ID,
        dep_graph: DependencyGraph,
        code_generator: PythonCodeGenerator,
        ignored_type_errors_by_section: dict[ID, TypeErrorIgnoreState],
        *,
        initial_undefined_callable_sections: set[ID] | None = None,
        on_callable_symbols_resolved: Callable[[ID, set[ID]], Awaitable[None]]
        | None = None,
    ):
        super().__init__(dbe, code_files, binding, lsp_writers, websocket_msg_handler)
        self.project_config_id = project_config_id
        self.dep_graph = dep_graph
        self.code_generator = code_generator
        self.ignored_type_errors_by_section = ignored_type_errors_by_section
        self.latest_undefined_callable_sections = (
            set(initial_undefined_callable_sections)
            if initial_undefined_callable_sections
            else set()
        )
        self._on_callable_symbols_resolved = on_callable_symbols_resolved
        self.latest_diagnostics = SettaProjectConfigDiagnostics(
            projectConfigId=project_config_id,
            errors={},
            isGenCode=True,
        )
        code_files.register_binding(
            binding.canonical_path,
            RegisteredCodeFileBinding(
                section_id=GEN_CODE_SECTION_ID,
                variant_id=GEN_CODE_VARIANT_ID,
                project_config_id=project_config_id,
                access_mode=binding.access_mode,
            ),
        )

    def _clone_generator(self) -> PythonCodeGenerator:
        dep_graph_copy = copy.deepcopy(self.dep_graph)
        generator_copy = PythonCodeGenerator(
            dep_graph_copy,
            self.code_generator.gen_code_prefix,
            self.code_generator.gen_code_suffix,
            value_mode=self.code_generator.value_mode,
            meta_code=self.code_generator.meta_code,
        )
        generator_copy.generate_code()
        return generator_copy

    def _build_param_completion_context(
        self,
        sectionId: ID,
        paramInfoId: ID | None,
        fullText: str,
        position: int,
    ) -> tuple[str, int, int] | None:
        generator = self._clone_generator()
        dep_key = create_dep_key(sectionId, paramInfoId)
        start = generator.change_value(dep_key, fullText)
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
        self, sectionId: ID, paramInfoId: ID | None, fullText: str, position: int
    ) -> tuple[int, int] | None:
        dep_key = create_dep_key(sectionId, paramInfoId)
        start = self.code_generator.change_value(dep_key, fullText)
        await self.sync_lsp(self.code)
        if start is None:
            return None
        absolute_position = position + start
        line, col = position_to_line_col(self.code, absolute_position)
        return line, col

    async def text_field_completion(
        self, sectionId: ID, paramInfoId: ID | None, fullText: str, position: int
    ):
        context = self._build_param_completion_context(
            sectionId, paramInfoId, fullText, position
        )
        if context is None:
            return []
        code, line, col = context
        response = await self._request_completion_response(code, line, col)
        return process_completion_response(response)

    async def output_accessor_completion(
        self, sectionId: ID, fullText: str, position: int
    ):
        generator = self._clone_generator()
        dep_key = create_dep_key(sectionId)
        graph = generator.dep_graph.graph
        if dep_key not in graph:
            raise KeyError(f"Unknown section dependency: {sectionId}")
        section_path = graph[dep_key].full_path_name
        if fullText.strip() == C.EDGE_OUTPUT_BASE_LABEL:
            fullText = ""
            position = 0
        prefix = f"\n{GEN_CODE_INSTANCE_NAME}.{section_path}"
        code = f"{generator.code}{prefix}{fullText}"
        absolute_position = len(generator.code) + len(prefix) + position
        line, col = position_to_line_col(code, absolute_position)
        response = await self._request_completion_response(code, line, col)
        return process_completion_response(response)

    def build_edge_expression(
        self, project_state: ProjectStateSingleConfig, edge: Edge
    ) -> str:
        dep_key = create_dep_key(sectionId=edge.sourceSectionId)
        graph = self.dep_graph.graph
        if dep_key not in graph:
            raise KeyError(f"Unknown section dependency: {edge.sourceSectionId}")
        section_path = graph[dep_key].full_path_name
        core = project_state.sections[edge.sourceSectionId]
        _, _, source_impl = get_variant_base_and_effective_section_impl_with_type_guard(
            project_state, core, edge.sourceVariantId, BaseSectionWithParamsImpl
        )
        for port in source_impl.edgeOutputPorts:
            if port.id == edge.sourcePortId:
                return f"{GEN_CODE_INSTANCE_NAME}.{section_path}{port.accessor}"
        raise KeyError(
            f"Section {edge.sourceSectionId} missing output port {edge.sourcePortId}."
        )

    async def clear_text_field_completion(
        self, _sectionId: ID, _paramInfoId: ID | None
    ):
        return None

    async def set_callable(
        self,
        settings: SettingsState,
        project_state: ProjectStateSingleConfig,
        sectionId: ID,
        callableName: str,
        refetchParams: bool,
        *,
        on_before_mutation: Callable[[], None] | None = None,
    ) -> SetCallableResponse:
        current_callable = get_curr_section_callable_code_obj(project_state, sectionId)
        current_callable_id = current_callable.id if current_callable else None
        did_invoke_before_mutation = False

        def maybe_invoke_before_mutation() -> None:
            nonlocal did_invoke_before_mutation
            if did_invoke_before_mutation or on_before_mutation is None:
                return
            did_invoke_before_mutation = True
            on_before_mutation()

        if not refetchParams and callable_is_already_selected(
            project_state, sectionId, callableName
        ):
            return self._build_set_callable_response(
                project_state,
                sectionId,
                current_callable_id,
                SignatureHelpStatus.SKIPPED,
            )

        if callableName == "":
            maybe_invoke_before_mutation()
            set_curr_effective_section_impl_value(
                project_state,
                sectionId,
                CallableSectionImplArgsWithCallable(callable=None),
            )
            return self._build_set_callable_response(
                project_state, sectionId, None, SignatureHelpStatus.SKIPPED
            )

        prev_selected = callable_has_been_selected_before(
            project_state, sectionId, callableName
        )

        if prev_selected and not refetchParams:
            maybe_invoke_before_mutation()
            set_curr_effective_section_impl_value(
                project_state,
                sectionId,
                CallableSectionImplArgsWithCallable(callable=prev_selected),
            )
            return self._build_set_callable_response(
                project_state, sectionId, prev_selected, SignatureHelpStatus.SKIPPED
            )

        line_col = await self._insert_code_and_update_state(
            sectionId, None, callableName, len(callableName)
        )
        if line_col is None:
            return self._build_set_callable_response(
                project_state,
                sectionId,
                current_callable_id,
                SignatureHelpStatus.SKIPPED,
            )

        line, col = line_col
        col += 1  # put cursor inside parentheses
        response = None
        if self.lsp_writer is not None:
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

        result = (
            process_signature_help_response(settings, response)
            if response is not None
            else None
        )
        documentation = None
        codeObjs: list[Core] = []
        codeObjImplMap = {}
        lsp_status = SignatureHelpStatus.NO_MATCH
        if result is not None:
            documentation, codeObjs, codeObjImplMap = result
            lsp_status = SignatureHelpStatus.MATCHED

        maybe_invoke_before_mutation()
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

        if documentation is not None:
            set_effective_impl_value(
                callable_base_impl,
                callable_code_obj,
                callable_code_obj_variant,
                CodeCallableCodeObjImplArgsWithCallable(description=documentation),
            )

        if result is not None or not prev_selected:
            add_children_of_callable(
                project_state,
                sectionId,
                callable_code_obj.id,
                codeObjs,
                codeObjImplMap,
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
        return self._build_set_callable_response(
            project_state, sectionId, callable_code_obj.id, lsp_status
        )

    def _build_set_callable_response(
        self,
        project_state: ProjectStateSingleConfig,
        sectionId: ID,
        callable_id: ID | None,
        lsp_status: SignatureHelpStatus,
    ) -> SetCallableResponse:
        return SetCallableResponse(
            callableId=callable_id,
            childCodeObjs=self._collect_child_code_objs(
                project_state, sectionId, callable_id
            ),
            lspStatus=lsp_status,
        )

    def _collect_child_code_objs(
        self,
        project_state: ProjectStateSingleConfig,
        sectionId: ID,
        callable_id: ID | None,
    ) -> list[SetCallableChildCodeObj]:
        if callable_id is None:
            return []

        callable_impl = get_curr_effective_code_obj_impl_with_type_guard(
            project_state,
            sectionId,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        return [
            SetCallableChildCodeObj(
                codeObjId=child_id,
                name=project_state.codeObjs[child_id].name,
            )
            for child_id in callable_impl.children
        ]

    async def gen_code_prefix_completion(self, fullText, position):
        generator = self._clone_generator()
        generator.set_gen_code_prefix(fullText)
        line, col = position_to_line_col(generator.code, position)
        response = await self._request_completion_response(generator.code, line, col)
        return process_completion_response(response)

    async def gen_code_suffix_completion(self, fullText, position):
        generator = self._clone_generator()
        insertion_offset = generator.set_gen_code_suffix(fullText)
        absolute_position = position + insertion_offset
        line, col = position_to_line_col(generator.code, absolute_position)
        response = await self._request_completion_response(generator.code, line, col)
        return process_completion_response(response)

    async def type_check(self):
        await self.send_document_open_request(self.code)

    async def diagnostics_callback(
        self, lsp_response: LSPTypes.TextDocumentPublishDiagnosticsNotification
    ):
        params = lsp_response.params
        if self.lsp_writer.get_latest_version_number(self.uri) != params.version:
            return
        errors, undefined_callable_sections = (
            process_gen_code_diagnostics_with_undefined_symbols(
                params.diagnostics,
                self.code_generator,
                self.dep_graph,
                self.ignored_type_errors_by_section,
            )
        )
        resolved_sections: set[ID] = set()
        if self.latest_undefined_callable_sections:
            for section_id in self.latest_undefined_callable_sections:
                dep_key = create_dep_key(sectionId=section_id)
                if dep_key not in self.dep_graph.graph:
                    continue
                if section_id in undefined_callable_sections:
                    continue
                if section_id in errors and errors[section_id].callable:
                    continue
                resolved_sections.add(section_id)
        self.latest_undefined_callable_sections = undefined_callable_sections
        content = SettaProjectConfigDiagnostics(
            projectConfigId=self.project_config_id,
            errors=errors,
            isGenCode=True,
        )

        self.latest_diagnostics = content
        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)
        if resolved_sections and self._on_callable_symbols_resolved:
            await self._on_callable_symbols_resolved(
                self.project_config_id, resolved_sections
            )

    def get_gen_python_code_path(self):
        return self.binding.canonical_path

    def get_gen_python_meta_path(self):
        return self.binding.canonical_path.with_name(GEN_CODE_META_FILENAME)

    @property
    def code(self):
        return self.code_generator.code

    @property
    def generated_code(self) -> str:
        return self.code_generator.generated_code

    @property
    def meta_code(self) -> str | None:
        return self.code_generator.meta_code

    def write_meta_to_disk(self) -> bool:
        if self.meta_code is None:
            return False
        meta_path = self.get_gen_python_meta_path()
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        self.dbe.write(meta_path, self.meta_code)
        return True

    def write_to_folder(self, folder: Path):
        path = super().write_to_folder(self.code, folder)
        if self.meta_code is not None:
            meta_path = folder / GEN_CODE_META_FILENAME
            self.dbe.write(meta_path, self.meta_code)
        return path


class ProjectPythonCode(PythonCode):
    def __init__(
        self,
        dbe,
        code_files,
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
        super().__init__(dbe, code_files, binding, lsp_writers, websocket_msg_handler)
        self.sectionId = sectionId
        self.code = section_impl.code
        project_config = project_state.projectConfig
        variant_id = project_config.sectionVariantMap.get(sectionId)
        if variant_id is None:
            raise ValueError(
                f"Missing variant mapping for section {sectionId} in project config {project_config.id}"
            )
        code_files.register_binding(
            binding.canonical_path,
            RegisteredCodeFileBinding(
                section_id=sectionId,
                variant_id=variant_id,
                project_config_id=project_config.id,
                access_mode=binding.access_mode,
            ),
        )

    async def handle_external_reload(self, new_code: str) -> None:
        await super().handle_external_reload(new_code)
        await self.send_document_open_request(new_code)

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
        return process_completion_response(response)

    async def type_check(self):
        await self.send_document_open_request(self.code)

    async def diagnostics_callback(self, lsp_response):
        # TODO
        pass

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)


class ProjectBashCode(BashCode):
    def __init__(
        self,
        dbe,
        code_files,
        project_state: ProjectStateSingleConfig,
        sectionId,
    ):
        section_impl = get_curr_effective_section_impl(project_state, sectionId)
        if not isinstance(section_impl, CodeSectionImpl):
            raise TypeError
        binding = section_impl.codeFileBinding
        if binding is None:
            raise ValueError("Code section missing codeFileBinding")
        super().__init__(dbe, code_files, binding)
        self.sectionId = sectionId
        self.code = section_impl.code
        project_config = project_state.projectConfig
        variant_id = project_config.sectionVariantMap.get(sectionId)
        if variant_id is None:
            raise ValueError(
                f"Missing variant mapping for section {sectionId} in project config {project_config.id}"
            )
        code_files.register_binding(
            binding.canonical_path,
            RegisteredCodeFileBinding(
                section_id=sectionId,
                variant_id=variant_id,
                project_config_id=project_config.id,
                access_mode=binding.access_mode,
            ),
        )

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)


class ProjectBasicCode(Code):
    def __init__(
        self,
        dbe,
        code_files,
        project_state: ProjectStateSingleConfig,
        sectionId,
        code_language: CodeLanguage,
    ):
        section_impl = get_curr_effective_section_impl(project_state, sectionId)
        if not isinstance(section_impl, CodeSectionImpl):
            raise TypeError
        binding = section_impl.codeFileBinding
        if binding is None:
            raise ValueError("Code section missing codeFileBinding")
        super().__init__(dbe, code_files, binding)
        self.sectionId = sectionId
        self.code = section_impl.code
        self.code_language = code_language
        project_config = project_state.projectConfig
        variant_id = project_config.sectionVariantMap.get(sectionId)
        if variant_id is None:
            raise ValueError(
                f"Missing variant mapping for section {sectionId} in project config {project_config.id}"
            )
        code_files.register_binding(
            binding.canonical_path,
            RegisteredCodeFileBinding(
                section_id=sectionId,
                variant_id=variant_id,
                project_config_id=project_config.id,
                access_mode=binding.access_mode,
            ),
        )

    def get_extension(self):
        return CODE_LANGUAGE_EXTENSIONS[self.code_language]

    def get_run_command(self, path: Path):
        raise ValueError(f"Run is not supported for language {self.code_language}")

    def write_to_folder(self, folder):
        return super().write_to_folder(self.code, folder)
