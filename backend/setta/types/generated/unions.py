from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictRootSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
    SocialSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)

BaseSectionImplUnion = Union[
    CallableSectionImpl,
    DictSectionImpl,
    ListRootSectionImpl,
    DictRootSectionImpl,
    GroupSectionImpl,
    ImageSectionImpl,
    ChartSectionImpl,
    DrawSectionImpl,
    TextBlockSectionImpl,
    SocialSectionImpl,
    GlobalVariablesSectionImpl,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
    TerminalSectionImpl,
    IFrameSectionImpl,
    ChatSectionImpl,
    BrowserSectionImpl,
]

BaseSectionImplUnionWithDiscriminator = Annotated[
    BaseSectionImplUnion, Field(discriminator="type")
]

BaseSectionImplTypeAdapter = TypeAdapter(BaseSectionImplUnionWithDiscriminator)

BaseSectionImplTypeSet = set(
    [
        "Callable",
        "Dict",
        "ListRoot",
        "DictRoot",
        "Group",
        "Image",
        "Chart",
        "Draw",
        "TextBlock",
        "Social",
        "GlobalVariables",
        "Code",
        "GenPythonCode",
        "Terminal",
        "IFrame",
        "Chat",
        "Browser",
    ]
)

BaseSectionWithParamsImplUnion = Union[
    CallableSectionImpl, DictSectionImpl, GlobalVariablesSectionImpl
]

BaseSectionWithParamsImplUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplUnionWithDiscriminator
)

BaseSectionWithParamsImplTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionImplUnion = Union[
    ImageSectionImpl, ChartSectionImpl, DrawSectionImpl
]

BaseArtifactSectionImplUnionWithDiscriminator = Annotated[
    BaseArtifactSectionImplUnion, Field(discriminator="type")
]

BaseArtifactSectionImplTypeAdapter = TypeAdapter(
    BaseArtifactSectionImplUnionWithDiscriminator
)

BaseArtifactSectionImplTypeSet = set(["Image", "Chart", "Draw"])

BaseCanvasSectionImplUnion = Union[ChartSectionImpl, DrawSectionImpl]

BaseCanvasSectionImplUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplUnion, Field(discriminator="type")
]

BaseCanvasSectionImplTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplUnionWithDiscriminator
)

BaseCanvasSectionImplTypeSet = set(["Chart", "Draw"])

BaseCodeSectionImplUnion = Union[CodeSectionImpl, GenPythonCodeSectionImpl]

BaseCodeSectionImplUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplUnion, Field(discriminator="type")
]

BaseCodeSectionImplTypeAdapter = TypeAdapter(BaseCodeSectionImplUnionWithDiscriminator)

BaseCodeSectionImplTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionImplUnion = Union[
    ListRootSectionImpl, DictRootSectionImpl, GroupSectionImpl
]

BaseParentSectionImplUnionWithDiscriminator = Annotated[
    BaseParentSectionImplUnion, Field(discriminator="type")
]

BaseParentSectionImplTypeAdapter = TypeAdapter(
    BaseParentSectionImplUnionWithDiscriminator
)

BaseParentSectionImplTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionImplUnion = Union[DictSectionImpl, GlobalVariablesSectionImpl]

BaseDictSectionImplUnionWithDiscriminator = Annotated[
    BaseDictSectionImplUnion, Field(discriminator="type")
]

BaseDictSectionImplTypeAdapter = TypeAdapter(BaseDictSectionImplUnionWithDiscriminator)

BaseDictSectionImplTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextParamCodeObjImpl,
)

BaseCodeObjImplUnion = Union[
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    TextParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    NestedParamCodeObjImpl,
]

BaseCodeObjImplUnionWithDiscriminator = Annotated[
    BaseCodeObjImplUnion, Field(discriminator="type")
]

BaseCodeObjImplTypeAdapter = TypeAdapter(BaseCodeObjImplUnionWithDiscriminator)

BaseCodeObjImplTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseParamCodeObjImplUnion = Union[
    CodeParamCodeObjImpl,
    TextParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    NestedParamCodeObjImpl,
]

BaseParamCodeObjImplUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplUnion, Field(discriminator="type")
]

BaseParamCodeObjImplTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplUnionWithDiscriminator
)

BaseParamCodeObjImplTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseChildlessCodeObjImplUnion = Union[
    CodeParamCodeObjImpl,
    TextParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    PasswordParamCodeObjImpl,
]

BaseChildlessCodeObjImplUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplUnionWithDiscriminator
)

BaseChildlessCodeObjImplTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
    ]
)

BaseParentCodeObjImplUnion = Union[CodeCallableCodeObjImpl, NestedParamCodeObjImpl]

BaseParentCodeObjImplUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplUnion, Field(discriminator="type")
]

BaseParentCodeObjImplTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplUnionWithDiscriminator
)

BaseParentCodeObjImplTypeSet = set(["CodeCallable", "NestedParam"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.cores import (
    BrowserSectionCore,
    CallableSectionCore,
    ChartSectionCore,
    ChatSectionCore,
    CodeSectionCore,
    DictRootSectionCore,
    DictSectionCore,
    DrawSectionCore,
    GenPythonCodeSectionCore,
    GlobalVariablesSectionCore,
    GroupSectionCore,
    IFrameSectionCore,
    ImageSectionCore,
    ListRootSectionCore,
    SocialSectionCore,
    TerminalSectionCore,
    TextBlockSectionCore,
)

BaseSectionCoreUnion = Union[
    CallableSectionCore,
    DictSectionCore,
    ListRootSectionCore,
    DictRootSectionCore,
    GroupSectionCore,
    ImageSectionCore,
    ChartSectionCore,
    DrawSectionCore,
    TextBlockSectionCore,
    SocialSectionCore,
    GlobalVariablesSectionCore,
    CodeSectionCore,
    GenPythonCodeSectionCore,
    TerminalSectionCore,
    IFrameSectionCore,
    ChatSectionCore,
    BrowserSectionCore,
]

BaseSectionCoreUnionWithDiscriminator = Annotated[
    BaseSectionCoreUnion, Field(discriminator="type")
]

BaseSectionCoreTypeAdapter = TypeAdapter(BaseSectionCoreUnionWithDiscriminator)

BaseSectionCoreTypeSet = set(
    [
        "Callable",
        "Dict",
        "ListRoot",
        "DictRoot",
        "Group",
        "Image",
        "Chart",
        "Draw",
        "TextBlock",
        "Social",
        "GlobalVariables",
        "Code",
        "GenPythonCode",
        "Terminal",
        "IFrame",
        "Chat",
        "Browser",
    ]
)

BaseSectionWithParamsCoreUnion = Union[
    CallableSectionCore, DictSectionCore, GlobalVariablesSectionCore
]

BaseSectionWithParamsCoreUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsCoreUnion, Field(discriminator="type")
]

BaseSectionWithParamsCoreTypeAdapter = TypeAdapter(
    BaseSectionWithParamsCoreUnionWithDiscriminator
)

BaseSectionWithParamsCoreTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionCoreUnion = Union[
    ImageSectionCore, ChartSectionCore, DrawSectionCore
]

BaseArtifactSectionCoreUnionWithDiscriminator = Annotated[
    BaseArtifactSectionCoreUnion, Field(discriminator="type")
]

BaseArtifactSectionCoreTypeAdapter = TypeAdapter(
    BaseArtifactSectionCoreUnionWithDiscriminator
)

BaseArtifactSectionCoreTypeSet = set(["Image", "Chart", "Draw"])

BaseCanvasSectionCoreUnion = Union[ChartSectionCore, DrawSectionCore]

BaseCanvasSectionCoreUnionWithDiscriminator = Annotated[
    BaseCanvasSectionCoreUnion, Field(discriminator="type")
]

BaseCanvasSectionCoreTypeAdapter = TypeAdapter(
    BaseCanvasSectionCoreUnionWithDiscriminator
)

BaseCanvasSectionCoreTypeSet = set(["Chart", "Draw"])

BaseCodeSectionCoreUnion = Union[CodeSectionCore, GenPythonCodeSectionCore]

BaseCodeSectionCoreUnionWithDiscriminator = Annotated[
    BaseCodeSectionCoreUnion, Field(discriminator="type")
]

BaseCodeSectionCoreTypeAdapter = TypeAdapter(BaseCodeSectionCoreUnionWithDiscriminator)

BaseCodeSectionCoreTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionCoreUnion = Union[
    ListRootSectionCore, DictRootSectionCore, GroupSectionCore
]

BaseParentSectionCoreUnionWithDiscriminator = Annotated[
    BaseParentSectionCoreUnion, Field(discriminator="type")
]

BaseParentSectionCoreTypeAdapter = TypeAdapter(
    BaseParentSectionCoreUnionWithDiscriminator
)

BaseParentSectionCoreTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionCoreUnion = Union[DictSectionCore, GlobalVariablesSectionCore]

BaseDictSectionCoreUnionWithDiscriminator = Annotated[
    BaseDictSectionCoreUnion, Field(discriminator="type")
]

BaseDictSectionCoreTypeAdapter = TypeAdapter(BaseDictSectionCoreUnionWithDiscriminator)

BaseDictSectionCoreTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.cores import (
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
)

BaseCodeObjCoreUnion = Union[
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    TextParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
    NestedParamCodeObjCore,
]

BaseCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseCodeObjCoreUnion, Field(discriminator="type")
]

BaseCodeObjCoreTypeAdapter = TypeAdapter(BaseCodeObjCoreUnionWithDiscriminator)

BaseCodeObjCoreTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseParamCodeObjCoreUnion = Union[
    CodeParamCodeObjCore,
    TextParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
    NestedParamCodeObjCore,
]

BaseParamCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseParamCodeObjCoreUnion, Field(discriminator="type")
]

BaseParamCodeObjCoreTypeAdapter = TypeAdapter(
    BaseParamCodeObjCoreUnionWithDiscriminator
)

BaseParamCodeObjCoreTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseChildlessCodeObjCoreUnion = Union[
    CodeParamCodeObjCore,
    TextParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
]

BaseChildlessCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjCoreUnion, Field(discriminator="type")
]

BaseChildlessCodeObjCoreTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjCoreUnionWithDiscriminator
)

BaseChildlessCodeObjCoreTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
    ]
)

BaseParentCodeObjCoreUnion = Union[CodeCallableCodeObjCore, NestedParamCodeObjCore]

BaseParentCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseParentCodeObjCoreUnion, Field(discriminator="type")
]

BaseParentCodeObjCoreTypeAdapter = TypeAdapter(
    BaseParentCodeObjCoreUnionWithDiscriminator
)

BaseParentCodeObjCoreTypeSet = set(["CodeCallable", "NestedParam"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.modifiers import (
    BrowserSectionModifier,
    CallableSectionModifier,
    ChartSectionModifier,
    ChatSectionModifier,
    CodeSectionModifier,
    DictRootSectionModifier,
    DictSectionModifier,
    DrawSectionModifier,
    GenPythonCodeSectionModifier,
    GlobalVariablesSectionModifier,
    GroupSectionModifier,
    IFrameSectionModifier,
    ImageSectionModifier,
    ListRootSectionModifier,
    SocialSectionModifier,
    TerminalSectionModifier,
    TextBlockSectionModifier,
)

BaseSectionModifierUnion = Union[
    CallableSectionModifier,
    DictSectionModifier,
    ListRootSectionModifier,
    DictRootSectionModifier,
    GroupSectionModifier,
    ImageSectionModifier,
    ChartSectionModifier,
    DrawSectionModifier,
    TextBlockSectionModifier,
    SocialSectionModifier,
    GlobalVariablesSectionModifier,
    CodeSectionModifier,
    GenPythonCodeSectionModifier,
    TerminalSectionModifier,
    IFrameSectionModifier,
    ChatSectionModifier,
    BrowserSectionModifier,
]

BaseSectionModifierUnionWithDiscriminator = Annotated[
    BaseSectionModifierUnion, Field(discriminator="type")
]

BaseSectionModifierTypeAdapter = TypeAdapter(BaseSectionModifierUnionWithDiscriminator)

BaseSectionModifierTypeSet = set(
    [
        "Callable",
        "Dict",
        "ListRoot",
        "DictRoot",
        "Group",
        "Image",
        "Chart",
        "Draw",
        "TextBlock",
        "Social",
        "GlobalVariables",
        "Code",
        "GenPythonCode",
        "Terminal",
        "IFrame",
        "Chat",
        "Browser",
    ]
)

BaseSectionWithParamsModifierUnion = Union[
    CallableSectionModifier, DictSectionModifier, GlobalVariablesSectionModifier
]

BaseSectionWithParamsModifierUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsModifierUnion, Field(discriminator="type")
]

BaseSectionWithParamsModifierTypeAdapter = TypeAdapter(
    BaseSectionWithParamsModifierUnionWithDiscriminator
)

BaseSectionWithParamsModifierTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionModifierUnion = Union[
    ImageSectionModifier, ChartSectionModifier, DrawSectionModifier
]

BaseArtifactSectionModifierUnionWithDiscriminator = Annotated[
    BaseArtifactSectionModifierUnion, Field(discriminator="type")
]

BaseArtifactSectionModifierTypeAdapter = TypeAdapter(
    BaseArtifactSectionModifierUnionWithDiscriminator
)

BaseArtifactSectionModifierTypeSet = set(["Image", "Chart", "Draw"])

BaseCanvasSectionModifierUnion = Union[ChartSectionModifier, DrawSectionModifier]

BaseCanvasSectionModifierUnionWithDiscriminator = Annotated[
    BaseCanvasSectionModifierUnion, Field(discriminator="type")
]

BaseCanvasSectionModifierTypeAdapter = TypeAdapter(
    BaseCanvasSectionModifierUnionWithDiscriminator
)

BaseCanvasSectionModifierTypeSet = set(["Chart", "Draw"])

BaseCodeSectionModifierUnion = Union[CodeSectionModifier, GenPythonCodeSectionModifier]

BaseCodeSectionModifierUnionWithDiscriminator = Annotated[
    BaseCodeSectionModifierUnion, Field(discriminator="type")
]

BaseCodeSectionModifierTypeAdapter = TypeAdapter(
    BaseCodeSectionModifierUnionWithDiscriminator
)

BaseCodeSectionModifierTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionModifierUnion = Union[
    ListRootSectionModifier, DictRootSectionModifier, GroupSectionModifier
]

BaseParentSectionModifierUnionWithDiscriminator = Annotated[
    BaseParentSectionModifierUnion, Field(discriminator="type")
]

BaseParentSectionModifierTypeAdapter = TypeAdapter(
    BaseParentSectionModifierUnionWithDiscriminator
)

BaseParentSectionModifierTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionModifierUnion = Union[
    DictSectionModifier, GlobalVariablesSectionModifier
]

BaseDictSectionModifierUnionWithDiscriminator = Annotated[
    BaseDictSectionModifierUnion, Field(discriminator="type")
]

BaseDictSectionModifierTypeAdapter = TypeAdapter(
    BaseDictSectionModifierUnionWithDiscriminator
)

BaseDictSectionModifierTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.modifiers import (
    CodeCallableCodeObjModifier,
    CodeParamCodeObjModifier,
    ColorPickerParamCodeObjModifier,
    DropdownParamCodeObjModifier,
    NestedParamCodeObjModifier,
    PasswordParamCodeObjModifier,
    SliderParamCodeObjModifier,
    SwitchParamCodeObjModifier,
    TextParamCodeObjModifier,
)

BaseCodeObjModifierUnion = Union[
    CodeCallableCodeObjModifier,
    CodeParamCodeObjModifier,
    TextParamCodeObjModifier,
    SliderParamCodeObjModifier,
    SwitchParamCodeObjModifier,
    ColorPickerParamCodeObjModifier,
    DropdownParamCodeObjModifier,
    PasswordParamCodeObjModifier,
    NestedParamCodeObjModifier,
]

BaseCodeObjModifierUnionWithDiscriminator = Annotated[
    BaseCodeObjModifierUnion, Field(discriminator="type")
]

BaseCodeObjModifierTypeAdapter = TypeAdapter(BaseCodeObjModifierUnionWithDiscriminator)

BaseCodeObjModifierTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseParamCodeObjModifierUnion = Union[
    CodeParamCodeObjModifier,
    TextParamCodeObjModifier,
    SliderParamCodeObjModifier,
    SwitchParamCodeObjModifier,
    ColorPickerParamCodeObjModifier,
    DropdownParamCodeObjModifier,
    PasswordParamCodeObjModifier,
    NestedParamCodeObjModifier,
]

BaseParamCodeObjModifierUnionWithDiscriminator = Annotated[
    BaseParamCodeObjModifierUnion, Field(discriminator="type")
]

BaseParamCodeObjModifierTypeAdapter = TypeAdapter(
    BaseParamCodeObjModifierUnionWithDiscriminator
)

BaseParamCodeObjModifierTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseChildlessCodeObjModifierUnion = Union[
    CodeParamCodeObjModifier,
    TextParamCodeObjModifier,
    SliderParamCodeObjModifier,
    SwitchParamCodeObjModifier,
    ColorPickerParamCodeObjModifier,
    DropdownParamCodeObjModifier,
    PasswordParamCodeObjModifier,
]

BaseChildlessCodeObjModifierUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjModifierUnion, Field(discriminator="type")
]

BaseChildlessCodeObjModifierTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjModifierUnionWithDiscriminator
)

BaseChildlessCodeObjModifierTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
    ]
)

BaseParentCodeObjModifierUnion = Union[
    CodeCallableCodeObjModifier, NestedParamCodeObjModifier
]

BaseParentCodeObjModifierUnionWithDiscriminator = Annotated[
    BaseParentCodeObjModifierUnion, Field(discriminator="type")
]

BaseParentCodeObjModifierTypeAdapter = TypeAdapter(
    BaseParentCodeObjModifierUnionWithDiscriminator
)

BaseParentCodeObjModifierTypeSet = set(["CodeCallable", "NestedParam"])
