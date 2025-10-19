from dataclasses import dataclass

from pydantic import BaseModel

from setta.types.artifact import ChartType, DrawAreaLayerItem
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.generated.chart_settings_unions import (
    BaseChartSettingsUnionWithDiscriminator,
)
from setta.types.generated.unions import (
    BaseSectionImplArgsUnionWithDiscriminator,
)
from setta.types.project_config import TopLevelSectionLayout, Viewport
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BrowserAreaViewMode,
    CodeSyncMode,
    SectionSize,
    SectionType,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
)
from setta.types.simplified_states import Position


class ProjectManagerRequestWithFrontendOp(BaseModel):
    frontendOpId: str | None = None


class ClearTextFieldCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None


class SetCallableRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    callableName: str
    refetchParams: bool


class TextFieldCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    fullText: str
    position: int


class ChangeParamImplRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    selectedId: str


class UpdateParamImplConfigRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    newConfig: dict


class CreateTopLevelSectionRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    implType: SectionType
    implOverrides: BaseSectionImplArgsUnionWithDiscriminator
    position: Position


class CreateChildSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    parentId: str
    implType: SectionType
    numChildren: int
    startIdx: int | None


class CreateChildSectionsViaIncrementerRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    calledBy: str
    numChildren: int
    implType: SectionType


class DeleteSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionIds: list[str]


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    calledBy: str
    numChildren: int


class CreateNewSectionVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str


class UndoRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    steps: int


class RedoRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    steps: int


class GetLatestProjectStateRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str


class SetTopLevelSectionLayoutRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    topLevelSections: dict[str, TopLevelSectionLayout]


class AddKwargRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str


class DeleteKwargRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str


class DeleteSectionVariantOrAskRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantJSONSourceRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    variantId: str


class DeleteJSONSourceFileAndVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    variantId: str
    filepath: str


class SetTextBlockTextRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    text: str


class SetGenCodePrefixRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    genCodePrefix: str


class SetGenCodeSuffixRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    genCodeSuffix: str


class SetParamEnteredValueRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    value: str


class SetCodeObjNameRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    codeObjId: str
    name: str


class TogglePositionLockRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str


class ToggleMinimizedRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str


class SetCodeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    code: str
    filePath: str | None = None
    syncMode: CodeSyncMode | None = None
    fileMissing: bool | None = None


class SetSectionParamFilterRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    value: str


class SetSectionVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    variantId: str


class SetDefaultSectionVariantRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantFrozenRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    variantId: str


class SetSectionVariantNameRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    variantId: str
    name: str


class SetSectionSizesRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionSizes: dict[str, SectionSize]


class SetActiveIdsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    activeIds: list[str]


class SetViewportRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    viewport: Viewport | None


class SetSectionNameRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    name: str


class SetTextBlockDisplayModeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    displayMode: TextBlockDisplayMode


class SetSectionWithParamsDisplayModeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    displayMode: SectionWithParamsDisplayMode


class SetCallableHideParamsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    hideParams: bool


class SetSectionHideUnpinnedParamsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    hideUnpinnedParams: bool


class SetBrowserAreaViewModeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    viewMode: BrowserAreaViewMode


class SetBrowserHideColumnRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    hideColumn: bool


class SetTextBlockFormatRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    format: TextBlockFormat


class SetSocialUrlRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    url: str


class GroupSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionIds: list[str]


class UngroupGroupsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    groupIds: list[str]


class ToggleParamSelectedRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    paramInfoId: str


class UnselectAllParamsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str


class PrepareSectionsForCopyRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionIds: list[str]


class PasteSectionsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    data: ProjectStateCoreWithSectionVariantMap
    position: Position
    asRef: bool


class SetImageAreaImagePathRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    imagePath: str


class SetChartAreaDataPathRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    dataPath: str


class SetChartTypeRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    chartType: ChartType


class SetChartSettingsRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    chartSettings: BaseChartSettingsUnionWithDiscriminator
    changedSettings: list[str]


class AppendDrawAreaLayerItemRequest(ProjectManagerRequestWithFrontendOp):
    projectConfigId: str
    sectionId: str
    layerIdx: int
    element: DrawAreaLayerItem


@dataclass
class ProjectStateSingleConfigWithCompletedOpIds:
    projectState: ProjectStateSingleConfig
    completedOpIds: list[str]
    pendingOpIds: list[str]


class SaveAsNewProjectConfigRequest(ProjectManagerRequestWithFrontendOp):
    project: ProjectStateSingleConfig
    newConfigName: str
    withRefs: bool


class SaveAsExistingProjectConfigRequest(ProjectManagerRequestWithFrontendOp):
    project: ProjectStateSingleConfig
    configName: str
