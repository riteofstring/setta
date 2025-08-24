from dataclasses import dataclass

from pydantic import BaseModel

from setta.types.generated.unions import BaseSectionImplArgsUnion
from setta.types.project_state import (
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
    Viewport,
)
from setta.types.section_impls import (
    SectionSize,
    SectionType,
    TextBlockDisplayMode,
    TextBlockFormat,
)
from setta.types.simplified_states import Position


class ProjectManagerRequestWithFrontendOp(BaseModel):
    frontendOpId: str


class ClearTextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None


class SetCallableRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    callableName: str
    refetchParams: bool


class TextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(BaseModel):
    projectConfigId: str
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(BaseModel):
    projectConfigId: str
    fullText: str
    position: int


class ChangeParamImplRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    selectedId: str


class UpdateParamImplConfigRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    newConfig: dict


class CreateTopLevelSectionRequest(BaseModel):
    projectConfigId: str
    implType: SectionType
    implOverrides: BaseSectionImplArgsUnion
    position: Position


class CreateChildSectionsRequest(BaseModel):
    projectConfigId: str
    parentId: str
    implType: SectionType
    numChildren: int
    startIdx: int | None


class CreateChildSectionsViaIncrementerRequest(BaseModel):
    projectConfigId: str
    calledBy: str
    numChildren: int
    implType: SectionType


class DeleteSectionsRequest(BaseModel):
    projectConfigId: str
    sectionIds: list[str]


class DeleteChildSectionsViaDecrementerRequest(BaseModel):
    projectConfigId: str
    calledBy: str
    numChildren: int


class CreateNewSectionVariantRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class UndoRequest(BaseModel):
    projectConfigId: str
    steps: int


class RedoRequest(BaseModel):
    projectConfigId: str
    steps: int


class GetLatestProjectStateRequest(BaseModel):
    projectConfigId: str


class SetTopLevelSectionLayoutRequest(BaseModel):
    projectConfigId: str
    topLevelSections: dict[str, TopLevelSectionLayout]


class AddKwargRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class DeleteKwargRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class DeleteSectionVariantOrAskRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantJSONSourceRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    variantId: str


class DeleteJSONSourceFileAndVariantRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    variantId: str
    filepath: str


class SetTextBlockTextRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    text: str


class SetGenCodePrefixRequest(BaseModel):
    projectConfigId: str
    genCodePrefix: str


class SetGenCodeSuffixRequest(BaseModel):
    projectConfigId: str
    genCodeSuffix: str


class SetParamEnteredValueRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    value: str


class SetCodeObjNameRequest(BaseModel):
    projectConfigId: str
    codeObjId: str
    name: str


class TogglePositionLockRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class ToggleMinimizedRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class SetCodeRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    code: str


class SetSectionParamFilterRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    value: str


class SetSectionVariantRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    variantId: str


class SetDefaultSectionVariantRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantFrozenRequest(BaseModel):
    projectConfigId: str
    variantId: str


class SetSectionVariantNameRequest(BaseModel):
    projectConfigId: str
    variantId: str
    name: str


class SetSectionSizesRequest(BaseModel):
    projectConfigId: str
    sectionSizes: dict[str, SectionSize]


class SetActiveIdsRequest(BaseModel):
    projectConfigId: str
    activeIds: list[str]


class SetViewportRequest(BaseModel):
    projectConfigId: str
    viewport: Viewport | None


class SetSectionNameRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    name: str


class SetTextBlockDisplayModeRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    displayMode: TextBlockDisplayMode


class SetTextBlockFormatRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    format: TextBlockFormat


class SetSocialUrlRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    url: str


class GroupSectionsRequest(BaseModel):
    projectConfigId: str
    sectionIds: list[str]
    position: Position


@dataclass
class ProjectStateSingleConfigWithCompletedOpIds:
    projectState: ProjectStateSingleConfig
    completedOpIds: list[str]
