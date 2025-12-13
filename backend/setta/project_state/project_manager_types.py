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
    sectionId: ID
    callableName: str
    refetchParams: bool


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
    topLevelSections: dict[ID, TopLevelSectionLayout]


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
    genCodePrefix: str


class SetGenCodeSuffixRequest(ProjectManagerRequestWithProjectConfig):
    genCodeSuffix: str


class SetParamEnteredValueRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    paramInfoId: ID
    value: str


class SetCodeObjNameRequest(ProjectManagerRequestWithProjectConfig):
    codeObjId: ID
    name: str


class TogglePositionLockRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID


class ToggleMinimizedRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID


class SetCodeRequest(ProjectManagerRequestWithProjectConfig):
    sectionId: ID
    code: str


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
