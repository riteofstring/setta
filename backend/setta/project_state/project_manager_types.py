from dataclasses import dataclass

from pydantic import BaseModel

from setta.types.project_state import ProjectStateSingleConfig, TopLevelSectionLayout
from setta.types.section_impls import SectionType
from setta.types.simplified_states import Position


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


class CreateNewSectionVersionRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class UndoRequest(BaseModel):
    projectConfigId: str
    steps: int


class RedoRequest(BaseModel):
    projectConfigId: str
    steps: int


class UpdateFromFrontendRequest(BaseModel):
    messageId: str | None = None
    projectState: ProjectStateSingleConfig
    requestRenameRefactor: bool = False
    modCount: int


class GetLatestProjectStateRequest(BaseModel):
    projectConfigId: str


class UpdateFromFrontendTopLevelSectionLayout(BaseModel):
    projectConfigId: str
    topLevelSections: dict[str, TopLevelSectionLayout]
    modCount: int


class AddKwargRequest(BaseModel):
    projectConfigId: str
    sectionId: str


class DeleteKwargRequest(BaseModel):
    projectConfigId: str
    sectionId: str


@dataclass
class ProjectStateSingleConfigWithModCount:
    projectState: ProjectStateSingleConfig
    modCount: int
