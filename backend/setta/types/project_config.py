from pydantic import Field, model_validator
from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.types.generated.go_shared_types import (
    AgenticEdge,
    CodeObjType,
    CodeObjTypeValuePolicy,
    CodeObjValuePolicy,
    CodeObjValueRepresentationMode,
    Edge,
    ProjectCodegenLanguage,
    ProjectCodegenPluginTarget,
    ProjectCodegenPythonTarget,
    SectionCodegenMode,
    SectionCodegenPolicy,
    SectionRepresentationMode,
    SectionType,
    SectionTypeCodegenPolicy,
    StateMachineEdge,
    TopLevelSectionLayout,
    Viewport,
    WatchCodeFolder,
    WatchCodeRegistryEntry,
    WindowSpaceConfig,
)
from setta.types.generated.go_shared_types import (
    ProjectConfig as GoProjectConfig,
)
from setta.types.generated.go_shared_types import (
    ViewMode as ViewModeConfig,
)
from setta.types.id import ID, create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


_DEFAULT_SECTION_ALLOWLIST: tuple[SectionType, ...] = (
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
)

_DEFAULT_META_CONTROL_ALLOWLIST: tuple[CodeObjType, ...] = (
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
)

_FILE_READ_SECTION_TYPES: frozenset[SectionType] = frozenset(
    {SectionType.Chat, SectionType.Draw, SectionType.Image}
)
_STRING_CODE_OBJ_TYPES: frozenset[CodeObjType] = frozenset(
    {
        CodeObjType.TextParam,
        CodeObjType.DateParam,
        CodeObjType.TimeParam,
        CodeObjType.TextAreaParam,
        CodeObjType.PasswordParam,
        CodeObjType.ColorPickerParam,
    }
)


def default_codegen_targets() -> list[
    ProjectCodegenPythonTarget | ProjectCodegenPluginTarget
]:
    return [
        ProjectCodegenPythonTarget(
            language=ProjectCodegenLanguage.python,
            genCodePrefix="",
            genCodeSuffix=f"{GEN_CODE_INSTANCE_NAME} = {GEN_CODE_CLASS_NAME}()",
            generateMetadata=False,
            sectionPolicy=SectionCodegenPolicy(
                allowlist=list(_DEFAULT_SECTION_ALLOWLIST),
                metaControlAllowlist=list(_DEFAULT_META_CONTROL_ALLOWLIST),
                exclude=[],
                typePolicies={
                    section_type: SectionTypeCodegenPolicy(
                        mode=SectionCodegenMode.inherit,
                        representation=(
                            SectionRepresentationMode.file_read
                            if section_type in _FILE_READ_SECTION_TYPES
                            else SectionRepresentationMode.expression
                        ),
                    )
                    for section_type in SectionType
                },
                sectionOverrides={},
            ),
            codeObjValuePolicy=CodeObjValuePolicy(
                typePolicies={
                    code_obj_type: CodeObjTypeValuePolicy(
                        representation=(
                            CodeObjValueRepresentationMode.string
                            if code_obj_type in _STRING_CODE_OBJ_TYPES
                            else (
                                CodeObjValueRepresentationMode.file_path
                                if code_obj_type is CodeObjType.DropzoneParam
                                else CodeObjValueRepresentationMode.expression
                            )
                        ),
                    )
                    for code_obj_type in CodeObjType
                },
                codeObjOverrides={},
            ),
        )
    ]


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
    codegenTargets: list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget] = (
        Field(default_factory=default_codegen_targets)
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
            language = target.language
            if isinstance(target, ProjectCodegenPluginTarget):
                normalized = target.language.strip()
                if normalized == "":
                    raise ValueError("Plugin codegen target language cannot be empty.")
                if normalized == ProjectCodegenLanguage.python.value:
                    raise ValueError("Plugin codegen target language cannot be python.")
                if normalized != target.language:
                    target.language = normalized
                language = normalized
            if language in seen:
                raise ValueError(f"Duplicate codegen target language: {language}")
            seen.add(language)
        return self
