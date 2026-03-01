import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, replace
from itertools import islice

from setta.code_gen.python.ast_utils import find_undefined_special_var_expressions
from setta.code_gen.utils import (
    GEN_CODE_INSTANCE_NAME,
    create_unique_name,
    sanitize_python_identifier,
)
from setta.secrets.password_store import read_password_store
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeObjType,
    ParameterPassingStyle,
)
from setta.types.dependency_key import (
    DependencyKeyType,
    create_dep_key,
)
from setta.types.dependency_value import (
    DependencyValueType,
    FileReadDependencyValue,
    LiteralDependencyValue,
)
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_for_read_with_type_guard,
    get_curr_effective_section_impl,
    get_variant_base_and_effective_code_obj_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    get_curr_meta_control_impl_with_type_guard,
    get_curr_section_callable_code_obj,
    get_curr_top_level_param_ids,
    get_meta_control_param_id,
)
from setta.types.id import ID
from setta.types.project_config import (
    CodeObjValueRepresentationMode,
    ResolvedSectionCodegenPolicy,
    SectionRepresentationMode,
    get_code_obj_value_policy,
    get_section_codegen_policy,
    resolve_code_obj_value_policy,
    resolve_section_codegen_policy,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseParentSectionImpl,
    BaseSectionImpl,
    ChatSectionImpl,
    ChatSectionState,
    DrawSectionImpl,
    ImageSectionImpl,
    PluginSectionImpl,
    PromptSectionImpl,
    SectionType,
    SpreadsheetSectionImpl,
    TaskBoardSectionImpl,
    TextBlockSectionImpl,
)
from setta.utils.constants import C
from setta.utils.utils import replace_at_positions

logger = logging.getLogger(__name__)


@dataclass
class Node(ABC):
    id: str
    name: str
    full_path_name: str
    type: str
    isTopLevel: bool
    deps: dict
    value: BaseDependencyValueUnion | None

    @property
    @abstractmethod
    def has_name_and_value(self) -> bool:
        pass


@dataclass
class SectionNode(Node):
    control_code_obj_type: CodeObjType | None = None
    control_code_obj_impl_id: ID | None = None
    control_value_representation: CodeObjValueRepresentationMode | None = None
    representation: SectionRepresentationMode = SectionRepresentationMode.expression
    include_in_codegen: bool = True

    @property
    def has_name_and_value(self) -> bool:
        return True


@dataclass
class ParamNode(Node):
    passing_style: ParameterPassingStyle
    code_obj_impl_id: ID | None = None
    has_secret: bool = False
    value_representation: CodeObjValueRepresentationMode = (
        CodeObjValueRepresentationMode.expression
    )
    include_in_codegen: bool = True

    @property
    def has_name_and_value(self):
        if not self.name:
            return False
        if self.type is CodeObjType.PasswordParam:
            if self.code_obj_impl_id is None:
                return False
            return self.has_secret
        if self.value is None:
            return False
        return self.value.payload != ""


@dataclass
class RenameReferenceChangedValue:
    depKey: BaseDependencyKeyUnion
    newValue: str


@dataclass(frozen=True)
class SectionExportContext:
    project_state: ProjectStateSingleConfig
    section_id: ID
    section_name: str
    section_impl: BaseSectionImpl
    full_path_name: str
    is_top_level: bool
    parent_node: Node | None
    idx: int | None
    dep_key: BaseDependencyKeyUnion
    codegen_policy: ResolvedSectionCodegenPolicy


SectionExporter = Callable[[SectionExportContext], None]


class DependencyGraph:
    def __init__(self, p: ProjectStateSingleConfig):
        self.section_exporters: dict[SectionType, SectionExporter] = {
            SectionType.Callable: self._export_callable_section,
            SectionType.Dict: self._export_dict_section,
            SectionType.ListRoot: self._export_parent_section,
            SectionType.Group: self._export_parent_section,
            SectionType.GlobalVariables: self._export_global_variables_section,
            SectionType.TextBlock: self._export_text_block_section,
            SectionType.Prompt: self._export_prompt_section,
            SectionType.Draw: self._export_draw_section,
            SectionType.Image: self._export_image_section,
            SectionType.Plugin: self._export_plugin_section,
            SectionType.MetaControl: self._export_meta_control_section,
            SectionType.Chat: self._export_chat_section,
            SectionType.TaskBoard: self._export_task_board_section,
            SectionType.Spreadsheet: self._export_spreadsheet_section,
        }
        self.section_policy = get_section_codegen_policy(p.projectConfig)
        self.code_obj_value_policy = get_code_obj_value_policy(p.projectConfig)
        self.password_secrets = read_password_store()
        self.construct_graph(p)

    def reset(self):
        self.graph: dict[BaseDependencyKeyUnion, Node] = {}
        self.full_path_name_to_dep_key: dict[str, BaseDependencyKeyUnion] = {}
        self.nodes_with_potential_refs: dict[
            BaseDependencyKeyUnion, dict[str, int]
        ] = {}

    def construct_graph(self, p: ProjectStateSingleConfig):
        self.reset()
        ids = list(p.projectConfig.topLevelSections.keys())
        self.export_sections(p, ids, isTopLevel=True)
        self.resolve_references()

    def export_sections(
        self,
        p: ProjectStateSingleConfig,
        ids: list[ID],
        isTopLevel=False,
        parent_node=None,
    ):
        deps = {}
        for idx, x in enumerate(ids):
            dep_key = self.export_section(p, x, isTopLevel, parent_node, idx)
            node = self.get_node(dep_key)
            if node:
                deps[dep_key] = node.has_name_and_value
        return deps

    def export_section(
        self,
        p: ProjectStateSingleConfig,
        id: ID,
        isTopLevel=False,
        parent_node: Node | None = None,
        idx: int | None = None,
    ):
        dep_key = create_dep_key(sectionId=id)
        section_node = self.get_node(dep_key)
        if not section_node:
            sectionImpl = get_curr_effective_section_impl(p, id)
            exporter = self.section_exporters.get(sectionImpl.type)
            if not exporter:
                return dep_key
            codegen_policy = resolve_section_codegen_policy(
                self.section_policy, id, sectionImpl.type
            )
            name = p.sections[id].name
            full_path_name = self.create_full_path_name(parent_node, idx, name)
            ctx = SectionExportContext(
                project_state=p,
                section_id=id,
                section_name=name,
                section_impl=sectionImpl,
                full_path_name=full_path_name,
                is_top_level=isTopLevel,
                parent_node=parent_node,
                idx=idx,
                dep_key=dep_key,
                codegen_policy=codegen_policy,
            )
            exporter(ctx)
        return dep_key

    def _export_callable_section(self, ctx: SectionExportContext):
        value, potential_refs = self.export_section_callable(
            ctx.project_state, ctx.section_id
        )
        if potential_refs:
            self.nodes_with_potential_refs[ctx.dep_key] = potential_refs
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=ctx.section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(value) if value is not None else None,
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        node.deps = self.export_section_params(
            ctx.project_state,
            ctx.section_id,
            parent_node=node,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_parent_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, BaseParentSectionImpl):
            return
        children: list[ID] = []
        for child_id in section_impl.children:
            child_impl = get_curr_effective_section_impl(ctx.project_state, child_id)
            if child_impl.type in self.section_exporters:
                children.append(child_id)
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=None,
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        node.deps = self.export_sections(ctx.project_state, children, parent_node=node)
        self.add_to_graph(ctx.dep_key, node)

    def _export_dict_section(self, ctx: SectionExportContext):
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=ctx.section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=None,
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        node.deps = self.export_section_params(
            ctx.project_state,
            ctx.section_id,
            parent_node=node,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_global_variables_section(self, ctx: SectionExportContext):
        self.export_section_params(
            ctx.project_state,
            ctx.section_id,
            isTopLevel=True,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )

    def _export_text_block_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, TextBlockSectionImpl):
            return
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(section_impl.text),
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_plugin_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, PluginSectionImpl):
            return
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(
                self._build_plugin_section_literal_payload(section_impl.data)
            ),
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _build_plugin_section_literal_payload(self, data: object) -> str:
        normalized = self._normalize_plugin_section_data_for_literal(data)
        return repr(normalized)

    def _normalize_plugin_section_data_for_literal(self, value: object) -> object:
        if isinstance(value, dict):
            return {
                str(key): self._normalize_plugin_section_data_for_literal(value[key])
                for key in sorted(value.keys(), key=str)
            }
        if isinstance(value, list):
            return [
                self._normalize_plugin_section_data_for_literal(item) for item in value
            ]
        return value

    def _export_prompt_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, PromptSectionImpl):
            return
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(section_impl.renderedText),
            deps={},
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_chat_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, ChatSectionImpl):
            return
        state_payload = ChatSectionState(
            messages=section_impl.messages,
            inputText=section_impl.inputText,
            waitingForResponse=section_impl.waitingForResponse,
            toolCallArguments=section_impl.toolCallArguments,
            activeBranchId=section_impl.activeBranchId,
            branches=section_impl.branches,
        )
        representation = ctx.codegen_policy.representation
        effective_representation = representation
        state_literal = LiteralDependencyValue(
            repr(state_payload.model_dump(mode="json"))
        )
        dependency_value: BaseDependencyValueUnion | None
        if representation is SectionRepresentationMode.file_read:
            if section_impl.chatId is None:
                effective_representation = SectionRepresentationMode.expression
                dependency_value = state_literal
            else:
                chat_path = (
                    C.SETTA_FILES_FOLDER / "chats" / f"{section_impl.chatId}.json"
                )
                dependency_value = FileReadDependencyValue(str(chat_path))
        elif representation is SectionRepresentationMode.file_path:
            if section_impl.chatId is None:
                effective_representation = SectionRepresentationMode.expression
                dependency_value = state_literal
            else:
                chat_path = (
                    C.SETTA_FILES_FOLDER / "chats" / f"{section_impl.chatId}.json"
                )
                dependency_value = LiteralDependencyValue(str(chat_path))
        else:
            dependency_value = state_literal
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=dependency_value,
            deps={},
            representation=effective_representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_draw_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, DrawSectionImpl):
            return
        representation = ctx.codegen_policy.representation
        effective_representation = representation
        if representation is SectionRepresentationMode.file_read:
            if not section_impl.renderedImagePath:
                effective_representation = SectionRepresentationMode.expression
                dependency_value = LiteralDependencyValue("None")
            else:
                dependency_value = FileReadDependencyValue(
                    section_impl.renderedImagePath
                )
        elif representation is SectionRepresentationMode.file_path:
            if not section_impl.renderedImagePath:
                effective_representation = SectionRepresentationMode.expression
                dependency_value = LiteralDependencyValue("None")
            else:
                dependency_value = LiteralDependencyValue(
                    section_impl.renderedImagePath
                )
        else:
            raise ValueError(
                f"Unsupported representation {representation.value} for Draw section {ctx.section_id}"
            )
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=dependency_value,
            deps={},
            representation=effective_representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_image_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, ImageSectionImpl):
            return
        representation = ctx.codegen_policy.representation
        effective_representation = representation
        if representation is SectionRepresentationMode.file_read:
            if not section_impl.imagePath:
                effective_representation = SectionRepresentationMode.expression
                dependency_value = LiteralDependencyValue("None")
            else:
                dependency_value = FileReadDependencyValue(section_impl.imagePath)
        elif representation is SectionRepresentationMode.file_path:
            if not section_impl.imagePath:
                effective_representation = SectionRepresentationMode.expression
                dependency_value = LiteralDependencyValue("None")
            else:
                dependency_value = LiteralDependencyValue(section_impl.imagePath)
        else:
            raise ValueError(
                f"Unsupported representation {representation.value} for Image section {ctx.section_id}"
            )
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=dependency_value,
            deps={},
            representation=effective_representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_task_board_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, TaskBoardSectionImpl):
            return
        payload = {
            "viewMode": section_impl.viewMode.value,
            "columns": [
                {
                    "id": str(column.id),
                    "name": column.name,
                    "color": column.color,
                    "sortIndex": column.sortIndex,
                }
                for column in section_impl.columns
            ],
            "tasks": [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "description": task.description,
                    "completed": task.completed,
                    "columnId": str(task.columnId)
                    if task.columnId is not None
                    else None,
                    "dueDateIso": task.dueDateIso,
                    "recurrence": task.recurrence.value,
                    "recurrenceDays": [day.value for day in task.recurrenceDays],
                    "recurrenceMonths": [
                        month.value for month in task.recurrenceMonths
                    ],
                    "recurrenceYears": list(task.recurrenceYears),
                    "sortIndex": task.sortIndex,
                }
                for task in section_impl.tasks
            ],
        }
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(repr(payload)),
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_spreadsheet_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, SpreadsheetSectionImpl):
            return
        payload = {
            "filePath": section_impl.filePath,
            "activeSheet": section_impl.activeSheet,
            "readOnly": section_impl.readOnly,
            "showRowNumbers": section_impl.showRowNumbers,
            "density": section_impl.density.value,
            "autoReloadOnExternalChange": section_impl.autoReloadOnExternalChange,
        }
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(repr(payload)),
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=ctx.codegen_policy.include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_meta_control_section(self, ctx: SectionExportContext):
        section_impl = get_curr_meta_control_impl_with_type_guard(
            ctx.project_state, ctx.section_id
        )
        control_param_id = get_meta_control_param_id(ctx.project_state, ctx.section_id)
        variant_id = section_impl.codeObjVariantMap[control_param_id]
        _, _, control_impl = (
            get_variant_base_and_effective_code_obj_impl_with_type_guard(
                ctx.project_state,
                ctx.project_state.codeObjs[control_param_id],
                variant_id,
                BaseParamCodeObjImpl,
            )
        )
        control_value = None
        if isinstance(control_impl, BaseChildlessCodeObjImpl):
            control_value = LiteralDependencyValue(control_impl.value)
        control_value_representation = resolve_code_obj_value_policy(
            self.code_obj_value_policy,
            control_param_id,
            control_impl.type,
        ).representation
        include_in_codegen = ctx.codegen_policy.include_in_codegen
        meta_control_allowlist = self.section_policy.metaControlAllowlist
        if (
            meta_control_allowlist is not None
            and control_impl.type not in meta_control_allowlist
        ):
            include_in_codegen = False
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=control_value,
            control_code_obj_type=control_impl.type,
            control_code_obj_impl_id=control_impl.id,
            control_value_representation=control_value_representation,
            deps={},
            representation=ctx.codegen_policy.representation,
            include_in_codegen=include_in_codegen,
        )
        self.add_to_graph(ctx.dep_key, node)

    def export_section_callable(self, p: ProjectStateSingleConfig, sectionId: ID):
        callable = get_curr_section_callable_code_obj(p, sectionId)
        if callable:
            potential_refs = find_undefined_special_var_expressions(
                callable.name, GEN_CODE_INSTANCE_NAME, keep_attr_only=True
            )
            return callable.name, potential_refs
        return None, None

    def export_section_params(
        self,
        p: ProjectStateSingleConfig,
        sectionId: ID,
        parent_node: Node | None = None,
        isTopLevel=False,
        include_in_codegen: bool = True,
    ):
        paramIds = get_curr_top_level_param_ids(p, sectionId)
        return self.export_params(
            p,
            sectionId,
            paramIds,
            parent_node=parent_node,
            isTopLevel=isTopLevel,
            include_in_codegen=include_in_codegen,
        )

    def export_params(
        self,
        p: ProjectStateSingleConfig,
        sectionId: ID,
        paramIds: list[ID],
        parent_node: Node | None = None,
        isTopLevel=False,
        include_in_codegen: bool = True,
    ):
        output_deps = {}
        for idx, pid in enumerate(paramIds):
            dep_key = create_dep_key(sectionId=sectionId, codeObjId=pid)
            param_node = self.get_node(dep_key)
            if not param_node:
                code_obj_impl = get_curr_effective_code_obj_impl_for_read_with_type_guard(
                    p, sectionId, pid, BaseParamCodeObjImpl
                )
                name = p.codeObjs[pid].name
                raw_value = ""
                if isinstance(code_obj_impl, BaseChildlessCodeObjImpl):
                    raw_value = code_obj_impl.value
                full_path_name = self.create_full_path_name(parent_node, idx, name)
                potential_refs = find_undefined_special_var_expressions(
                    raw_value, GEN_CODE_INSTANCE_NAME, keep_attr_only=True
                )
                if potential_refs:
                    self.nodes_with_potential_refs[dep_key] = potential_refs
                value_representation = resolve_code_obj_value_policy(
                    self.code_obj_value_policy,
                    pid,
                    code_obj_impl.type,
                ).representation
                has_secret = False
                if code_obj_impl.type is CodeObjType.PasswordParam:
                    secret_key = str(code_obj_impl.id)
                    if secret_key in self.password_secrets:
                        has_secret = self.password_secrets[secret_key] != ""
                param_node = ParamNode(
                    id=pid,
                    name=name,
                    full_path_name=full_path_name,
                    type=code_obj_impl.type,
                    isTopLevel=isTopLevel,
                    value=LiteralDependencyValue(raw_value)
                    if isinstance(code_obj_impl, BaseChildlessCodeObjImpl)
                    else None,
                    passing_style=code_obj_impl.passingStyle,
                    code_obj_impl_id=code_obj_impl.id,
                    has_secret=has_secret,
                    value_representation=value_representation,
                    include_in_codegen=include_in_codegen,
                    deps={},
                )
                if isinstance(code_obj_impl, BaseParentCodeObjImpl):
                    param_node.deps = self.export_params(
                        p,
                        sectionId,
                        code_obj_impl.children,
                        parent_node=param_node,
                        include_in_codegen=include_in_codegen,
                    )
                self.add_to_graph(dep_key, param_node)
            output_deps[dep_key] = param_node.has_name_and_value
        return output_deps

    def add_to_graph(self, dep_key: BaseDependencyKeyUnion, node: Node):
        self.graph[dep_key] = node
        self.full_path_name_to_dep_key[node.full_path_name] = dep_key

    def change_value(self, dep_key: BaseDependencyKeyUnion, value):
        if dep_key not in self.graph:
            sample_sections = list(
                islice(
                    (
                        key.sectionId
                        for key in self.graph
                        if key.type is DependencyKeyType.Section
                    ),
                    5,
                )
            )
            logger.error(
                "DependencyGraph change_value missing dep_key=%s graph_size=%s sample_section_ids=%s",
                dep_key,
                len(self.graph),
                sample_sections,
            )
            raise KeyError(dep_key)
        node = self.graph[dep_key]
        node.value = self._coerce_dependency_value(value)
        is_used = node.has_name_and_value
        for other_node in self.graph.values():
            if dep_key in other_node.deps:
                other_node.deps[dep_key] = is_used

    def get_node(self, dep_key: BaseDependencyKeyUnion):
        return self.graph.get(dep_key)

    def create_full_path_name(
        self, parent_node: Node | None, idx: int | None, name: str
    ):
        if not parent_node:
            return sanitize_python_identifier(name)
        if parent_node.type == SectionType.ListRoot:
            return f"{parent_node.full_path_name}__{idx}"
        elif (
            parent_node.type == SectionType.Callable
            or parent_node.type == SectionType.Group
            or parent_node.type == SectionType.Dict
            or parent_node.type == CodeObjType.NestedParam
        ):
            return create_unique_name(
                f"{parent_node.full_path_name}__{sanitize_python_identifier(name)}",
                self.full_path_name_to_dep_key,
            )

        return sanitize_python_identifier(name)

    def resolve_references(self):
        """Resolve all potential references and update dependencies."""
        for dep_key, potential_refs in self.nodes_with_potential_refs.items():
            node = self.graph[dep_key]
            if node.value is None or node.value.type is not DependencyValueType.Literal:
                continue
            for ref in potential_refs.keys():
                if ref in self.full_path_name_to_dep_key:
                    # Found a reference, add it to dependencies if not already there
                    target_key = self.full_path_name_to_dep_key[ref]
                    target_node = self.graph[target_key]
                    node.deps[target_key] = target_node.has_name_and_value

    # compares with "previous" dep graph to find nodes that have been renamed
    # and then changes the values of nodes that contain those old names
    def rename_references(
        self, old_dep_graph: "DependencyGraph"
    ) -> list[RenameReferenceChangedValue]:
        renamings: dict[BaseDependencyKeyUnion, tuple[str, str]] = {}
        for k, v in old_dep_graph.graph.items():
            node = self.get_node(k)
            if not node:
                continue
            if v.full_path_name != node.full_path_name:
                renamings[k] = (v.full_path_name, node.full_path_name)

        changed_node_values: list[RenameReferenceChangedValue] = []
        for k, v in self.nodes_with_potential_refs.items():
            replacements = []
            for ref, location in v.items():
                dep_key = old_dep_graph.full_path_name_to_dep_key.get(ref)
                if not dep_key:
                    continue
                details = renamings.get(dep_key)
                if details:
                    old_name, new_name = details
                    replacements.append((location, old_name, new_name))
            if replacements:
                node = self.get_node(k)
                if not node:
                    continue
                literal_value = node.value
                if (
                    literal_value is None
                    or literal_value.type is not DependencyValueType.Literal
                ):
                    continue
                new_payload, positions = replace_at_positions(
                    literal_value.payload, replacements, return_positions=True
                )
                node.value = replace(
                    literal_value,
                    payload=new_payload,
                )
                self.nodes_with_potential_refs[k] = {
                    name: position for position, name in positions
                }
                changed_node_values.append(
                    RenameReferenceChangedValue(
                        depKey=k,
                        newValue=node.value.payload if node.value else "",
                    )
                )

        self.resolve_references()
        return changed_node_values

    def _coerce_dependency_value(
        self, value: BaseDependencyValueUnion | str | None
    ) -> BaseDependencyValueUnion | None:
        if value is None:
            return None
        if isinstance(value, BaseDependencyValueUnion):
            return value
        return LiteralDependencyValue(value)
