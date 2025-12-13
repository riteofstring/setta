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
    sectionId: ID
    paramInfoId: ID
    selectedId: ID


class UpdateParamImplConfigRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    paramInfoId: ID
    newConfig: dict


class CreateTopLevelSectionRequest(ProjectManagerRequestWithProjectConfig):
    implType: SectionType
    implOverrides: BaseSectionImplArgsUnionWithDiscriminator
    position: Position


class CreateChildSectionsRequest(ProjectManagerRequestWithProjectConfig):
    parentId: ID
    implType: SectionType
    numChildren: int
    startIdx: int | None


class CreateChildSectionsViaIncrementerRequest(ProjectManagerRequestWithProjectConfig):
    calledBy: ID
    numChildren: int
    implType: SectionType


class DeleteSectionsRequest(ProjectManagerRequestWithProjectConfig):
    sectionIds: list[ID]


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequestWithProjectConfig):
    calledBy: ID
    numChildren: int


class CreateNewSectionVariantRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID


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
    sectionId: ID


class DeleteKwargRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID


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
    sectionId: ID
    value: str


class SetSectionVariantRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    variantId: ID


class SetDefaultSectionVariantRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    variantId: ID


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
