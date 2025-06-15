from setta.types.code_objs import (
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeObjCore,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.sections import (
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    DictSectionImpl,
    ListRootSectionImpl,
)
from setta.types.simplified_states import SimplifiedSectionCreation


class ProjectNotFound(Exception):
    pass


class ProjectNameTaken(Exception):
    pass


def convert_backend_to_single_config(
    p: ProjectStateBackend, projectConfigId: str
) -> ProjectStateSingleConfig:
    project_config = p.projectConfigs[projectConfigId]

    # Collectors for all the IDs we need
    section_ids: set[str] = set()
    section_impl_ids: set[str] = set()
    code_obj_ids: set[str] = set()
    code_obj_impl_ids: set[str] = set()

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

        for impl_id in section.appliedImpls:
            if impl_id in section_impl_ids:
                continue
            section_impl_ids.add(impl_id)
            impl = p.sectionImpls[impl_id]

            if isinstance(impl, BaseParentSectionImpl):
                # Add child sections to process list
                sections_to_process.update(impl.children)
            elif isinstance(impl, BaseSectionWithParamsImpl):
                if isinstance(impl, CallableSectionImpl):
                    if impl.callable:
                        code_objs_to_process.add(impl.callable)
                elif isinstance(impl, DictSectionImpl):
                    code_objs_to_process.update(impl.paramIds)

    # Process code_objs recursively
    while code_objs_to_process:
        obj_id = code_objs_to_process.pop()
        if obj_id in code_obj_ids:
            continue

        code_obj_ids.add(obj_id)
        obj = p.codeObjs[obj_id]

        for impl_id in obj.impls:
            if impl_id in section_impl_ids:
                continue
            code_obj_impl_ids.add(impl_id)
            impl = p.codeObjImpls[impl_id]
            if isinstance(impl, BaseParentCodeObjImpl):
                code_objs_to_process.update(impl.children)

    # Build the sliced state
    return ProjectStateSingleConfig(
        sections={x: p.sections[x] for x in section_ids},
        sectionImpls={x: p.sectionImpls[x] for x in section_impl_ids},
        codeObjs={x: p.codeObjs[x] for x in code_obj_ids},
        codeObjImpls={x: p.codeObjImpls[x] for x in code_obj_impl_ids},
        projectConfig=project_config,
    )


def merge_single_config_into_backend(
    x: ProjectStateBackend, config: ProjectStateSingleConfig
):
    return ProjectStateBackend(
        sections={**x.sections, **config.sections},
        sectionImpls={**x.sectionImpls, **config.sectionImpls},
        codeObjs={**x.codeObjs, **config.codeObjs},
        codeObjImpls={**x.codeObjImpls, **config.codeObjImpls},
        projectConfigs={
            **x.projectConfigs,
            config.projectConfig.id: config.projectConfig,
        },
        defaultProjectConfigId=x.defaultProjectConfigId,
    )


def get_section_impl(p: ProjectStateSingleConfig, id: str):
    impl_id = p.projectConfig.sectionImplMap[id]
    return p.sectionImpls[impl_id]


def get_section_callable(p: ProjectStateSingleConfig, id: str):
    impl = get_section_impl(p, id)
    if isinstance(impl, CallableSectionImpl):
        if impl.callable:
            return p.codeObjs[impl.callable]
    return None


def get_section_children_ids(p: ProjectStateSingleConfig, id: str) -> list[str]:
    impl = get_section_impl(p, id)
    if isinstance(impl, BaseParentSectionImpl):
        return impl.children
    return []


def get_top_level_param_ids(p: ProjectStateSingleConfig, id: str) -> list[str]:
    section_impl = get_section_impl(p, id)
    if isinstance(section_impl, CallableSectionImpl):
        callable = get_section_callable(p, id)
        if not callable:
            return []
        code_obj_impl_id = section_impl.codeObjImplMap[callable.id]
        code_obj_impl = p.codeObjImpls[code_obj_impl_id]
        if isinstance(code_obj_impl, CodeCallableCodeObjImpl):
            return code_obj_impl.children
    elif isinstance(section_impl, DictSectionImpl):
        return section_impl.paramIds
    return []


def get_code_obj_impl(p: ProjectStateSingleConfig, sectionId: str, id: str):
    section_impl = get_section_impl(p, sectionId)
    if isinstance(section_impl, BaseSectionWithParamsImpl):
        code_obj_impl_id = section_impl.codeObjImplMap[id]
        return p.codeObjImpls[code_obj_impl_id]
    return None


def get_code_obj_children_ids(
    p: ProjectStateSingleConfig, sectionId: str, id: str
) -> list[str]:
    code_obj_impl = get_code_obj_impl(p, sectionId, id)
    if isinstance(code_obj_impl, BaseParentCodeObjImpl):
        return code_obj_impl.children
    return []


def get_section_path_full_name(p: ProjectStateSingleConfig, section_id: str):
    section_impl = get_section_impl(p, section_id)
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
        parent_id = get_section_impl(p, parent_id).parentId

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def callable_is_already_selected(
    p: ProjectStateSingleConfig, sectionId: str, callableName: str
):
    selected_item = get_section_callable(p, sectionId)
    return selected_item and selected_item.name == callableName


def callable_has_been_selected_before(
    p: ProjectStateSingleConfig, sectionId: str, selectedItemName: str
):
    section_impl = get_section_impl(p, sectionId)
    if isinstance(section_impl, CallableSectionImpl):
        for c in section_impl.codeObjImplMap.keys():
            if p.codeObjs[c].name == selectedItemName:
                return c
    return None


def add_callable_code_obj(
    p: ProjectStateSingleConfig,
    section_id: str,
    code_obj: CodeObjCore,
    code_obj_impl: CodeCallableCodeObjImpl,
):
    section_impl = get_section_impl(p, section_id)
    if not isinstance(section_impl, CallableSectionImpl):
        raise TypeError

    p.codeObjs[code_obj.id] = code_obj
    section_impl.codeObjImplMap[code_obj.id] = code_obj_impl.id


def add_children_of_callable(
    p: ProjectStateSingleConfig,
    section_id: str,
    callable_id: str,
    params: list[CodeObjCore],
    param_impl_map: dict[str, BaseParamCodeObjImpl],
):
    existing_matching_params: dict[str, CodeObjCore] = {}
    callable_code_obj_impl = get_code_obj_impl(p, section_id, callable_id)
    if not isinstance(callable_code_obj_impl, CodeCallableCodeObjImpl):
        raise TypeError
    for c in callable_code_obj_impl.children:
        match = p.codeObjs[c]
        existing_matching_params[match.name] = match

    param_ids_in_order = []
    section_impl = get_section_impl(p, section_id)
    if not isinstance(section_impl, CallableSectionImpl):
        raise TypeError
    for param in params:
        existing = existing_matching_params.get(param.name)
        if existing:
            param.id = existing.id
            # TODO: update impls
        else:
            p.codeObjs[param.id] = param
            param_impl = param_impl_map[param.id]
            p.codeObjImpls[param_impl.id] = param_impl
            section_impl.codeObjImplMap[param.id] = param_impl.id

        param_ids_in_order.append(param.id)

    callable_code_obj_impl.children = param_ids_in_order


def set_param_entered_value(
    p: ProjectStateSingleConfig,
    sectionId: str,
    paramInfoId: str,
    value: str,
):
    variant = get_selected_section_variant(p, sectionId)
    if paramInfoId not in variant.values:
        variant.values[paramInfoId] = EVEntry()
    variant.values[paramInfoId].value = value


def get_top_level_sections(p: ProjectStateSingleConfig) -> dict[str, Section]:
    output = {}
    projectConfig = p.projectConfig
    for c in projectConfig.topLevelSections.keys():
        output[c] = p.sections[c]
    return output


def get_children_of_selected_item(p: ProjectStateSingleConfig, sectionId: str):
    param_ids = get_top_level_param_ids(p, sectionId)
    return [p.codeInfo[x] for x in param_ids]


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


def create_sections(
    p: ProjectStateSingleConfig,
    sections: list[SimplifiedSectionCreation],
):
    for s in sections:
        new_section = Section(name=s.name, uiTypeId=BASE_UI_TYPE_IDS[s.type])
        new_section_config = SectionConfig(size=s.size)
        p.sections[new_section.id] = new_section
        p.variants[new_section_config.variantId] = SectionVariant()
        new_section.variantIds = [new_section_config.variantId]
        new_section.defaultVariantId = new_section_config.variantId
        p.projectConfig.sectionConfigs[new_section.id] = new_section_config
        p.projectConfig.topLevelSections[new_section.id] = TopLevelSectionLayout(
            x=s.position.x, y=s.position.y
        )
