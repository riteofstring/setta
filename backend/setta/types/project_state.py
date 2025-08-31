from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
    BaseSectionImplUnionWithDiscriminator,
)
from setta.types.project_config import ProjectConfig
from setta.types.section_impls import (
    BaseParentSectionImpl,
    GenPythonCodeSectionImpl,
    GlobalVariablesSectionImpl,
)


class SingletonSections(BaseModel, extra="forbid"):
    globalVariables: str | None = None
    genPythonCode: str | None = None


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

    def get_curr_section_variant(
        self,
        section_id: str,
    ):
        variant_id = self.projectConfig.sectionVariantMap[section_id]
        return self.sectionVariants[variant_id]

    def get_curr_effective_section_impl(
        self,
        section_id: str,
    ):
        variant = self.get_curr_section_variant(section_id)
        base_impl = self.sectionImpls[variant.impl]
        core = self.sections[section_id]
        return get_effective_impl(base_impl, core, variant)

    @model_validator(mode="after")
    def _validate_singleton_sections(self):
        return self.validate_singleton_sections()

    @model_validator(mode="after")
    def _validate_active_ids(self):
        return self.validate_active_ids()

    @model_validator(mode="after")
    def _validate_parent_section_map(self):
        return self.validate_parent_section_map()

    def validate_singleton_sections(self):
        output = SingletonSections()
        for s in self.sections.values():
            if output.globalVariables and output.genPythonCode:
                break
            sectionImpl = self.get_curr_effective_section_impl(s.id)
            if not output.globalVariables and isinstance(
                sectionImpl, GlobalVariablesSectionImpl
            ):
                output.globalVariables = s.id
            elif not output.genPythonCode and isinstance(
                sectionImpl, GenPythonCodeSectionImpl
            ):
                output.genPythonCode = s.id
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
            impl = self.get_curr_effective_section_impl(sectionId)
            if isinstance(impl, BaseParentSectionImpl):
                for c in impl.children:
                    self.parentSectionMap[c] = sectionId
        return self


class AllProjectMetadata(BaseModel):
    defaultProjectConfigId: str | None
    projectMetadata: list[ProjectConfig]
