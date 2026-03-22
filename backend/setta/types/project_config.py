from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.types.generated.go_shared_types import (
    CodeObjType,
    Edge,
    SectionType,
    StateMachineCountOperator,
    StateMachineSourceFilterType,
    StateMachineTargetActionType,
    StateMachineThreadStrategy,
    WindowSpaceSurfaceKind,
)
from setta.types.id import ID, create_new_id
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
    sortIndex: int = 0
    isUserFacing: bool = False
    isTab: bool = False
    visibilityBySectionId: dict[ID, bool] = Field(default_factory=dict)
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewportInitialized: bool = False
    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(default_factory=dict)


class AgenticEdgeKind(str, Enum):
    chat_chat = "chat_chat"
    section_chat = "section_chat"
    chat_section = "chat_section"


class AgenticEdgeContextMode(str, Enum):
    reference_only = "reference_only"
    inline_text = "inline_text"
    summary = "summary"


class AgenticEdge(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    sourceSectionId: ID
    targetSectionId: ID
    kind: AgenticEdgeKind
    contextMode: AgenticEdgeContextMode = AgenticEdgeContextMode.reference_only
    style: dict[str, str | int | float] | None = None
    hidden: bool = False
    zIndex: int = 0
    selected: bool = False


class WindowSpaceWindowMode(str, Enum):
    project_ai_mode = "project_ai_mode"
    section_mode = "section_mode"
    git_graph_mode = "git_graph_mode"


def _enum_value(value: object) -> object:
    return getattr(value, "value", value)


def validate_window_space_window_owner(
    *,
    surface_kind: object,
    mode: object,
    section_id: ID | None,
    chat_id: ID | None,
) -> None:
    surface_kind_value = _enum_value(surface_kind)
    mode_value = _enum_value(mode)
    if surface_kind_value == "section" and section_id is None:
        raise ValueError("Section window-space windows require sectionIdOrNull.")
    if surface_kind_value == "project_chat" and section_id is not None:
        raise ValueError(
            "Project-chat window-space windows cannot carry sectionIdOrNull."
        )
    if surface_kind_value == "section" and mode_value == "git_graph_mode":
        raise ValueError("Section window-space windows cannot use git_graph_mode.")
    if surface_kind_value == "project_chat" and mode_value == "section_mode":
        raise ValueError("Project-chat window-space windows cannot use section_mode.")
    if mode_value != "project_ai_mode" and chat_id is not None:
        raise ValueError(
            "Window-space windows must use project_ai_mode to bind chatId."
        )


class NormalizedFloatingWindowBounds(BaseModel, extra="forbid"):
    x: float = Field(default=0.0, ge=0.0, le=1.0)
    y: float = Field(default=0.0, ge=0.0, le=1.0)
    width: float = Field(default=1.0, gt=0.0, le=1.0)
    height: float = Field(default=1.0, gt=0.0, le=1.0)


class WindowSpaceWindow(BaseModel, extra="forbid"):
    surfaceKind: WindowSpaceSurfaceKind = WindowSpaceSurfaceKind.project_chat
    sectionIdOrNull: ID | None = None
    mode: WindowSpaceWindowMode = WindowSpaceWindowMode.project_ai_mode
    title: str | None = None
    chatId: ID | None = None
    embeddedGitPaneVisible: bool = False
    zIndex: int = 0
    normalizedBounds: NormalizedFloatingWindowBounds = Field(
        default_factory=NormalizedFloatingWindowBounds
    )

    @model_validator(mode="after")
    def _validate_owner(self):
        validate_window_space_window_owner(
            surface_kind=self.surfaceKind,
            mode=self.mode,
            section_id=self.sectionIdOrNull,
            chat_id=self.chatId,
        )
        return self


class WindowSpaceState(BaseModel, extra="forbid"):
    windowsById: dict[ID, WindowSpaceWindow] = Field(default_factory=dict)
    order: list[ID] = Field(default_factory=list)


class WindowSpaceConfig(WindowSpaceState, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    sortIndex: int = 0


class StateMachineSourceFilter(BaseModel, extra="forbid"):
    type: StateMachineSourceFilterType = StateMachineSourceFilterType.run_completed
    signalName: str | None = None
    payloadField: str | None = None
    equals: str | None = None


class StateMachineSourceActivationCountCondition(BaseModel, extra="forbid"):
    operator: StateMachineCountOperator = StateMachineCountOperator.eq
    value: int


class StateMachineTargetAction(BaseModel, extra="forbid"):
    type: StateMachineTargetActionType = StateMachineTargetActionType.send_prompt
    promptTemplateId: ID | None = None
    promptSectionId: ID | None = None
    inlinePrompt: str | None = None
    promptInputs: dict[str, str] = Field(default_factory=dict)
    threadStrategy: StateMachineThreadStrategy = (
        StateMachineThreadStrategy.continue_current_thread
    )
    stopIfRunning: bool = False
    engineConfigId: ID | None = None
    agentProfileId: ID | None = None
    permissionMode: str | None = None
    searchEnabled: bool | None = None


class StateMachineEdge(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    machineGroupId: str
    sourceSectionId: ID
    sourcePortId: str
    targetSectionId: ID
    targetPortId: str
    sourceFilter: StateMachineSourceFilter | None = None
    sourceActivationCountCondition: (
        StateMachineSourceActivationCountCondition | None
    ) = None
    targetAction: StateMachineTargetAction | None = None
    style: dict[str, str | int | float] | None = None
    hidden: bool = False
    zIndex: int = 0
    selected: bool = False


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


class WatchCodeCallableKind(str, Enum):
    function = "function"
    async_function = "async_function"
    class_init = "class_init"


class WatchCodeFolder(BaseModel, extra="forbid"):
    path: str
    recursive: bool = True


class WatchCodeRegistryEntry(BaseModel, extra="forbid"):
    callableName: str
    kind: WatchCodeCallableKind
    signatureHash: str
    bodyHash: str
    sourcePath: str
    sectionIds: list[ID] = Field(default_factory=list)
    sectionsCount: int = 0


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
        CodeObjType.DateParam,
        CodeObjType.TimeParam,
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


class ProjectCodegenPythonTarget(BaseModel, extra="forbid"):
    language: Literal[ProjectCodegenLanguage.python] = ProjectCodegenLanguage.python
    genCodePrefix: str = ""
    genCodeSuffix: str = f"{GEN_CODE_INSTANCE_NAME} = {GEN_CODE_CLASS_NAME}()"
    generateMetadata: bool = False
    sectionPolicy: SectionCodegenPolicy = Field(default_factory=SectionCodegenPolicy)
    codeObjValuePolicy: CodeObjValuePolicy = Field(default_factory=CodeObjValuePolicy)


class ProjectCodegenPluginTarget(BaseModel, extra="forbid"):
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


def get_python_codegen_target(
    project_config: "ProjectConfig",
) -> ProjectCodegenPythonTarget | None:
    for target in project_config.codegenTargets:
        if target.language == ProjectCodegenLanguage.python:
            if not isinstance(target, ProjectCodegenPythonTarget):
                raise TypeError("Expected python codegen target.")
            return target
    return None


class ProjectConfig(BaseModel, extra="forbid"):
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
