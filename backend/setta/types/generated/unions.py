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

from setta.types.generated.impl_args_as_typed_dicts import (
    BrowserSectionImplArgs,
    CallableSectionImplArgs,
    ChartSectionImplArgs,
    ChatSectionImplArgs,
    CodeSectionImplArgs,
    DictRootSectionImplArgs,
    DictSectionImplArgs,
    DrawSectionImplArgs,
    GenPythonCodeSectionImplArgs,
    GlobalVariablesSectionImplArgs,
    GroupSectionImplArgs,
    IFrameSectionImplArgs,
    ImageSectionImplArgs,
    ListRootSectionImplArgs,
    SocialSectionImplArgs,
    TerminalSectionImplArgs,
    TextBlockSectionImplArgs,
)

BaseSectionImplArgsUnion = Union[
    CallableSectionImplArgs,
    DictSectionImplArgs,
    ListRootSectionImplArgs,
    DictRootSectionImplArgs,
    GroupSectionImplArgs,
    ImageSectionImplArgs,
    ChartSectionImplArgs,
    DrawSectionImplArgs,
    TextBlockSectionImplArgs,
    SocialSectionImplArgs,
    GlobalVariablesSectionImplArgs,
    CodeSectionImplArgs,
    GenPythonCodeSectionImplArgs,
    TerminalSectionImplArgs,
    IFrameSectionImplArgs,
    ChatSectionImplArgs,
    BrowserSectionImplArgs,
]

BaseSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseSectionImplArgsUnion, Field(discriminator="type")
]

BaseSectionImplArgsTypeAdapter = TypeAdapter(BaseSectionImplArgsUnionWithDiscriminator)

BaseSectionImplArgsTypeSet = set(
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

BaseSectionWithParamsImplArgsUnion = Union[
    CallableSectionImplArgs, DictSectionImplArgs, GlobalVariablesSectionImplArgs
]

BaseSectionWithParamsImplArgsUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplArgsUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplArgsTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplArgsUnionWithDiscriminator
)

BaseSectionWithParamsImplArgsTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseCanvasSectionImplArgsUnion = Union[ChartSectionImplArgs, DrawSectionImplArgs]

BaseCanvasSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplArgsUnion, Field(discriminator="type")
]

BaseCanvasSectionImplArgsTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplArgsUnionWithDiscriminator
)

BaseCanvasSectionImplArgsTypeSet = set(["Chart", "Draw"])

BaseCodeSectionImplArgsUnion = Union[CodeSectionImplArgs, GenPythonCodeSectionImplArgs]

BaseCodeSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplArgsUnion, Field(discriminator="type")
]

BaseCodeSectionImplArgsTypeAdapter = TypeAdapter(
    BaseCodeSectionImplArgsUnionWithDiscriminator
)

BaseCodeSectionImplArgsTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionImplArgsUnion = Union[
    ListRootSectionImplArgs, DictRootSectionImplArgs, GroupSectionImplArgs
]

BaseParentSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseParentSectionImplArgsUnion, Field(discriminator="type")
]

BaseParentSectionImplArgsTypeAdapter = TypeAdapter(
    BaseParentSectionImplArgsUnionWithDiscriminator
)

BaseParentSectionImplArgsTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionImplArgsUnion = Union[
    DictSectionImplArgs, GlobalVariablesSectionImplArgs
]

BaseDictSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseDictSectionImplArgsUnion, Field(discriminator="type")
]

BaseDictSectionImplArgsTypeAdapter = TypeAdapter(
    BaseDictSectionImplArgsUnionWithDiscriminator
)

BaseDictSectionImplArgsTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.impl_args_as_typed_dicts import (
    CodeCallableCodeObjImplArgs,
    CodeParamCodeObjImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DropdownParamCodeObjImplArgs,
    NestedParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SwitchParamCodeObjImplArgs,
    TextParamCodeObjImplArgs,
)

BaseCodeObjImplArgsUnion = Union[
    CodeCallableCodeObjImplArgs,
    CodeParamCodeObjImplArgs,
    TextParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SwitchParamCodeObjImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DropdownParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
    NestedParamCodeObjImplArgs,
]

BaseCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseCodeObjImplArgsTypeAdapter = TypeAdapter(BaseCodeObjImplArgsUnionWithDiscriminator)

BaseCodeObjImplArgsTypeSet = set(
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

BaseParamCodeObjImplArgsUnion = Union[
    CodeParamCodeObjImplArgs,
    TextParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SwitchParamCodeObjImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DropdownParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
    NestedParamCodeObjImplArgs,
]

BaseParamCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseParamCodeObjImplArgsTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplArgsUnionWithDiscriminator
)

BaseParamCodeObjImplArgsTypeSet = set(
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

BaseChildlessCodeObjImplArgsUnion = Union[
    CodeParamCodeObjImplArgs,
    TextParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SwitchParamCodeObjImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DropdownParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
]

BaseChildlessCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplArgsTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplArgsUnionWithDiscriminator
)

BaseChildlessCodeObjImplArgsTypeSet = set(
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

BaseParentCodeObjImplArgsUnion = Union[
    CodeCallableCodeObjImplArgs, NestedParamCodeObjImplArgs
]

BaseParentCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseParentCodeObjImplArgsTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplArgsUnionWithDiscriminator
)

BaseParentCodeObjImplArgsTypeSet = set(["CodeCallable", "NestedParam"])
