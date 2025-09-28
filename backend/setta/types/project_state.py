import yaml
from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

from setta.types.core import Core, Variant
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
    BaseSectionImplUnionWithDiscriminator,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl2 import get_top_level_param_ids
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_config import ProjectConfig
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    SectionType,
    SectionWithParamsDisplayMode,
)
from setta.types.shown_params import (
    ShownParamIds,
    get_param_ids_to_show,
)

SINGLETON_SECTION_TYPES = set([SectionType.GlobalVariables, SectionType.GenPythonCode])


class SingletonSections(BaseModel, extra="forbid"):
    GlobalVariables: str | None = None
    GenPythonCode: str | None = None


class ProjectStateCore(BaseModel, extra="forbid"):
    sections: dict[str, Core] = Field(default_factory=dict)
    sectionImpls: dict[str, BaseSectionImplUnionWithDiscriminator] = Field(
        default_factory=dict
    )
    sectionVariants: dict[str, Variant] = Field(default_factory=dict)
    codeObjs: dict[str, Core] = Field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImplUnionWithDiscriminator] = Field(
        default_factory=dict
    )
    codeObjVariants: dict[str, Variant] = Field(default_factory=dict)


class ProjectStateBackend(
    ProjectStateCore,
    extra="forbid",
):
    projectConfigs: dict[str, ProjectConfig] = Field(default_factory=dict)
    defaultProjectConfigId: str | None = None

    @model_validator(mode="after")
    def _validate_default_project_id(self):
        return self.validate_default_project_id()

    def validate_default_project_id(self):
        if self.projectConfigs:
            # If projects exist, use first key when defaultProjectConfigId is None
            if (
                self.defaultProjectConfigId is None
                or self.defaultProjectConfigId not in self.projectConfigs
            ):
                self.defaultProjectConfigId = next(iter(self.projectConfigs))
        else:
            # If projects is empty, defaultProjectConfigId should be None
            self.defaultProjectConfigId = None
        return self


class ProjectStateSingleConfig(ProjectStateCore, extra="forbid"):
    projectConfig: ProjectConfig
    singletonSections: SingletonSections = Field(default_factory=SingletonSections)
    parentSectionMap: dict[str, str | None] = Field(default_factory=dict)
    yamlValues: dict[str, str] = Field(default_factory=dict)
    shownParamIds: dict[str, ShownParamIds] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_singleton_sections(self):
        return self.validate_singleton_sections()

    @model_validator(mode="after")
    def _validate_active_ids(self):
        return self.validate_active_ids()

    @model_validator(mode="after")
    def _validate_parent_section_map(self):
        return self.validate_parent_section_map()

    @model_validator(mode="after")
    def _validate_yaml_values(self):
        return self.validate_yaml_values()

    @model_validator(mode="after")
    def _validate_shown_param_ids(self):
        return self.validate_shown_param_ids()

    def validate_singleton_sections(self):
        output = SingletonSections()
        found = set()

        for s in self.sections.values():
            if len(found) == len(SINGLETON_SECTION_TYPES):
                break

            sectionImpl = get_curr_effective_section_impl(self, s.id)

            for section_type in SINGLETON_SECTION_TYPES:
                attr_name = section_type.value
                if attr_name not in found and sectionImpl.type == section_type:
                    setattr(output, attr_name, s.id)
                    found.add(attr_name)
                    break

        self.singletonSections = output
        return self

    def validate_active_ids(self):
        self.projectConfig.activeIds = [
            x for x in self.projectConfig.activeIds if x in self.sections
        ]
        return self

    def validate_parent_section_map(self):
        self.parentSectionMap = {}
        for sectionId in self.sections.keys():
            if sectionId not in self.parentSectionMap:
                self.parentSectionMap[sectionId] = None
            impl = get_curr_effective_section_impl(self, sectionId)
            if isinstance(impl, BaseParentSectionImpl):
                for c in impl.children:
                    self.parentSectionMap[c] = sectionId
        return self

    def validate_yaml_values(self):
        output: dict[str, str] = {}
        for s in self.sections.values():
            for v in s.variants:
                _, _, impl = get_variant_base_and_effective_section_impl(self, s, v)
                if (
                    not isinstance(impl, BaseSectionWithParamsImpl)
                    or impl.displayMode != SectionWithParamsDisplayMode.Yaml
                ):
                    continue
                top_level_ids = get_top_level_param_ids(self, impl)
                name_path_prefix = (
                    tuple(impl.jsonSourceKeys)
                    if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource
                    else ()
                )
                hierarchy = traverse_hierarchy(
                    self.codeObjs,
                    self.codeObjImpls,
                    self.codeObjVariants,
                    impl.codeObjVariantMap,
                    top_level_ids,
                    options=TraversalOptions(
                        build_id_to_name_path=True,
                        build_nested_dict=True,
                        name_path_prefix=name_path_prefix,
                    ),
                )
                output[v] = yaml.dump(hierarchy.nested_dict)
        self.yamlValues = output
        return self

    def validate_shown_param_ids(self):
        output: dict[str, ShownParamIds] = {}
        for s in self.sections.values():
            for v in s.variants:
                _, _, impl = get_variant_base_and_effective_section_impl(self, s, v)
                if not isinstance(impl, BaseSectionWithParamsImpl):
                    continue
                output[v] = get_param_ids_to_show(self, impl)
        self.shownParamIds = output
        return self


class AllProjectMetadata(BaseModel):
    defaultProjectConfigId: str | None
    projectMetadata: list[ProjectConfig]
