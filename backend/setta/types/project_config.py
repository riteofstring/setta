from dataclasses import dataclass
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
from setta.types.edges import Edge
from setta.types.id import ID
from setta.types.section_impls import SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


class Position(BaseModel):
    x: float = 0
    y: float = 0


class Viewport(BaseModel, extra="forbid"):
    """Camera settings describing the canvas offset and zoom level."""

    x: float = Field(
        default=0.0,
        description="Horizontal offset applied to the viewport origin.",
    )
    y: float = Field(
        default=0.0,
        description="Vertical offset applied to the viewport origin.",
    )
    zoom: float = Field(
        default=1.0,
        description="Scalar zoom level; greater than 1 zooms in, less than 1 zooms out.",
    )


class ViewportBounds(BaseModel, extra="forbid"):
    """Visible canvas bounds in flow coordinates."""

    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0


class TopLevelSectionLayout(Position, extra="forbid"):
    zIndex: int = 0
    w: float | None = None
    h: float | None = None


class ViewModeConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    isUserFacing: bool = False
    visibilityBySectionId: dict[ID, bool] = Field(default_factory=dict)


class ProjectCodegenLanguage(str, Enum):
    python = "python"


class SectionCodegenMode(str, Enum):
    inherit = "inherit"
    include = "include"
    exclude = "exclude"


class SectionRepresentationMode(str, Enum):
    expression = "expression"
    file_path = "file_path"
    file_read = "file_read"


class SectionTypeCodegenPolicy(BaseModel, extra="forbid"):
    mode: SectionCodegenMode = SectionCodegenMode.inherit
    representation: SectionRepresentationMode = SectionRepresentationMode.expression


class SectionCodegenOverride(BaseModel, extra="forbid"):
    mode: SectionCodegenMode = SectionCodegenMode.inherit
    representation: SectionRepresentationMode = SectionRepresentationMode.expression


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
    ]


def default_meta_control_allowlist() -> list[CodeObjType]:
    return [
        CodeObjType.CodeParam,
        CodeObjType.TextParam,
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
            representation=default_section_representation(section_type)
        )
    return policies


class SectionCodegenPolicy(BaseModel, extra="forbid"):
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


@dataclass(frozen=True)
class ResolvedSectionCodegenPolicy:
    include_in_codegen: bool
    representation: SectionRepresentationMode


class CodeObjValueRepresentationMode(str, Enum):
    expression = "expression"
    json_parsed = "json_parsed"
    string = "string"
    file_path = "file_path"
    file_read = "file_read"


class CodeObjTypeValuePolicy(BaseModel, extra="forbid"):
    representation: CodeObjValueRepresentationMode = (
        CodeObjValueRepresentationMode.expression
    )


class CodeObjValueOverride(BaseModel, extra="forbid"):
    representation: CodeObjValueRepresentationMode = (
        CodeObjValueRepresentationMode.expression
    )


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
        CodeObjType.TextAreaParam,
        CodeObjType.PasswordParam,
        CodeObjType.ColorPickerParam,
    ):
        return CodeObjValueRepresentationMode.string
    if code_obj_type is CodeObjType.DropzoneParam:
        return CodeObjValueRepresentationMode.file_path
    return CodeObjValueRepresentationMode.expression


class CodeObjValuePolicy(BaseModel, extra="forbid"):
    typePolicies: dict[CodeObjType, CodeObjTypeValuePolicy] = Field(
        default_factory=default_code_obj_type_value_policies
    )
    codeObjOverrides: dict[ID, CodeObjValueOverride] = Field(default_factory=dict)


@dataclass(frozen=True)
class ResolvedCodeObjValuePolicy:
    representation: CodeObjValueRepresentationMode


def _apply_codegen_mode(include_in_codegen: bool, mode: SectionCodegenMode) -> bool:
    if mode is SectionCodegenMode.include:
        return True
    if mode is SectionCodegenMode.exclude:
        return False
    return include_in_codegen


def _is_representation_supported(
    section_type: SectionType, representation: SectionRepresentationMode
) -> bool:
    if section_type is SectionType.Chat:
        return representation in (
            SectionRepresentationMode.expression,
            SectionRepresentationMode.file_path,
            SectionRepresentationMode.file_read,
        )
    if section_type in (SectionType.Draw, SectionType.Image):
        return representation in (
            SectionRepresentationMode.file_path,
            SectionRepresentationMode.file_read,
        )
    if section_type is SectionType.Chart:
        return representation in (
            SectionRepresentationMode.expression,
            SectionRepresentationMode.file_path,
        )
    return representation is SectionRepresentationMode.expression


def resolve_section_codegen_policy(
    section_policy: SectionCodegenPolicy,
    section_id: ID,
    section_type: SectionType,
) -> ResolvedSectionCodegenPolicy:
    allowlist = section_policy.allowlist
    include_in_codegen = allowlist is None or section_type in allowlist
    type_policy = section_policy.typePolicies.get(section_type)
    if type_policy is None:
        type_policy = SectionTypeCodegenPolicy(
            representation=default_section_representation(section_type)
        )
    include_in_codegen = _apply_codegen_mode(include_in_codegen, type_policy.mode)
    representation = type_policy.representation
    if section_id in section_policy.exclude:
        include_in_codegen = False
    override = section_policy.sectionOverrides.get(section_id)
    if override is not None:
        include_in_codegen = _apply_codegen_mode(include_in_codegen, override.mode)
        representation = override.representation
    if not _is_representation_supported(section_type, representation):
        raise ValueError(
            f"Unsupported representation {representation.value} for section type {section_type.value}"
        )
    return ResolvedSectionCodegenPolicy(
        include_in_codegen=include_in_codegen,
        representation=representation,
    )


def _is_code_obj_value_representation_supported(
    code_obj_type: CodeObjType, representation: CodeObjValueRepresentationMode
) -> bool:
    if code_obj_type in (
        CodeObjType.ButtonParam,
        CodeObjType.CodeCallable,
        CodeObjType.NestedParam,
    ):
        return representation is CodeObjValueRepresentationMode.expression
    if code_obj_type is CodeObjType.DropzoneParam:
        return representation in (
            CodeObjValueRepresentationMode.file_path,
            CodeObjValueRepresentationMode.file_read,
        )
    if code_obj_type in (
        CodeObjType.TextParam,
        CodeObjType.TextAreaParam,
        CodeObjType.PasswordParam,
        CodeObjType.ColorPickerParam,
    ):
        return representation is CodeObjValueRepresentationMode.string
    if code_obj_type in (
        CodeObjType.CodeParam,
        CodeObjType.RotaryParam,
        CodeObjType.SwitchParam,
        CodeObjType.DropdownParam,
    ):
        return representation in (
            CodeObjValueRepresentationMode.expression,
            CodeObjValueRepresentationMode.string,
        )
    if code_obj_type is CodeObjType.SliderParam:
        return representation in (
            CodeObjValueRepresentationMode.expression,
            CodeObjValueRepresentationMode.json_parsed,
            CodeObjValueRepresentationMode.string,
        )
    return representation is CodeObjValueRepresentationMode.expression


def resolve_code_obj_value_policy(
    value_policy: CodeObjValuePolicy,
    code_obj_id: ID,
    code_obj_type: CodeObjType,
) -> ResolvedCodeObjValuePolicy:
    type_policy = value_policy.typePolicies.get(code_obj_type)
    if type_policy is None:
        type_policy = CodeObjTypeValuePolicy()
    representation = type_policy.representation
    override = value_policy.codeObjOverrides.get(code_obj_id)
    if override is not None:
        representation = override.representation
    if not _is_code_obj_value_representation_supported(code_obj_type, representation):
        raise ValueError(
            f"Unsupported representation {representation.value} for code obj type {code_obj_type.value}"
        )
    return ResolvedCodeObjValuePolicy(representation=representation)


def get_section_codegen_policy(project_config: "ProjectConfig") -> SectionCodegenPolicy:
    python_target = get_python_codegen_target(project_config)
    if python_target is None:
        return SectionCodegenPolicy()
    return python_target.sectionPolicy


def get_code_obj_value_policy(project_config: "ProjectConfig") -> CodeObjValuePolicy:
    python_target = get_python_codegen_target(project_config)
    if python_target is None:
        return CodeObjValuePolicy()
    return python_target.codeObjValuePolicy


class ProjectCodegenPythonTarget(BaseModel, extra="forbid"):
    language: Literal[ProjectCodegenLanguage.python] = ProjectCodegenLanguage.python
    genCodePrefix: str = ""
    genCodeSuffix: str = f"{GEN_CODE_INSTANCE_NAME} = {GEN_CODE_CLASS_NAME}()"
    generateMetadata: bool = False
    sectionPolicy: SectionCodegenPolicy = Field(default_factory=SectionCodegenPolicy)
    codeObjValuePolicy: CodeObjValuePolicy = Field(default_factory=CodeObjValuePolicy)


ProjectCodegenTarget = ProjectCodegenPythonTarget


def default_codegen_targets() -> list[ProjectCodegenTarget]:
    return [ProjectCodegenPythonTarget()]


def project_config_has_codegen_language(
    project_config: "ProjectConfig",
    language: ProjectCodegenLanguage,
) -> bool:
    return any(target.language == language for target in project_config.codegenTargets)


def get_python_codegen_target(
    project_config: "ProjectConfig",
) -> ProjectCodegenPythonTarget | None:
    for target in project_config.codegenTargets:
        if target.language == ProjectCodegenLanguage.python:
            if not isinstance(target, ProjectCodegenPythonTarget):
                raise TypeError("Expected python codegen target.")
            return target
    return None


def get_python_codegen_target_with_type_guard(
    project_config: "ProjectConfig",
) -> ProjectCodegenPythonTarget:
    target = get_python_codegen_target(project_config)
    if target is None:
        raise KeyError("Project config missing python codegen target.")
    return target


class ProjectConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    showParamDisplayNames: bool = False
    allowJsonSourceKeyEdits: bool = True
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewModes: dict[ID, ViewModeConfig] = Field(default_factory=dict)
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

    @model_validator(mode="after")
    def _validate_codegen_targets(self):
        seen: set[ProjectCodegenLanguage] = set()
        for target in self.codegenTargets:
            if target.language in seen:
                raise ValueError(
                    f"Duplicate codegen target language: {target.language}"
                )
            seen.add(target.language)
        return self
