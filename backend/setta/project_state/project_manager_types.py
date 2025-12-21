from dataclasses import dataclass

from pydantic import BaseModel, Field

from setta.code_gen.dependency_graph import RenameReferenceChangedValue
from setta.project_state.lsp_response_handlers.signatureHelp import SignatureHelpStatus
from setta.types.artifact import ChartType, DrawAreaLayerItem
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.generated.chart_settings_unions import (
    BaseChartSettingsUnionWithDiscriminator,
)
from setta.types.generated.unions import (
    BaseSectionImplArgsUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.project_config import Position, TopLevelSectionLayout, Viewport
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BrowserAreaViewMode,
    CodeFileAccessMode,
    SectionSize,
    SectionType,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
)
from setta.types.settings_state import RenameRefactorMode
from setta.utils.constants import C


class ProjectManagerRequestWithFrontendOp(BaseModel):
    frontendOpId: str | None = None


class ProjectManagerRequestWithProjectConfig(ProjectManagerRequestWithFrontendOp):
    """Base request payload for operations scoped to a project configuration."""

    projectConfigId: ID = Field(
        description="Project configuration being queried or mutated.",
    )


class ProjectManagerRequestWithSection(ProjectManagerRequestWithProjectConfig):
    """Base request payload for operations targeting a single section."""

    sectionId: ID = Field(
        description="Section targeted by the request.",
    )


class ProjectManagerRequestWithSectionVariant(ProjectManagerRequestWithSection):
    """Base request payload for operations targeting a specific section variant."""

    variantId: ID = Field(
        description="Variant targeted by the request.",
    )


class ProjectManagerRequestWithVariant(ProjectManagerRequestWithProjectConfig):
    """Base request payload for operations targeting a variant without section context."""

    variantId: ID = Field(
        description="Variant targeted by the request.",
    )


class ProjectManagerRequestWithSectionParam(ProjectManagerRequestWithSection):
    """Base request payload for operations targeting a parameter within a section."""

    paramInfoId: ID = Field(
        description="Parameter targeted by the request.",
    )


class ProjectManagerRequestWithSectionIds(ProjectManagerRequestWithProjectConfig):
    """Base request payload for operations referencing multiple sections."""

    sectionIds: list[ID] = Field(
        description="Identifiers of the sections targeted by the request.",
    )


class ClearTextFieldCompletionRequest(ProjectManagerRequestWithSection):
    paramInfoId: ID | None


class SetCallableRequest(ProjectManagerRequestWithSection):
    """Request payload for re-binding a callable section implementation."""

    callableName: str = Field(
        description="Fully-qualified callable identifier to store on the section.",
    )
    refetchParams: bool = Field(
        description="True to refresh callable parameter definitions post-update.",
    )


class SetCallableChildCodeObj(BaseModel):
    codeObjId: ID = Field(
        description="Identifier of the parameter code object bound to the callable.",
    )
    name: str = Field(
        description="Name of the parameter code object bound to the callable.",
    )


class SetCallableResponse(BaseModel):
    callableId: ID | None = Field(
        default=None,
        description="The callable currently attached to the section after the update.",
    )
    childCodeObjs: list[SetCallableChildCodeObj] = Field(
        default_factory=list,
        description="Ordered parameter code objects associated with the callable.",
    )
    lspStatus: SignatureHelpStatus = Field(
        description="Outcome of the signatureHelp request used to discover parameters.",
    )


class TextFieldCompletionRequest(ProjectManagerRequestWithSection):
    paramInfoId: ID | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(ProjectManagerRequestWithSection):
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(ProjectManagerRequestWithProjectConfig):
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(ProjectManagerRequestWithProjectConfig):
    fullText: str
    position: int


class ChangeParamImplRequest(ProjectManagerRequestWithSectionParam):
    """Switch a parameter to a different implementation option."""

    selectedId: ID = Field(
        description="Implementation identifier selected by the caller.",
    )


class UpdateParamImplConfigRequest(ProjectManagerRequestWithSectionParam):
    """Persist a new configuration object for a parameter implementation."""

    newConfig: dict = Field(
        description="Arbitrary dict serialized into the implementation config.",
    )


class CreateTopLevelSectionRequest(ProjectManagerRequestWithProjectConfig):
    """Create a new section anchored at the top level of the canvas."""

    implType: SectionType = Field(
        description="Section implementation type to instantiate.",
    )
    implOverrides: BaseSectionImplArgsUnionWithDiscriminator | None = Field(
        default=None,
        description="Implementation-specific overrides applied during creation.",
        json_schema_extra={C.MCP_HIDDEN_FIELD_SCHEMA_KEY: True},
    )
    position: Position = Field(
        description="Canvas coordinates where the section should be placed.",
    )


class CreateChildSectionsRequest(ProjectManagerRequestWithProjectConfig):
    """Insert one or more child sections directly beneath a parent."""

    parentId: ID = Field(
        description="Parent section that will receive the newly created children.",
    )
    implType: SectionType = Field(
        description="Implementation type shared by each created child.",
    )
    numChildren: int = Field(
        description="Total children to create within the parent.",
    )
    startIdx: int | None = Field(
        description="Optional insertion index determining where children are placed.",
    )


class CreateChildSectionsViaIncrementerRequest(ProjectManagerRequestWithProjectConfig):
    """Expand incrementer controls by creating additional repeated children."""

    calledBy: ID = Field(
        description="Identifier of the incrementer or section initiating the action.",
    )
    numChildren: int = Field(
        description="Number of children the incrementer should add.",
    )
    implType: SectionType = Field(
        description="Implementation type used for each new child.",
    )


class DeleteSectionsRequest(ProjectManagerRequestWithSectionIds):
    """Delete one or more sections from the project state."""


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequestWithProjectConfig):
    """Reduce an incrementer-controlled group by deleting existing children."""

    calledBy: ID = Field(
        description="Identifier of the decrementer or section requesting removal.",
    )
    numChildren: int = Field(
        description="How many trailing children to remove.",
    )


class CreateNewSectionVariantRequest(ProjectManagerRequestWithSection):
    """Clone the current section state into a new variant slot."""


class CreateViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Create a new view mode with default visibility settings."""


class SetActiveViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Set the active view mode for the project config."""

    activeViewModeId: ID = Field(
        description="Identifier of the view mode to activate.",
    )


class ToggleIsEditingViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Toggle the active view mode between edit and preview."""


class ToggleSectionVisibilityRequest(ProjectManagerRequestWithSectionIds):
    """Toggle visibility for sections in the active view mode."""


class ToggleViewModeUserFacingRequest(ProjectManagerRequestWithProjectConfig):
    """Update whether a view mode is considered user-facing."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to update.",
    )


class SetViewModeNameRequest(ProjectManagerRequestWithProjectConfig):
    """Rename a view mode in the current project config."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to rename.",
    )
    name: str = Field(
        description="New display name for the view mode.",
    )


class DeleteViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Remove a view mode from the current project config."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to delete.",
    )


class UndoRequest(ProjectManagerRequestWithProjectConfig):
    steps: int


class RedoRequest(ProjectManagerRequestWithProjectConfig):
    steps: int


class GetLatestProjectStateRequest(ProjectManagerRequestWithProjectConfig):
    """Request a full snapshot of the specified project config's state."""


class GetLatestProjectStateSummaryRequest(ProjectManagerRequestWithProjectConfig):
    """Request a lightweight summary snapshot of the specified project config."""


class ForceRefreshProjectRequest(ProjectManagerRequestWithProjectConfig):
    pass


class SetTopLevelSectionLayoutRequest(ProjectManagerRequestWithProjectConfig):
    """Override layout metadata for every top-level section in a config."""

    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(
        description="Mapping of section IDs to their serialized layout data.",
    )


class AddKwargRequest(ProjectManagerRequestWithSection):
    """Append a keyword argument entry to the callable section."""


class DeleteKwargRequest(ProjectManagerRequestWithSection):
    """Remove the most recently added keyword argument from a section."""


class DeleteSectionVariantOrAskRequest(ProjectManagerRequestWithSectionVariant):
    pass


class ToggleVariantJSONSourceRequest(ProjectManagerRequestWithSectionVariant):
    pass


class DeleteJSONSourceFileAndVariantRequest(ProjectManagerRequestWithSectionVariant):
    filepath: str


class SetTextBlockTextRequest(ProjectManagerRequestWithSection):
    text: str


class SetGenCodePrefixRequest(ProjectManagerRequestWithProjectConfig):
    """Update the text prepended to generated Python code."""

    genCodePrefix: str = Field(
        description="Arbitrary prefix inserted at the start of generated code files.",
    )


class SetGenCodeSuffixRequest(ProjectManagerRequestWithProjectConfig):
    """Update the text appended to generated Python code."""

    genCodeSuffix: str = Field(
        description="Suffix appended to the end of generated code files.",
    )


class SetParamEnteredValueRequest(ProjectManagerRequestWithSectionParam):
    """Assign a new manual value to a parameter within a section."""

    value: str = Field(
        description="Raw text value to persist for the parameter.",
    )


class SetMetaControlValueRequest(ProjectManagerRequestWithSection):
    """Assign a new manual value to a meta control section."""

    value: str = Field(
        description="Raw text value to persist for the meta control.",
    )


class SetCodeObjNameRequest(ProjectManagerRequestWithProjectConfig):
    """Rename a code object tracked within the project state."""

    codeObjId: ID = Field(
        description="Identifier of the code object that should be renamed.",
    )
    name: str = Field(
        description="New human-readable name to store on the code object.",
    )


class TogglePositionLockRequest(ProjectManagerRequestWithSection):
    """Flip the layout lock flag for a section."""


class ToggleMinimizedRequest(ProjectManagerRequestWithSection):
    """Expand or collapse a section."""


class SetCodeRequest(ProjectManagerRequestWithSection):
    """Submit inline code edits for a section."""

    code: str = Field(
        description="Source text that replaces the section's existing code.",
    )


class CodeFileBindingUpdate(BaseModel):
    canonical_path: str
    access_mode: CodeFileAccessMode


class SetCodeFileBindingRequest(ProjectManagerRequestWithSection):
    binding: CodeFileBindingUpdate


class SetSectionParamFilterRequest(ProjectManagerRequestWithSection):
    """Set the interactive filter string applied to a section's parameters."""

    value: str = Field(
        description="Raw text filter string; empty text clears any filter.",
    )


class SetSectionVariantRequest(ProjectManagerRequestWithSectionVariant):
    """Swap a section to the specified variant."""

    pass


class SetDefaultSectionVariantRequest(ProjectManagerRequestWithSectionVariant):
    """Redefine which variant becomes the default for a section."""

    pass


class ToggleVariantFrozenRequest(ProjectManagerRequestWithVariant):
    pass


class SetSectionVariantNameRequest(ProjectManagerRequestWithVariant):
    name: str


class SetSectionSizesRequest(ProjectManagerRequestWithProjectConfig):
    """Resize one or more sections and persist their section size settings."""

    sectionSizes: dict[ID, SectionSize] = Field(
        description=(
            "Mapping of section IDs to their desired width/height size settings."
        ),
    )


class SetActiveIdsRequest(ProjectManagerRequestWithProjectConfig):
    activeIds: list[ID]


class SetViewportRequest(ProjectManagerRequestWithProjectConfig):
    viewport: Viewport | None


class SetSectionNameRequest(ProjectManagerRequestWithSection):
    """Request payload for renaming a section without changing variants."""

    name: str = Field(
        description="New display name that should be stored on the section.",
    )


class AcceptRenameRefactorRequest(ProjectManagerRequestWithProjectConfig):
    pass


class DeclineRenameRefactorRequest(ProjectManagerRequestWithProjectConfig):
    pass


class RenameRefactorBroadcastContent(BaseModel):
    projectConfigId: ID
    frontendOpId: str
    renameMode: RenameRefactorMode
    changedNodeValues: list[RenameReferenceChangedValue]


class SetTextBlockDisplayModeRequest(ProjectManagerRequestWithSection):
    textDisplayMode: TextBlockDisplayMode


class SetSectionWithParamsDisplayModeRequest(ProjectManagerRequestWithSection):
    displayMode: SectionWithParamsDisplayMode


class SetCallableHideParamsRequest(ProjectManagerRequestWithSection):
    hideParams: bool


class SetSectionHideUnpinnedParamsRequest(ProjectManagerRequestWithSection):
    hideUnpinnedParams: bool


class SetSectionColumnWidthRequest(ProjectManagerRequestWithSection):
    columnWidth: float | None


class SetBrowserColumnWidthsRequest(ProjectManagerRequestWithSection):
    columnWidth: float | None
    typesColumnWidth: float | None


class SetBrowserAreaViewModeRequest(ProjectManagerRequestWithSection):
    viewMode: BrowserAreaViewMode


class SetBrowserHideColumnRequest(ProjectManagerRequestWithSection):
    hideColumn: bool


class SetTextBlockFormatRequest(ProjectManagerRequestWithSection):
    format: TextBlockFormat


class SetSocialUrlRequest(ProjectManagerRequestWithSection):
    url: str


class MoveSectionRequest(ProjectManagerRequestWithSection):
    newParentId: ID | None
    newIndex: int | None
    position: Position | None


class GroupSectionsRequest(ProjectManagerRequestWithSectionIds):
    pass


class UngroupGroupsRequest(ProjectManagerRequestWithProjectConfig):
    groupIds: list[ID]


class ToggleParamSelectedRequest(ProjectManagerRequestWithSectionParam):
    pass


class UnselectAllParamsRequest(ProjectManagerRequestWithProjectConfig):
    pass


class PrepareSectionsForCopyRequest(ProjectManagerRequestWithSectionIds):
    pass


class PasteSectionsRequest(ProjectManagerRequestWithProjectConfig):
    data: ProjectStateCoreWithSectionVariantMap
    position: Position
    asRef: bool


class SetImageAreaImagePathRequest(ProjectManagerRequestWithSection):
    imagePath: str


class SetChartAreaDataPathRequest(ProjectManagerRequestWithSection):
    dataPath: str


class SetChartTypeRequest(ProjectManagerRequestWithSection):
    chartType: ChartType


class SetChartSettingsRequest(ProjectManagerRequestWithSection):
    chartSettings: BaseChartSettingsUnionWithDiscriminator
    changedSettings: list[str]


class AppendDrawAreaLayerItemRequest(ProjectManagerRequestWithSection):
    layerIdx: int
    element: DrawAreaLayerItem


@dataclass
class ProjectStateSingleConfigWithCompletedOpIds:
    projectState: ProjectStateSingleConfig
    completedOpIds: list[str]
    pendingOpIds: list[str]


class SaveAsNewProjectConfigRequest(ProjectManagerRequestWithProjectConfig):
    newConfigName: str
    withRefs: bool
