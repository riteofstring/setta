import copy
import math
import re
from typing import assert_never

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import (
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeObjType,
)
from setta.types.core import (
    Core,
    Layering,
    compute_initial_default_layering,
    compute_initial_nonPresetImpls,
    get_default_section_core_name,
)
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
    create_section_impl,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjImplUnion,
    BaseParamCodeObjImplUnion,
    BaseParentCodeObjImplUnion,
    BaseSectionImplUnion,
    BaseSectionWithParamsImplUnion,
)
from setta.types.impl_helpers import (
    update_impl_layerings,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.section_impls import (
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    DictSectionImpl,
    ListRootSectionImpl,
    SectionSize,
    SectionType,
)
from setta.types.simplified_states import Position
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.utils import insert_into_array


class ProjectNotFound(Exception):
    pass


class ProjectNameTaken(Exception):
    pass


def convert_backend_to_single_config(p: ProjectStateBackend, projectConfigId: str):
    project_config = p.projectConfigs[projectConfigId]

    # Collectors for all the IDs we need
    section_ids: set[str] = set()
    section_impl_ids: set[str] = set()
    section_impl_layering_ids: set[str] = set()
    code_obj_ids: set[str] = set()
    code_obj_impl_ids: set[str] = set()
    code_obj_impl_layering_ids: set[str] = set()

    # Start with top-level sections from project config
    sections_to_process: set[str] = set(project_config.topLevelSections.keys())
    code_objs_to_process: set[str] = set()

    # Process sections recursively
    while sections_to_process:
        section_id = sections_to_process.pop()
        if section_id in section_ids:
            continue

        section_ids.add(section_id)
        section = p.sections[section_id]

        for impl_layering_id in section.implLayerings:
            if impl_layering_id in section_impl_layering_ids:
                continue
            section_impl_layering_ids.add(impl_layering_id)
            impl_layering = p.sectionImplLayerings[impl_layering_id]
            section_impl_ids.add(impl_layering.impl)
            section_impl_ids.update(impl_layering.nonPresetImpls)
            impl = p.sectionImpls[impl_layering.impl]
            effective_impl = get_effective_impl(impl, section, impl_layering)

            if isinstance(effective_impl, BaseParentSectionImpl):
                # Add child sections to process list
                sections_to_process.update(effective_impl.children)
            elif isinstance(effective_impl, BaseSectionWithParamsImpl):
                code_objs_to_process.update(effective_impl.codeObjImplLayeringMap)

    # Process code_objs recursively
    while code_objs_to_process:
        obj_id = code_objs_to_process.pop()
        if obj_id in code_obj_ids:
            continue

        code_obj_ids.add(obj_id)
        obj = p.codeObjs[obj_id]

        for impl_layering_id in obj.implLayerings:
            if impl_layering_id in code_obj_impl_layering_ids:
                continue
            code_obj_impl_layering_ids.add(impl_layering_id)
            impl_layering = p.codeObjImplLayerings[impl_layering_id]
            code_obj_impl_ids.add(impl_layering.impl)
            code_obj_impl_ids.update(impl_layering.nonPresetImpls)
            base_impl = p.codeObjImpls[impl_layering.impl]
            effective_impl = get_effective_impl(base_impl, obj, impl_layering)
            if isinstance(effective_impl, BaseParentCodeObjImpl):
                code_objs_to_process.update(effective_impl.children)

    # Build the sliced state
    return ProjectStateSingleConfig(
        sections={x: p.sections[x] for x in section_ids},
        sectionImpls={x: p.sectionImpls[x] for x in section_impl_ids},
        sectionImplLayerings={
            x: p.sectionImplLayerings[x] for x in section_impl_layering_ids
        },
        codeObjs={x: p.codeObjs[x] for x in code_obj_ids},
        codeObjImpls={x: p.codeObjImpls[x] for x in code_obj_impl_ids},
        codeObjImplLayerings={
            x: p.codeObjImplLayerings[x] for x in code_obj_impl_layering_ids
        },
        projectConfig=project_config,
        modCount=p.modCount,
    )


def merge_single_config_into_backend(
    x: ProjectStateBackend, config: ProjectStateSingleConfig
):
    return ProjectStateBackend(
        sections={**x.sections, **config.sections},
        sectionImpls={**x.sectionImpls, **config.sectionImpls},
        sectionImplLayerings={**x.sectionImplLayerings, **config.sectionImplLayerings},
        codeObjs={**x.codeObjs, **config.codeObjs},
        codeObjImpls={**x.codeObjImpls, **config.codeObjImpls},
        codeObjImplLayerings={**x.codeObjImplLayerings, **config.codeObjImplLayerings},
        projectConfigs={
            **x.projectConfigs,
            config.projectConfig.id: config.projectConfig,
        },
        defaultProjectConfigId=x.defaultProjectConfigId,
        modCount=config.modCount,
    )


def get_effective_section_impl(
    p: ProjectStateSingleConfig,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
):
    if section_impl is None:
        if section_id is None:
            raise ValueError("Either section_id or section_impl must be provided")
        impl_layering = get_section_impl_layering(p, section_id)
        base_impl = p.sectionImpls[impl_layering.impl]
        return get_effective_impl(base_impl, p.sections[section_id], impl_layering)
    return section_impl


def get_section_impl_layering(
    p: ProjectStateSingleConfig,
    section_id: str,
):
    impl_layering_id = p.projectConfig.sectionImplLayeringMap[section_id]
    return p.sectionImplLayerings[impl_layering_id]


def get_section_base_impl(
    p: ProjectStateSingleConfig,
    section_id: str,
):
    layering = get_section_impl_layering(p, section_id)
    return p.sectionImpls[layering.impl]


def get_section_callable(
    p: ProjectStateSingleConfig,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
):
    section_impl = get_effective_section_impl(p, section_id, section_impl)
    if isinstance(section_impl, CallableSectionImpl):
        if section_impl.callable:
            return p.codeObjs[section_impl.callable]
        return None
    raise TypeError


def get_section_children_ids(
    p: ProjectStateSingleConfig,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
):
    section_impl = get_effective_section_impl(p, section_id, section_impl)
    if isinstance(section_impl, BaseParentSectionImpl):
        return section_impl.children
    raise TypeError


def get_top_level_param_ids(
    p: ProjectStateSingleConfig,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
) -> list[str]:
    section_impl = get_effective_section_impl(p, section_id, section_impl)
    if isinstance(section_impl, CallableSectionImpl):
        callable = get_section_callable(p, section_impl=section_impl)
        if not callable:
            return []
        code_obj_impl = get_effective_code_obj_impl(
            p, callable.id, section_impl=section_impl
        )
        if isinstance(code_obj_impl, CodeCallableCodeObjImpl):
            return code_obj_impl.children
    elif isinstance(section_impl, DictSectionImpl):
        return section_impl.topLevelParamIds
    raise TypeError


def get_code_obj_impl_layering(
    p: ProjectStateSingleConfig,
    codeObjId: str,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
):
    section_impl = get_effective_section_impl(p, section_id, section_impl)
    if isinstance(section_impl, BaseSectionWithParamsImpl):
        code_obj_impl_layering_id = section_impl.codeObjImplLayeringMap[codeObjId]
        code_obj_impl_layering = p.codeObjImplLayerings[code_obj_impl_layering_id]
        return code_obj_impl_layering
    raise TypeError


def get_effective_code_obj_impl(
    p: ProjectStateSingleConfig,
    codeObjId: str,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
):
    section_impl = get_effective_section_impl(p, section_id, section_impl)
    if isinstance(section_impl, BaseSectionWithParamsImpl):
        code_obj_impl_layering = get_code_obj_impl_layering(
            p, codeObjId, section_impl=section_impl
        )
        base_impl = p.codeObjImpls[code_obj_impl_layering.impl]
        code_obj_impl = get_effective_impl(
            base_impl, p.codeObjs[codeObjId], code_obj_impl_layering
        )
        return code_obj_impl
    raise TypeError


def get_code_obj_children_ids(
    p: ProjectStateSingleConfig,
    codeObjId: str,
    section_id: str | None = None,
    section_impl: BaseSectionImplUnion | None = None,
) -> list[str]:
    code_obj_impl = get_effective_code_obj_impl(p, codeObjId, section_id, section_impl)
    if isinstance(code_obj_impl, BaseParentCodeObjImpl):
        return code_obj_impl.children
    return []


def get_section_path_full_name(p: ProjectStateSingleConfig, section_id: str):
    section_impl = get_effective_section_impl(p, section_id)
    parent_id = section_impl.parentId
    if not parent_id:
        return p.sections[section_id].name

    child_id = section_id
    output = ""
    while parent_id:
        if isinstance(section_impl, ListRootSectionImpl):
            idx = get_section_children_ids(p, parent_id).index(section_id)
            output = f"[{idx}]{output}"
        else:
            child_name = p.sections[child_id].name
            output = f'["{child_name}"]{output}'

        child_id = parent_id
        parent_id = get_effective_section_impl(p, parent_id).parentId

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def callable_is_already_selected(
    p: ProjectStateSingleConfig, sectionId: str, callableName: str
):
    selected_item = get_section_callable(p, sectionId)
    return selected_item and selected_item.name == callableName


def callable_has_been_selected_before(
    p: ProjectStateSingleConfig, sectionId: str, callableName: str
):
    section_impl = get_effective_section_impl(p, sectionId)
    if isinstance(section_impl, CallableSectionImpl):
        for c in section_impl.codeObjImplLayeringMap.keys():
            if p.codeObjs[c].name == callableName:
                return c
    return None


def add_code_obj(
    p: ProjectStateSingleConfig,
    section_id: str,
    code_obj: Core,
    code_obj_impl: BaseCodeObjImplUnion,
):
    section_layering = get_section_impl_layering(p, section_id)
    base_section_impl = p.sectionImpls[section_layering.impl]
    section_core = p.sections[section_id]
    if not (isinstance(base_section_impl, BaseSectionWithParamsImplUnion)):
        raise TypeError
    code_obj_impl_layering = Layering(
        impl=code_obj_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_obj_impl),
    )
    code_obj.implLayerings.append(code_obj_impl_layering.id)
    if not code_obj.defaultImplLayering:
        code_obj.defaultImplLayering = code_obj_impl_layering.id
    p.codeObjs[code_obj.id] = code_obj
    p.codeObjImpls[code_obj_impl.id] = code_obj_impl
    p.codeObjImplLayerings[code_obj_impl_layering.id] = code_obj_impl_layering

    set_effective_impl_value(
        base_section_impl,
        section_core,
        section_layering,
        {
            "codeObjImplLayeringMap": get_code_obj_impl_layering_map_update_fn(
                {code_obj.id: code_obj_impl_layering.id}
            )
        },
    )
    return code_obj_impl_layering


def add_children_of_callable(
    p: ProjectStateSingleConfig,
    section_id: str,
    callable_id: str,
    new_params: list[Core],
    new_param_impl_map: dict[str, BaseParamCodeObjImplUnion],
):
    callable_code_obj_layering = get_code_obj_impl_layering(p, callable_id, section_id)
    callable_code_obj_impl = get_effective_impl(
        p.codeObjImpls[callable_code_obj_layering.impl],
        p.codeObjs[callable_id],
        callable_code_obj_layering,
    )
    if not isinstance(callable_code_obj_impl, CodeCallableCodeObjImpl):
        raise TypeError
    existing_param_core: dict[str, Core] = {}
    for c in callable_code_obj_impl.children:
        match = p.codeObjs[c]
        existing_param_core[match.name] = match

    param_ids_in_order = []
    section_impl = get_effective_section_impl(p, section_id)
    if not isinstance(section_impl, CallableSectionImpl):
        raise TypeError
    for new_param in new_params:
        existing = existing_param_core.get(new_param.name)
        new_param_impl = new_param_impl_map[new_param.id]
        if existing:
            update_impl_layerings(p, existing.implLayerings, new_param_impl)
            param_ids_in_order.append(existing.id)
        else:
            add_code_obj(p, section_id, new_param, new_param_impl)
            param_ids_in_order.append(new_param.id)

    base_impl = p.codeObjImpls[callable_code_obj_layering.impl]
    code_obj_core = p.codeObjs[callable_id]
    if isinstance(base_impl, BaseParentCodeObjImplUnion):
        set_effective_impl_value(
            base_impl,
            code_obj_core,
            callable_code_obj_layering,
            {"children": param_ids_in_order},
        )


def set_param_entered_value(
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramId: str,
    value: str,
):
    code_obj_impl_layering = get_code_obj_impl_layering(p, paramId, sectionId)
    base_impl = (p.codeObjImpls[code_obj_impl_layering.impl],)
    code_obj_core = p.codeObjs[paramId]
    if isinstance(base_impl, BaseChildlessCodeObjImplUnion):
        set_effective_impl_value(
            base_impl,
            code_obj_core,
            code_obj_impl_layering,
            {"value": value},
        )
    raise TypeError


def get_top_level_sections(p: ProjectStateSingleConfig):
    output: dict[str, Core] = {}
    projectConfig = p.projectConfig
    for c in projectConfig.topLevelSections.keys():
        output[c] = p.sections[c]
    return output


def get_children_of_callable(p: ProjectStateSingleConfig, sectionId: str):
    param_ids = get_top_level_param_ids(p, sectionId)
    output: list[tuple[Core, BaseParamCodeObjImpl]] = []
    for x in param_ids:
        codeObj = p.codeObjs[x]
        codeObjImpl = get_effective_code_obj_impl(p, sectionId, x)
        if not isinstance(codeObjImpl, BaseParamCodeObjImpl):
            raise TypeError
        output.append((codeObj, codeObjImpl))
    return output


def confirm_config_name(p: ProjectStateBackend, projectConfigName: str):
    for projectConfigId, config in p.projectConfigs.items():
        if projectConfigName == config.name:
            return projectConfigId
    raise ProjectNotFound


def set_project_config_name(p: ProjectStateBackend, projectConfigId: str, newName: str):
    for k, v in p.projectConfigs.items():
        if k != projectConfigId and v.name == newName:
            raise ProjectNameTaken(f"{newName} is already taken")
    p.projectConfigs[projectConfigId].name = newName


def create_section(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    impl_type: SectionType,
    impl_overrides: dict | None = None,
    core_overrides: dict | None = None,
):
    impl = create_section_impl(
        impl_type,
        get_user_default_section_from_settings(settings, impl_type),
        impl_overrides,
    )
    layering = Layering(
        impl=impl.id, nonPresetImpls=compute_initial_nonPresetImpls(impl)
    )
    if not core_overrides:
        core_overrides = {}
    core = Core(
        name=get_default_section_core_name(impl_type),
        **compute_initial_default_layering(layering),
        **core_overrides,
    )
    p.projectConfig.sectionImplLayeringMap[core.id] = layering.id
    p.sections[core.id] = core
    p.sectionImpls[impl.id] = impl
    p.sectionImplLayerings[layering.id] = layering

    return core.id


def create_top_level_section(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    impl_type: SectionType,
    position: Position,
    impl_overrides: dict | None = None,
    core_overrides: dict | None = None,
):
    sectionId = create_section(settings, p, impl_type, impl_overrides, core_overrides)
    p.projectConfig.topLevelSections[sectionId] = TopLevelSectionLayout(
        **position.model_dump()
    )
    return sectionId


def create_child_sections(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    parentId: str,
    impl_type: SectionType,
    numChildren: int,
    startIdx: int | None,
):
    layering = get_section_impl_layering(p, parentId)
    core = p.sections[parentId]
    baseImpl = p.sectionImpls[layering.impl]
    effectiveImpl = get_effective_section_impl(p, parentId)
    if not isinstance(effectiveImpl, BaseParentSectionImpl) or not isinstance(
        baseImpl, BaseParentSectionImpl
    ):
        raise ValueError
    size = SectionSize(width=effectiveImpl.size.width)
    newIds = [
        create_section(settings, p, impl_type, {"size": size, "parentId": parentId})
        for _ in range(numChildren)
    ]
    if startIdx is None:
        startIdx = len(effectiveImpl.children)

    set_effective_impl_value(
        baseImpl,
        core,
        get_section_impl_layering(p, parentId),
        {
            "children": lambda currChildren: insert_into_array(
                currChildren, startIdx, newIds
            )
        },
    )
    return newIds


def create_child_sections_via_incrementer(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    calledBy: str,
    impl_type: SectionType,
    numChildren: int,
):
    impl = get_effective_section_impl(p, calledBy)
    if isinstance(impl, BaseParentSectionImpl):
        parentId = calledBy
        startIdx = 0
    else:
        parentId = impl.parentId
        if not parentId:
            raise ValueError
        parentImpl = get_effective_section_impl(p, parentId)
        if not isinstance(parentImpl, BaseParentSectionImpl):
            raise ValueError
        startIdx = parentImpl.children.index(calledBy) + 1
    create_child_sections(settings, p, parentId, impl_type, numChildren, startIdx)


def delete_sections(p: ProjectStateSingleConfig, sectionIds: list[str]):
    to_delete = get_all_sections_for_deletion_or_copying(p, sectionIds)
    for id in to_delete:
        impl = get_effective_section_impl(p, id)
        # delete from parent's current children list
        if impl.parentId:
            parent_core = p.sections[impl.parentId]
            parent_layering = get_section_impl_layering(p, impl.parentId)
            parent_base_impl = p.sectionImpls[parent_layering.impl]
            if not isinstance(parent_base_impl, BaseParentSectionImpl):
                raise ValueError(f"parent_base_impl: {parent_base_impl}")

            set_effective_impl_value(
                parent_base_impl,
                parent_core,
                parent_layering,
                {"children": lambda currChildren: [x for x in currChildren if x != id]},
            )

        still_used = check_if_section_is_still_used_somewhere(p, id)
        if not still_used:
            del p.sections[id]
            if not impl.parentId:
                del p.projectConfig.topLevelSections[id]


def delete_child_sections_via_decrementer(
    p: ProjectStateSingleConfig, calledBy: str, numChildren: int
):
    impl = get_effective_section_impl(p, calledBy)
    if isinstance(impl, BaseParentSectionImpl):
        sectionIds = impl.children[:numChildren]
    else:
        parentImpl = get_effective_section_impl(p, impl.parentId)
        if not isinstance(parentImpl, BaseParentSectionImpl):
            raise ValueError
        startIdx = parentImpl.children.index(calledBy) + 1
        sectionIds = parentImpl.children[startIdx : startIdx + numChildren]

    delete_sections(p, sectionIds)


def check_if_section_is_still_used_somewhere(
    p: ProjectStateSingleConfig, sectionId: str
):
    for s in p.sections.values():
        if "children" in s.sharedModifier and id in s.sharedModifier["children"]:
            return True
    for s in p.sectionImpls.values():
        if isinstance(s, BaseParentSectionImpl) and id in s.children:
            return True
    for s in p.sectionImplLayerings.values():
        if "children" in s.modifier and id in s.modifier["children"]:
            return True
    return False


def get_all_sections_for_deletion_or_copying(
    p: ProjectStateSingleConfig, sectionIds: list[str]
):
    idsToDelete = copy.deepcopy(sectionIds)
    visited = set()
    idx = 0
    while idx < len(idsToDelete):
        currId = idsToDelete[idx]
        if currId not in visited:
            currChildren = get_section_descendants_from_all_versions(p, currId)
            idsToDelete.extend(currChildren)
            visited.add(currId)
        idx += 1
    return set(idsToDelete)


def get_section_descendants_from_all_versions(
    p: ProjectStateSingleConfig, sectionId: str
):
    output: list[str] = []
    core = p.sections[sectionId]
    for layeringId in core.implLayerings:
        layering = p.sectionImplLayerings[layeringId]
        base_impl = p.sectionImpls[layering.impl]
        impl = get_effective_impl(base_impl, core, layering)
        if isinstance(impl, BaseParentSectionImpl):
            output.extend(impl.children)
    return output


def create_new_section_version(p: ProjectStateSingleConfig, sectionId: str):
    currBaseImpl = get_section_base_impl(p, sectionId)
    if currBaseImpl.isPreset:
        newBaseImpl = currBaseImpl
    else:
        newBaseImpl = currBaseImpl.model_copy(
            update={"id": create_new_id(), "name": generate_memorable_string()},
            deep=True,
        )

    newImplLayering = Layering(
        impl=newBaseImpl.id, nonPresetImpls=compute_initial_nonPresetImpls(newBaseImpl)
    )
    core = p.sections[sectionId]

    if isinstance(newBaseImpl, BaseSectionWithParamsImpl):
        newCodeObjImplLayeringMap: dict[str, str] = {}
        for codeObjId, codeObjLayeringId in newBaseImpl.codeObjImplLayeringMap.items():
            newCodeObjImplLayeringMap[codeObjId] = create_new_code_obj_version(
                p, codeObjId, codeObjLayeringId
            )
        set_effective_impl_value(
            newBaseImpl,
            core,
            newImplLayering,
            {"codeObjImplLayeringMap": newCodeObjImplLayeringMap},
        )

    core.implLayerings.append(newImplLayering.id)
    p.sectionImpls[newBaseImpl.id] = newBaseImpl
    p.sectionImplLayerings[newImplLayering.id] = newImplLayering
    p.projectConfig.sectionImplLayeringMap[sectionId] = newImplLayering.id


def create_new_code_obj_version(
    p: ProjectStateSingleConfig, codeObjId: str, codeObjLayeringId: str
):
    layering = p.codeObjImplLayerings[codeObjLayeringId]
    currBaseImpl = p.codeObjImpls[layering.impl]
    if currBaseImpl.isPreset:
        newBaseImpl = currBaseImpl
    else:
        newBaseImpl = currBaseImpl.model_copy(
            update={
                "id": create_new_id(),
                "name": generate_memorable_string(),
            },
            deep=True,
        )

    newImplLayering = Layering(
        impl=newBaseImpl.id, nonPresetImpls=compute_initial_nonPresetImpls(newBaseImpl)
    )
    core = p.codeObjs[codeObjId]

    core.implLayerings.append(newImplLayering.id)
    p.codeObjImpls[newBaseImpl.id] = newBaseImpl
    p.codeObjImplLayerings[newImplLayering.id] = newImplLayering
    return newImplLayering.id


def change_param_impl(
    settings: SettingsState,
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramInfoId: str,
    selectedId: str,
):
    layering = get_code_obj_impl_layering(p, paramInfoId, sectionId)
    old_impl = p.codeObjImpls[layering.impl]
    impl = p.codeObjImpls.get(selectedId, None)
    if not impl:
        # selectedId will be the CodeObjType name
        type = CodeObjType[selectedId]
        impl = create_code_obj_impl(
            type=type, defaults=get_user_default_code_obj_from_settings(settings, type)
        )
        p.codeObjImpls[impl.id] = impl

    layering.impl = impl.id
    if not impl.isPreset and impl.id not in layering.nonPresetImpls:
        layering.nonPresetImpls.append(impl.id)

    maybe_convert_code_obj_value(old_impl, impl, p.codeObjs[paramInfoId], layering)


def update_param_impl_config(
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramInfoId: str,
    newConfig: dict,
):
    layering = get_code_obj_impl_layering(p, paramInfoId, sectionId)
    impl = p.codeObjImpls[layering.impl]
    for k, v in newConfig.items():
        setattr(impl, k, v)
    maybe_convert_code_obj_value(impl, impl, p.codeObjs[paramInfoId], layering)


def get_user_default_code_obj_from_settings(settings: SettingsState, x: CodeObjType):
    return getattr(settings, x[0].lower() + x[1:] + "CodeObjDefault")


def get_user_default_section_from_settings(settings: SettingsState, x: SectionType):
    return getattr(settings, x[0].lower() + x[1:] + "SectionDefault")


def maybe_convert_code_obj_value(old_impl, new_impl, core, layering):
    if isinstance(old_impl, BaseChildlessCodeObjImplUnion) and isinstance(
        new_impl, BaseChildlessCodeObjImplUnion
    ):
        old_effective_impl = get_effective_impl(old_impl, core, layering)
        old_value = old_effective_impl.value
        new_value = convert_code_obj_value(new_impl, old_value)
        set_effective_impl_value(new_impl, core, layering, {"value": new_value})


def convert_code_obj_value(impl: BaseChildlessCodeObjImplUnion, value: str):
    match impl.type:
        case (
            CodeObjType.CodeParam
            | CodeObjType.TextParam
            | CodeObjType.DropdownParam
            | CodeObjType.PasswordParam
        ):
            return value
        case CodeObjType.SliderParam:
            try:
                x = float(value)
                if not math.isnan(x):
                    return str(max(min(x, impl.max), impl.min))
            except (ValueError, TypeError):
                pass
            return str(impl.min)
        case CodeObjType.SwitchParam:
            return "false" if value == "0" else "true"
        case CodeObjType.ColorPickerParam:
            if len(impl.choices) > 0:
                if value in [c.color for c in impl.choices]:
                    return value
                return impl.choices[0].color
            elif is_color_hex(value):
                return value
            return "#ff0000"
        case _:
            assert_never(impl.type)


def is_color_hex(string):
    pattern = r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
    return bool(re.match(pattern, string))


# use this if lambda function isn't sufficient for the type checker
def get_code_obj_impl_layering_map_update_fn(newMappings: dict[str, str]):
    def fn(currMap: dict[str, str]):
        return {**currMap, **newMappings}

    return fn
