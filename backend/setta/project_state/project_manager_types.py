from dataclasses import dataclass

from pydantic import BaseModel, Field

from setta.code_gen.dependency_graph import RenameReferenceChangedValue
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
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
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


class ProjectManagerRequestWithFrontendOp(BaseModel):
    frontendOpId: str | None = None


class ProjectManagerRequestWithProjectConfig(ProjectManagerRequestWithFrontendOp):
    """Base request payload for operations scoped to a project configuration."""

    projectConfigId: ID = Field(
        description="Project configuration being queried or mutated.",
    )


class ClearTextFieldCompletionRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    paramInfoId: ID | None


class SetCallableRequest(ProjectManagerRequestWithProjectConfig):
    """Request payload for re-binding a callable section implementation."""

    sectionId: ID = Field(
        description="Section whose callable implementation should be replaced.",
    )
    callableName: str = Field(
        description="Fully-qualified callable identifier to store on the section.",
    )
    refetchParams: bool = Field(
        description="True to refresh callable parameter definitions post-update.",
    )


class TextFieldCompletionRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    paramInfoId: ID | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(ProjectManagerRequestWithProjectConfig):
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(ProjectManagerRequestWithProjectConfig):
    fullText: str
    position: int


class ChangeParamImplRequest(ProjectManagerRequestWithProjectConfig):
    """Switch a parameter to a different implementation option."""

    sectionId: ID = Field(
        description="Section containing the parameter to rewire.",
    )
    paramInfoId: ID = Field(
        description="Identifier of the parameter that should change implementations.",
    )
    selectedId: ID = Field(
        description="Implementation identifier selected by the caller.",
    )


class UpdateParamImplConfigRequest(ProjectManagerRequestWithProjectConfig):
    """Persist a new configuration object for a parameter implementation."""

    sectionId: ID = Field(
        description="Section containing the parameter whose config should change.",
    )
    paramInfoId: ID = Field(
        description="Parameter to update within the section.",
    )
    newConfig: dict = Field(
        description="Arbitrary dict serialized into the implementation config.",
    )


class CreateTopLevelSectionRequest(ProjectManagerRequestWithProjectConfig):
    """Create a new section anchored at the top level of the canvas."""

    implType: SectionType = Field(
        description="Section implementation type to instantiate.",
    )
    implOverrides: BaseSectionImplArgsUnionWithDiscriminator = Field(
        description="Implementation-specific overrides applied during creation.",
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


class DeleteSectionsRequest(ProjectManagerRequestWithProjectConfig):
    """Delete one or more sections from the project state."""

    sectionIds: list[ID] = Field(
        description="Identifiers of every section that should be removed.",
    )


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequestWithProjectConfig):
    """Reduce an incrementer-controlled group by deleting existing children."""

    calledBy: ID = Field(
        description="Identifier of the decrementer or section requesting removal.",
    )
    numChildren: int = Field(
        description="How many trailing children to remove.",
    )


class CreateNewSectionVariantRequest(ProjectManagerRequestWithProjectConfig):
    """Clone the current section state into a new variant slot."""

    sectionId: ID = Field(
        description="Section whose active variant should be duplicated.",
    )


class UndoRequest(ProjectManagerRequestWithProjectConfig):
    steps: int


class RedoRequest(ProjectManagerRequestWithProjectConfig):
    steps: int


class GetLatestProjectStateRequest(ProjectManagerRequestWithProjectConfig):
    """Request a full snapshot of the specified project config's state."""


class ForceRefreshProjectRequest(ProjectManagerRequestWithProjectConfig):
    pass


class SetTopLevelSectionLayoutRequest(ProjectManagerRequestWithProjectConfig):
    """Override layout metadata for every top-level section in a config."""

    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(
        description="Mapping of section IDs to their serialized layout data.",
    )


class AddKwargRequest(ProjectManagerRequestWithProjectConfig):
    """Append a keyword argument entry to the callable section."""

    sectionId: ID = Field(
        description="Callable section that should gain a new kwarg.",
    )


class DeleteKwargRequest(ProjectManagerRequestWithProjectConfig):
    """Remove the most recently added keyword argument from a section."""

    sectionId: ID = Field(
        description="Callable section whose kwarg list should shrink.",
    )


class DeleteSectionVariantOrAskRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    variantId: ID


class ToggleVariantJSONSourceRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    variantId: ID


class DeleteJSONSourceFileAndVariantRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    variantId: ID
    filepath: str


class SetTextBlockTextRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
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


class SetParamEnteredValueRequest(ProjectManagerRequestWithProjectConfig):
    """Assign a new manual value to a parameter within a section."""

    sectionId: ID = Field(
        description="Section containing the parameter to override.",
    )
    paramInfoId: ID = Field(
        description="Identifier of the parameter receiving the new value.",
    )
    value: str = Field(
        description="Raw text value to persist for the parameter.",
    )


class SetCodeObjNameRequest(ProjectManagerRequestWithProjectConfig):
    """Rename a code object tracked within the project state."""

    codeObjId: ID = Field(
        description="Identifier of the code object that should be renamed.",
    )
    name: str = Field(
        description="New human-readable name to store on the code object.",
    )


class TogglePositionLockRequest(ProjectManagerRequestWithProjectConfig):
    """Flip the layout lock flag for a section."""

    sectionId: ID = Field(
        description="Section whose layout lock flag should be toggled.",
    )


class ToggleMinimizedRequest(ProjectManagerRequestWithProjectConfig):
    """Expand or collapse a section."""

    sectionId: ID = Field(
        description="Section to minimize or restore.",
    )


class SetCodeRequest(ProjectManagerRequestWithProjectConfig):
    """Submit inline code edits for a section."""

    sectionId: ID = Field(
        description="Section whose inline code should be overwritten.",
    )
    code: str = Field(
        description="Source text that replaces the section's existing code.",
    )


class CodeFileBindingUpdate(BaseModel):
    canonical_path: str
    access_mode: CodeFileAccessMode


class SetCodeFileBindingRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    binding: CodeFileBindingUpdate


class SetSectionParamFilterRequest(ProjectManagerRequestWithProjectConfig):
    """Set the interactive filter string applied to a section's parameters."""

    sectionId: ID = Field(
        description="Section whose parameter list should be filtered.",
    )
    value: str = Field(
        description="Raw text filter string; empty text clears any filter.",
    )


class SetSectionVariantRequest(ProjectManagerRequestWithProjectConfig):
    """Swap a section to the specified variant."""

    sectionId: ID = Field(
        description="Section whose variant should change.",
    )
    variantId: ID = Field(
        description="Identifier of the target variant to activate.",
    )


class SetDefaultSectionVariantRequest(ProjectManagerRequestWithProjectConfig):
    """Redefine which variant becomes the default for a section."""

    sectionId: ID = Field(
        description="Section whose default variant should change.",
    )
    variantId: ID = Field(
        description="Variant identifier that becomes the new default.",
    )


class ToggleVariantFrozenRequest(ProjectManagerRequestWithProjectConfig):
    variantId: ID


class SetSectionVariantNameRequest(ProjectManagerRequestWithProjectConfig):
    variantId: ID
    name: str


class SetSectionSizesRequest(ProjectManagerRequestWithProjectConfig):
    """Resize one or more sections within the specified project config."""

    sectionSizes: dict[ID, SectionSize] = Field(
        description="Mapping of section IDs to their desired width/height settings.",
    )


class SetActiveIdsRequest(ProjectManagerRequestWithProjectConfig):
    activeIds: list[ID]


class SetViewportRequest(ProjectManagerRequestWithProjectConfig):
    viewport: Viewport | None


class SetSectionNameRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    name: str


class AcceptRenameRefactorRequest(ProjectManagerRequestWithProjectConfig):
    pass


class DeclineRenameRefactorRequest(ProjectManagerRequestWithProjectConfig):
    pass


class RenameRefactorBroadcastContent(BaseModel):
    projectConfigId: ID
    frontendOpId: str
    renameMode: RenameRefactorMode
    changedNodeValues: list[RenameReferenceChangedValue]


class SetTextBlockDisplayModeRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    textDisplayMode: TextBlockDisplayMode


class SetSectionWithParamsDisplayModeRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    displayMode: SectionWithParamsDisplayMode


class SetCallableHideParamsRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    hideParams: bool


class SetSectionHideUnpinnedParamsRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    hideUnpinnedParams: bool


class SetBrowserAreaViewModeRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    viewMode: BrowserAreaViewMode


class SetBrowserHideColumnRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    hideColumn: bool


class SetTextBlockFormatRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    format: TextBlockFormat


class SetSocialUrlRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    url: str


class GroupSectionsRequest(ProjectManagerRequestWithProjectConfig):
    sectionIds: list[ID]


class UngroupGroupsRequest(ProjectManagerRequestWithProjectConfig):
    groupIds: list[ID]


class ToggleParamSelectedRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    paramInfoId: ID


class UnselectAllParamsRequest(ProjectManagerRequestWithProjectConfig):
    pass


class PrepareSectionsForCopyRequest(ProjectManagerRequestWithProjectConfig):
    sectionIds: list[ID]


class PasteSectionsRequest(ProjectManagerRequestWithProjectConfig):
    data: ProjectStateCoreWithSectionVariantMap
    position: Position
    asRef: bool


class SetImageAreaImagePathRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    imagePath: str


class SetChartAreaDataPathRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    dataPath: str


class SetChartTypeRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    chartType: ChartType


class SetChartSettingsRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    chartSettings: BaseChartSettingsUnionWithDiscriminator
    changedSettings: list[str]


class AppendDrawAreaLayerItemRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
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
