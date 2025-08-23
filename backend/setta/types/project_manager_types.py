from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel

from setta.types.generated.unions import BaseSectionImplArgsUnion
from setta.types.project_state import ProjectStateSingleConfig, TopLevelSectionLayout
from setta.types.section_impls import SectionType
from setta.types.simplified_states import Position


class ProjectManagerUpdateType(str, Enum):
    ClearTextFieldCompletion = "ClearTextFieldCompletion"
    SetCallable = "SetCallable"
    TextFieldCompletion = "TextFieldCompletion"
    CodeAreaCompletion = "CodeAreaCompletion"
    GenCodePrefixCompletion = "GenCodePrefixCompletion"
    GenCodeSuffixCompletion = "GenCodeSuffixCompletion"
    ChangeParamImpl = "ChangeParamImpl"
    UpdateParamImplConfig = "UpdateParamImplConfig"
    CreateTopLevelSection = "CreateTopLevelSection"
    CreateChildSections = "CreateChildSections"
    CreateChildSectionsViaIncrementer = "CreateChildSectionsViaIncrementer"
    DeleteSections = "DeleteSections"
    DeleteChildSectionsViaDecrementer = "DeleteChildSectionsViaDecrementer"
    CreateNewSectionVariant = "CreateNewSectionVariant"
    Undo = "Undo"
    Redo = "Redo"
    UpdateFromFrontend = "UpdateFromFrontend"
    GetLatestProjectState = "GetLatestProjectState"
    UpdateFromFrontendTopLevelSectionLayout = "UpdateFromFrontendTopLevelSectionLayout"
    AddKwarg = "AddKwarg"
    DeleteKwarg = "DeleteKwarg"
    DeleteSectionVariantOrAsk = "DeleteSectionVariantOrAsk"
    ToggleVariantJSONSource = "ToggleVariantJSONSource"
    DeleteJSONSourceFileAndVariant = "DeleteJSONSourceFileAndVariant"
    SetTextBlockText = "SetTextBlockText"
    SetGenCodePrefix = "SetGenCodePrefix"
    SetGenCodeSuffix = "SetGenCodeSuffix"
    SetParamEnteredValue = "SetParamEnteredValue"
    SetCodeObjName = "SetCodeObjName"
    TogglePositionLock = "TogglePositionLock"


class BaseProjectManagerUpdateRequest(BaseModel):
    type: Any


class ClearTextFieldCompletionRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.ClearTextFieldCompletion] = (
        ProjectManagerUpdateType.ClearTextFieldCompletion
    )
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None


class SetCallableRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.SetCallable] = (
        ProjectManagerUpdateType.SetCallable
    )
    projectConfigId: str
    sectionId: str
    callableName: str
    refetchParams: bool


class TextFieldCompletionRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.TextFieldCompletion] = (
        ProjectManagerUpdateType.TextFieldCompletion
    )
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.CodeAreaCompletion] = (
        ProjectManagerUpdateType.CodeAreaCompletion
    )
    projectConfigId: str
    sectionId: str
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.GenCodePrefixCompletion] = (
        ProjectManagerUpdateType.GenCodePrefixCompletion
    )
    projectConfigId: str
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.GenCodeSuffixCompletion] = (
        ProjectManagerUpdateType.GenCodeSuffixCompletion
    )
    projectConfigId: str
    fullText: str
    position: int


class ChangeParamImplRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.ChangeParamImpl] = (
        ProjectManagerUpdateType.ChangeParamImpl
    )
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    selectedId: str


class UpdateParamImplConfigRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.UpdateParamImplConfig] = (
        ProjectManagerUpdateType.UpdateParamImplConfig
    )
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    newConfig: dict


class CreateTopLevelSectionRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.CreateTopLevelSection] = (
        ProjectManagerUpdateType.CreateTopLevelSection
    )
    projectConfigId: str
    implType: SectionType
    implOverrides: BaseSectionImplArgsUnion
    position: Position


class CreateChildSectionsRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.CreateChildSections] = (
        ProjectManagerUpdateType.CreateChildSections
    )
    projectConfigId: str
    parentId: str
    implType: SectionType
    numChildren: int
    startIdx: int | None


class CreateChildSectionsViaIncrementerRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.CreateChildSectionsViaIncrementer] = (
        ProjectManagerUpdateType.CreateChildSectionsViaIncrementer
    )
    projectConfigId: str
    calledBy: str
    numChildren: int
    implType: SectionType


class DeleteSectionsRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.DeleteSections] = (
        ProjectManagerUpdateType.DeleteSections
    )
    projectConfigId: str
    sectionIds: list[str]


class DeleteChildSectionsViaDecrementerRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.DeleteChildSectionsViaDecrementer] = (
        ProjectManagerUpdateType.DeleteChildSectionsViaDecrementer
    )
    projectConfigId: str
    calledBy: str
    numChildren: int


class CreateNewSectionVariantRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.CreateNewSectionVariant] = (
        ProjectManagerUpdateType.CreateNewSectionVariant
    )
    projectConfigId: str
    sectionId: str


class UndoRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.Undo] = ProjectManagerUpdateType.Undo
    projectConfigId: str
    steps: int


class RedoRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.Redo] = ProjectManagerUpdateType.Redo
    projectConfigId: str
    steps: int


class UpdateFromFrontendRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.UpdateFromFrontend] = (
        ProjectManagerUpdateType.UpdateFromFrontend
    )
    messageId: str | None = None
    projectState: ProjectStateSingleConfig
    requestRenameRefactor: bool = False
    modCount: int


class GetLatestProjectStateRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.GetLatestProjectState] = (
        ProjectManagerUpdateType.GetLatestProjectState
    )
    projectConfigId: str


class UpdateFromFrontendTopLevelSectionLayout(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.UpdateFromFrontendTopLevelSectionLayout] = (
        ProjectManagerUpdateType.UpdateFromFrontendTopLevelSectionLayout
    )
    projectConfigId: str
    topLevelSections: dict[str, TopLevelSectionLayout]
    modCount: int


class AddKwargRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.AddKwarg] = ProjectManagerUpdateType.AddKwarg
    projectConfigId: str
    sectionId: str


class DeleteKwargRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.DeleteKwarg] = (
        ProjectManagerUpdateType.DeleteKwarg
    )
    projectConfigId: str
    sectionId: str


class DeleteSectionVariantRequestOrAsk(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.DeleteSectionVariantOrAsk] = (
        ProjectManagerUpdateType.DeleteSectionVariantOrAsk
    )
    projectConfigId: str
    sectionId: str
    variantId: str


class ToggleVariantJSONSourceRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.ToggleVariantJSONSource] = (
        ProjectManagerUpdateType.ToggleVariantJSONSource
    )
    projectConfigId: str
    sectionId: str
    variantId: str


class DeleteJSONSourceFileAndVariantRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.DeleteJSONSourceFileAndVariant] = (
        ProjectManagerUpdateType.DeleteJSONSourceFileAndVariant
    )
    projectConfigId: str
    sectionId: str
    variantId: str
    filepath: str


class SetTextBlockTextRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.SetTextBlockText] = (
        ProjectManagerUpdateType.SetTextBlockText
    )
    projectConfigId: str
    sectionId: str
    text: str


class SetGenCodePrefixRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.SetGenCodePrefix] = (
        ProjectManagerUpdateType.SetGenCodePrefix
    )
    projectConfigId: str
    genCodePrefix: str


class SetGenCodeSuffixRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.SetGenCodeSuffix] = (
        ProjectManagerUpdateType.SetGenCodeSuffix
    )
    projectConfigId: str
    genCodeSuffix: str


class SetParamEnteredValueRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.SetParamEnteredValue] = (
        ProjectManagerUpdateType.SetParamEnteredValue
    )
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    value: str


class SetCodeObjNameRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.SetCodeObjName] = (
        ProjectManagerUpdateType.SetCodeObjName
    )
    projectConfigId: str
    codeObjId: str
    name: str


class TogglePositionLockRequest(BaseProjectManagerUpdateRequest):
    type: Literal[ProjectManagerUpdateType.TogglePositionLock] = (
        ProjectManagerUpdateType.TogglePositionLock
    )
    projectConfigId: str
    sectionId: str


@dataclass
class ProjectStateSingleConfigWithModCount:
    projectState: ProjectStateSingleConfig
    modCount: int
