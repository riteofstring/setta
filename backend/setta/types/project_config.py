from typing import Any, Literal

from pydantic import Field, field_validator, model_validator
from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.types.generated.go_shared_types import (
    AgenticEdge,
    CodeObjType,
    CodeObjValueRepresentationMode,
    Edge,
    ProjectCodegenLanguage,
    SectionCodegenMode,
    SectionRepresentationMode,
    SectionType,
    StateMachineEdge,
    TopLevelSectionLayout,
    Viewport,
    WatchCodeFolder,
    WatchCodeRegistryEntry,
    WindowSpaceConfig,
)
from setta.types.generated.go_shared_types import (
    CodeObjTypeValuePolicy as GoCodeObjTypeValuePolicy,
)
from setta.types.generated.go_shared_types import (
    CodeObjValueOverride as GoCodeObjValueOverride,
)
from setta.types.generated.go_shared_types import (
    CodeObjValuePolicy as GoCodeObjValuePolicy,
)
from setta.types.generated.go_shared_types import (
    ProjectCodegenPluginTarget as GoProjectCodegenPluginTarget,
)
from setta.types.generated.go_shared_types import (
    ProjectCodegenPythonTarget as GoProjectCodegenPythonTarget,
)
from setta.types.generated.go_shared_types import (
    ProjectConfig as GoProjectConfig,
)
from setta.types.generated.go_shared_types import (
    SectionCodegenOverride as GoSectionCodegenOverride,
)
from setta.types.generated.go_shared_types import (
    SectionCodegenPolicy as GoSectionCodegenPolicy,
)
from setta.types.generated.go_shared_types import (
    SectionTypeCodegenPolicy as GoSectionTypeCodegenPolicy,
)
from setta.types.generated.go_shared_types import (
    ViewMode as ViewModeConfig,
)
from setta.types.id import ID, create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


SectionTypeCodegenPolicy = GoSectionTypeCodegenPolicy
SectionCodegenOverride = GoSectionCodegenOverride


def default_section_allowlist() -> list[SectionType]:
    return [
        SectionType.Callable,
        SectionType.Dict,
        SectionType.ListRoot,
        SectionType.Group,
        SectionType.GlobalVariables,
        SectionType.TextBlock,
        SectionType.Draw,
        SectionType.MetaControl,
        SectionType.TaskBoard,
        SectionType.Spreadsheet,
    ]


def default_meta_control_allowlist() -> list[CodeObjType]:
    return [
        CodeObjType.CodeParam,
        CodeObjType.TextParam,
        CodeObjType.DateParam,
        CodeObjType.TimeParam,
        CodeObjType.TextAreaParam,
        CodeObjType.SliderParam,
        CodeObjType.RotaryParam,
        CodeObjType.SwitchParam,
        CodeObjType.ColorPickerParam,
        CodeObjType.DropdownParam,
        CodeObjType.PasswordParam,
        CodeObjType.ButtonParam,
        CodeObjType.DropzoneParam,
    ]


def default_section_representation(
    section_type: SectionType,
) -> SectionRepresentationMode:
    if section_type in (SectionType.Chat, SectionType.Draw, SectionType.Image):
        return SectionRepresentationMode.file_read
    return SectionRepresentationMode.expression


def default_section_type_policies() -> dict[SectionType, SectionTypeCodegenPolicy]:
    policies: dict[SectionType, SectionTypeCodegenPolicy] = {}
    for section_type in SectionType:
        policies[section_type] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.inherit,
            representation=default_section_representation(section_type)
        )
    return policies


class SectionCodegenPolicy(GoSectionCodegenPolicy):
    allowlist: list[SectionType] | None = Field(
        default_factory=default_section_allowlist
    )
    metaControlAllowlist: list[CodeObjType] | None = Field(
        default_factory=default_meta_control_allowlist
    )
    exclude: list[ID] = Field(default_factory=list)
    typePolicies: dict[SectionType, SectionTypeCodegenPolicy] = Field(
        default_factory=default_section_type_policies
    )
    sectionOverrides: dict[ID, SectionCodegenOverride] = Field(default_factory=dict)


CodeObjTypeValuePolicy = GoCodeObjTypeValuePolicy
CodeObjValueOverride = GoCodeObjValueOverride


def default_code_obj_type_value_policies() -> dict[CodeObjType, CodeObjTypeValuePolicy]:
    policies: dict[CodeObjType, CodeObjTypeValuePolicy] = {}
    for code_obj_type in CodeObjType:
        policies[code_obj_type] = CodeObjTypeValuePolicy(
            representation=default_code_obj_representation(code_obj_type)
        )
    return policies


def default_code_obj_representation(
    code_obj_type: CodeObjType,
) -> CodeObjValueRepresentationMode:
    if code_obj_type in (
        CodeObjType.TextParam,
        CodeObjType.DateParam,
        CodeObjType.TimeParam,
        CodeObjType.TextAreaParam,
        CodeObjType.PasswordParam,
        CodeObjType.ColorPickerParam,
    ):
        return CodeObjValueRepresentationMode.string
    if code_obj_type is CodeObjType.DropzoneParam:
        return CodeObjValueRepresentationMode.file_path
    return CodeObjValueRepresentationMode.expression


class CodeObjValuePolicy(GoCodeObjValuePolicy):
    typePolicies: dict[CodeObjType, CodeObjTypeValuePolicy] = Field(
        default_factory=default_code_obj_type_value_policies
    )
    codeObjOverrides: dict[ID, CodeObjValueOverride] = Field(default_factory=dict)


class ProjectCodegenPythonTarget(GoProjectCodegenPythonTarget):
    language: Literal[ProjectCodegenLanguage.python] = ProjectCodegenLanguage.python
    genCodePrefix: str = ""
    genCodeSuffix: str = f"{GEN_CODE_INSTANCE_NAME} = {GEN_CODE_CLASS_NAME}()"
    generateMetadata: bool = False
    sectionPolicy: SectionCodegenPolicy = Field(default_factory=SectionCodegenPolicy)
    codeObjValuePolicy: CodeObjValuePolicy = Field(default_factory=CodeObjValuePolicy)


class ProjectCodegenPluginTarget(GoProjectCodegenPluginTarget):
    language: str
    options: dict[str, Any] = Field(default_factory=dict)

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        normalized = value.strip()
        if normalized == "":
            raise ValueError("Plugin codegen target language cannot be empty.")
        if normalized == ProjectCodegenLanguage.python.value:
            raise ValueError("Plugin codegen target language cannot be python.")
        return normalized


ProjectCodegenTarget = ProjectCodegenPythonTarget | ProjectCodegenPluginTarget


def default_codegen_targets() -> list[ProjectCodegenTarget]:
    return [ProjectCodegenPythonTarget()]


class ProjectConfig(GoProjectConfig, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    showParamDisplayNames: bool = False
    allowJsonSourceKeyEdits: bool = True
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewportInitialized: bool = False
    viewModes: dict[ID, ViewModeConfig] = Field(default_factory=dict)
    windowSpaces: dict[ID, WindowSpaceConfig] = Field(default_factory=dict)
    activeViewModeId: ID | None = None
    isEditingViewMode: bool = False
    codegenTargets: list[ProjectCodegenTarget] = Field(
        default_factory=default_codegen_targets
    )
    entryCodeBlockId: ID | None = None
    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(default_factory=dict)
    sectionVariantMap: dict[ID, ID] = Field(default_factory=dict)
    activeIds: list[ID] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    agenticEdges: list[AgenticEdge] = Field(default_factory=list)
    stateMachineEdges: list[StateMachineEdge] = Field(default_factory=list)
    watchCodeEnabled: bool = False
    watchCodeFolders: list[WatchCodeFolder] = Field(default_factory=list)
    watchCodeFiles: list[str] = Field(default_factory=list)
    watchCodeRegistry: dict[str, WatchCodeRegistryEntry] = Field(default_factory=dict)
    watchCodeBaselineByPath: dict[str, list[str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_codegen_targets(self):
        seen: set[str] = set()
        for target in self.codegenTargets:
            if target.language in seen:
                raise ValueError(
                    f"Duplicate codegen target language: {target.language}"
                )
            seen.add(target.language)
        return self
