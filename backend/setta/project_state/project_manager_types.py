from dataclasses import dataclass

from pydantic import BaseModel

from setta.types.generated.unions import BaseSectionImplArgsUnion
from setta.types.project_state import ProjectStateSingleConfig, TopLevelSectionLayout
from setta.types.section_impls import SectionSize, SectionType
from setta.types.simplified_states import Position


class ProjectManagerRequest(BaseModel):
    opId: str


class ClearTextFieldCompletionRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None


class SetCallableRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    callableName: str
    refetchParams: bool


class TextFieldCompletionRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(ProjectManagerRequest):
    projectConfigId: str
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(ProjectManagerRequest):
    projectConfigId: str
    fullText: str
    position: int


class ChangeParamImplRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    selectedId: str


class UpdateParamImplConfigRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    newConfig: dict


class CreateTopLevelSectionRequest(ProjectManagerRequest):
    projectConfigId: str
    implType: SectionType
    implOverrides: BaseSectionImplArgsUnion
    position: Position


class CreateChildSectionsRequest(ProjectManagerRequest):
    projectConfigId: str
    parentId: str
    implType: SectionType
    numChildren: int
    startIdx: int | None


class CreateChildSectionsViaIncrementerRequest(ProjectManagerRequest):
    projectConfigId: str
    calledBy: str
    numChildren: int
    implType: SectionType


class DeleteSectionsRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionIds: list[str]


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequest):
    projectConfigId: str
    calledBy: str
    numChildren: int


class CreateNewSectionVariantRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str


class UndoRequest(ProjectManagerRequest):
    projectConfigId: str
    steps: int


class RedoRequest(ProjectManagerRequest):
    projectConfigId: str
    steps: int


class GetLatestProjectStateRequest(ProjectManagerRequest):
    projectConfigId: str


class SetTopLevelSectionLayoutRequest(ProjectManagerRequest):
    projectConfigId: str
    topLevelSections: dict[str, TopLevelSectionLayout]


class AddKwargRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str


class DeleteKwargRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str


class DeleteSectionVariantRequestOrAsk(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantJSONSourceRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    variantId: str


class DeleteJSONSourceFileAndVariantRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    variantId: str
    filepath: str


class SetTextBlockTextRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    text: str


class SetGenCodePrefixRequest(ProjectManagerRequest):
    projectConfigId: str
    genCodePrefix: str


class SetGenCodeSuffixRequest(ProjectManagerRequest):
    projectConfigId: str
    genCodeSuffix: str


class SetParamEnteredValueRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    value: str


class SetCodeObjNameRequest(ProjectManagerRequest):
    projectConfigId: str
    codeObjId: str
    name: str


class TogglePositionLockRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str


class ToggleMinimizedRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str


class SetCodeRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    code: str


class SetSectionParamFilterRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    value: str


class SetSectionVariantRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    variantId: str


class SetDefaultSectionVariantRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantFrozenRequest(ProjectManagerRequest):
    projectConfigId: str
    variantId: str


class SetSectionVariantNameRequest(ProjectManagerRequest):
    projectConfigId: str
    variantId: str
    name: str


class SetSectionSizesRequest(ProjectManagerRequest):
    projectConfigId: str
    sectionSizes: dict[str, SectionSize]


@dataclass
class ProjectStateSingleConfigWithCompletedOpIds:
    projectState: ProjectStateSingleConfig
    completedOpIds: list[str]
