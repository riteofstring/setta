from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, replace

from setta.code_gen.python.ast_utils import find_undefined_special_var_expressions
from setta.code_gen.utils import (
    GEN_CODE_INSTANCE_NAME,
    create_unique_name,
    sanitize_name,
)
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeObjType,
    ParameterPassingStyle,
)
from setta.types.dependency_key import (
    create_dep_key,
)
from setta.types.dependency_value import (
    Base64DependencyValue,
    DependencyValueType,
    LiteralDependencyValue,
)
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
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
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseParentSectionImpl,
    BaseSectionImpl,
    ChatSectionImpl,
    ChatSectionState,
    DrawSectionImpl,
    PromptSectionImpl,
    SectionType,
    TextBlockSectionImpl,
)
from setta.utils.utils import replace_at_positions


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

    @property
    def has_name_and_value(self) -> bool:
        return True


@dataclass
class ParamNode(Node):
    passing_style: ParameterPassingStyle

    @property
    def has_name_and_value(self):
        if not self.name:
            return False
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
            SectionType.MetaControl: self._export_meta_control_section,
            SectionType.Chat: self._export_chat_section,
        }
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
        )
        node.deps = self.export_section_params(
            ctx.project_state, ctx.section_id, parent_node=node
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
        )
        node.deps = self.export_section_params(
            ctx.project_state, ctx.section_id, parent_node=node
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_global_variables_section(self, ctx: SectionExportContext):
        self.export_section_params(ctx.project_state, ctx.section_id, isTopLevel=True)

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
        )
        self.add_to_graph(ctx.dep_key, node)

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
        )
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=LiteralDependencyValue(state_payload.model_dump_json()),
            deps={},
        )
        self.add_to_graph(ctx.dep_key, node)

    def _export_draw_section(self, ctx: SectionExportContext):
        section_impl = ctx.section_impl
        if not isinstance(section_impl, DrawSectionImpl):
            return
        rendered_value = section_impl.renderedValue
        dependency_value = (
            Base64DependencyValue(rendered_value) if rendered_value else None
        )
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=dependency_value,
            deps={},
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
        node = SectionNode(
            id=ctx.section_id,
            name=ctx.section_name,
            full_path_name=ctx.full_path_name,
            type=section_impl.type,
            isTopLevel=ctx.is_top_level,
            value=control_value,
            control_code_obj_type=control_impl.type,
            deps={},
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
    ):
        paramIds = get_curr_top_level_param_ids(p, sectionId)
        return self.export_params(
            p,
            sectionId,
            paramIds,
            parent_node=parent_node,
            isTopLevel=isTopLevel,
        )

    def export_params(
        self,
        p: ProjectStateSingleConfig,
        sectionId: ID,
        paramIds: list[ID],
        parent_node: Node | None = None,
        isTopLevel=False,
    ):
        output_deps = {}
        for idx, pid in enumerate(paramIds):
            dep_key = create_dep_key(sectionId=sectionId, codeObjId=pid)
            param_node = self.get_node(dep_key)
            if not param_node:
                code_obj_impl = get_curr_effective_code_obj_impl_with_type_guard(
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
                    deps={},
                )
                if isinstance(code_obj_impl, BaseParentCodeObjImpl):
                    param_node.deps = self.export_params(
                        p, sectionId, code_obj_impl.children, parent_node=param_node
                    )
                self.add_to_graph(dep_key, param_node)
            output_deps[dep_key] = param_node.has_name_and_value
        return output_deps

    def add_to_graph(self, dep_key: BaseDependencyKeyUnion, node: Node):
        self.graph[dep_key] = node
        self.full_path_name_to_dep_key[node.full_path_name] = dep_key

    def change_value(self, dep_key: BaseDependencyKeyUnion, value):
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
            return sanitize_name(name)
        if parent_node.type == SectionType.ListRoot:
            return f"{parent_node.full_path_name}__{idx}"
        elif (
            parent_node.type == SectionType.Callable
            or parent_node.type == SectionType.Group
            or parent_node.type == SectionType.Dict
            or parent_node.type == CodeObjType.NestedParam
        ):
            return create_unique_name(
                f"{parent_node.full_path_name}__{sanitize_name(name)}",
                self.full_path_name_to_dep_key,
            )

        return sanitize_name(name)

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
