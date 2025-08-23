from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.project_manager_types import (
    AddKwargRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantRequestOrAsk,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    RedoRequest,
    SetCallableRequest,
    SetCodeObjNameRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetParamEnteredValueRequest,
    SetTextBlockTextRequest,
    TextFieldCompletionRequest,
    TogglePositionLockRequest,
    ToggleVariantJSONSourceRequest,
    UndoRequest,
    UpdateFromFrontendRequest,
    UpdateFromFrontendTopLevelSectionLayout,
    UpdateParamImplConfigRequest,
)

BaseProjectManagerUpdateRequestUnion = Union[
    ClearTextFieldCompletionRequest,
    SetCallableRequest,
    TextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    ChangeParamImplRequest,
    UpdateParamImplConfigRequest,
    CreateTopLevelSectionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    DeleteSectionsRequest,
    DeleteChildSectionsViaDecrementerRequest,
    CreateNewSectionVariantRequest,
    UndoRequest,
    RedoRequest,
    UpdateFromFrontendRequest,
    GetLatestProjectStateRequest,
    UpdateFromFrontendTopLevelSectionLayout,
    AddKwargRequest,
    DeleteKwargRequest,
    DeleteSectionVariantRequestOrAsk,
    ToggleVariantJSONSourceRequest,
    DeleteJSONSourceFileAndVariantRequest,
    SetTextBlockTextRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetParamEnteredValueRequest,
    SetCodeObjNameRequest,
    TogglePositionLockRequest,
]

BaseProjectManagerUpdateRequestUnionWithDiscriminator = Annotated[
    BaseProjectManagerUpdateRequestUnion, Field(discriminator="type")
]

BaseProjectManagerUpdateRequestTypeAdapter = TypeAdapter(
    BaseProjectManagerUpdateRequestUnionWithDiscriminator
)

BaseProjectManagerUpdateRequestTypeSet = set(
    [
        "ClearTextFieldCompletion",
        "SetCallable",
        "TextFieldCompletion",
        "CodeAreaCompletion",
        "GenCodePrefixCompletion",
        "GenCodeSuffixCompletion",
        "ChangeParamImpl",
        "UpdateParamImplConfig",
        "CreateTopLevelSection",
        "CreateChildSections",
        "CreateChildSectionsViaIncrementer",
        "DeleteSections",
        "DeleteChildSectionsViaDecrementer",
        "CreateNewSectionVariant",
        "Undo",
        "Redo",
        "UpdateFromFrontend",
        "GetLatestProjectState",
        "UpdateFromFrontendTopLevelSectionLayout",
        "AddKwarg",
        "DeleteKwarg",
        "DeleteSectionVariantOrAsk",
        "ToggleVariantJSONSource",
        "DeleteJSONSourceFileAndVariant",
        "SetTextBlockText",
        "SetGenCodePrefix",
        "SetGenCodeSuffix",
        "SetParamEnteredValue",
        "SetCodeObjName",
        "TogglePositionLock",
    ]
)
