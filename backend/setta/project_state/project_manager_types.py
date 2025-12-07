from dataclasses import dataclass

from pydantic import BaseModel

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


class ClearTextFieldCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    paramInfoId: ID | None


class SetCallableRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    callableName: str
    refetchParams: bool


class TextFieldCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    paramInfoId: ID | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    fullText: str
    position: int


class ChangeParamImplRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    paramInfoId: ID
    selectedId: ID


class UpdateParamImplConfigRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    paramInfoId: ID
    newConfig: dict


class CreateTopLevelSectionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    implType: SectionType
    implOverrides: BaseSectionImplArgsUnionWithDiscriminator
    position: Position


class CreateChildSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    parentId: ID
    implType: SectionType
    numChildren: int
    startIdx: int | None


class CreateChildSectionsViaIncrementerRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    calledBy: ID
    numChildren: int
    implType: SectionType


class DeleteSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionIds: list[ID]


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    calledBy: ID
    numChildren: int


class CreateNewSectionVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID


class UndoRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    steps: int


class RedoRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    steps: int


class GetLatestProjectStateRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID


class ForceRefreshProjectRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID


class SetTopLevelSectionLayoutRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    topLevelSections: dict[ID, TopLevelSectionLayout]


class AddKwargRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID


class DeleteKwargRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID


class DeleteSectionVariantOrAskRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    variantId: ID


class ToggleVariantJSONSourceRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    variantId: ID


class DeleteJSONSourceFileAndVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    variantId: ID
    filepath: str


class SetTextBlockTextRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    text: str


class SetGenCodePrefixRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    genCodePrefix: str


class SetGenCodeSuffixRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    genCodeSuffix: str


class SetParamEnteredValueRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    paramInfoId: ID
    value: str


class SetCodeObjNameRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    codeObjId: ID
    name: str


class TogglePositionLockRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID


class ToggleMinimizedRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID


class SetCodeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    code: str


class CodeFileBindingUpdate(BaseModel):
    canonical_path: str
    access_mode: CodeFileAccessMode


class SetCodeFileBindingRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    binding: CodeFileBindingUpdate


class SetSectionParamFilterRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    value: str


class SetSectionVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    variantId: ID


class SetDefaultSectionVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    variantId: ID


class ToggleVariantFrozenRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    variantId: ID


class SetSectionVariantNameRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    variantId: ID
    name: str


class SetSectionSizesRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionSizes: dict[ID, SectionSize]


class SetActiveIdsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    activeIds: list[ID]


class SetViewportRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    viewport: Viewport | None


class SetSectionNameRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    name: str


class AcceptRenameRefactorRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID


class DeclineRenameRefactorRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID


class RenameRefactorBroadcastContent(BaseModel):
    projectConfigId: ID
    frontendOpId: str
    renameMode: RenameRefactorMode
    changedNodeValues: list[RenameReferenceChangedValue]


class SetTextBlockDisplayModeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    textDisplayMode: TextBlockDisplayMode


class SetSectionWithParamsDisplayModeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    displayMode: SectionWithParamsDisplayMode


class SetCallableHideParamsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    hideParams: bool


class SetSectionHideUnpinnedParamsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    hideUnpinnedParams: bool


class SetBrowserAreaViewModeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    viewMode: BrowserAreaViewMode


class SetBrowserHideColumnRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    hideColumn: bool


class SetTextBlockFormatRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    format: TextBlockFormat


class SetSocialUrlRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    url: str


class GroupSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionIds: list[ID]


class UngroupGroupsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    groupIds: list[ID]


class ToggleParamSelectedRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    paramInfoId: ID


class UnselectAllParamsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID


class PrepareSectionsForCopyRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionIds: list[ID]


class PasteSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    data: ProjectStateCoreWithSectionVariantMap
    position: Position
    asRef: bool


class SetImageAreaImagePathRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    imagePath: str


class SetChartAreaDataPathRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    dataPath: str


class SetChartTypeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    chartType: ChartType


class SetChartSettingsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    chartSettings: BaseChartSettingsUnionWithDiscriminator
    changedSettings: list[str]


class AppendDrawAreaLayerItemRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    sectionId: ID
    layerIdx: int
    element: DrawAreaLayerItem


@dataclass
class ProjectStateSingleConfigWithCompletedOpIds:
    projectState: ProjectStateSingleConfig
    completedOpIds: list[str]
    pendingOpIds: list[str]


class SaveAsNewProjectConfigRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: ID
    newConfigName: str
    withRefs: bool
