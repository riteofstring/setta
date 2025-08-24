from enum import Enum

from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

from setta.code_gen.utils import GEN_CODE_CLASS_NAME
from setta.database.utils import create_new_id
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
    BaseSectionImplUnionWithDiscriminator,
)
from setta.types.section_impls import (
    GenPythonCodeSectionImpl,
    GlobalVariablesSectionImpl,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class ViewingEditingMode(str, Enum):
    DEV = "DEV"
    USER = "USER"
    USER_EDIT = "USER_EDIT"


class Viewport(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zoom: float = 1


class TopLevelSectionLayout(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zIndex: int = 0
    w: float | None = None
    h: float | None = None


class SingletonSections(BaseModel, extra="forbid"):
    globalVariables: str | None = None
    genPythonCode: str | None = None


class ProjectConfig(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodePrefix: str = ""
    genCodeSuffix: str = f"s = {GEN_CODE_CLASS_NAME}()"
    entryCodeBlockId: str | None = None
    topLevelSections: dict[str, TopLevelSectionLayout] = Field(default_factory=dict)
    sectionVariantMap: dict[str, str] = Field(default_factory=dict)
    activeIds: list[str] = Field(default_factory=list)


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
        self.validate_default_project_id()
        return self

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
        self.validate_singleton_sections()
        return self

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


class ProjectMetadata(BaseModel):
    defaultProjectConfigId: str | None
    projectMetadata: list[ProjectConfig]
