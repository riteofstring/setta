from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.section_impls import (
    BaseArtifactSectionImpl,
    BaseCanvasSectionImpl,
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
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
    BaseSectionWithParamsImpl,
    BaseArtifactSectionImpl,
    BaseCanvasSectionImpl,
    BaseCodeSectionImpl,
    BaseParentSectionImpl,
    BaseDictSectionImpl,
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
    BaseDictSectionImpl,
    CallableSectionImpl,
    DictSectionImpl,
    GlobalVariablesSectionImpl,
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
    BaseChildlessCodeObjImpl,
    BaseParamCodeObjImpl,
    BaseParentCodeObjImpl,
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
    BaseParamCodeObjImpl,
    BaseChildlessCodeObjImpl,
    BaseParentCodeObjImpl,
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
    BaseChildlessCodeObjImpl,
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
    BaseArtifactSectionCore,
    BaseCanvasSectionCore,
    BaseCodeSectionCore,
    BaseDictSectionCore,
    BaseParentSectionCore,
    BaseSectionWithParamsCore,
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
    BaseSectionWithParamsCore,
    BaseArtifactSectionCore,
    BaseCanvasSectionCore,
    BaseCodeSectionCore,
    BaseParentSectionCore,
    BaseDictSectionCore,
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
    BaseDictSectionCore,
    CallableSectionCore,
    DictSectionCore,
    GlobalVariablesSectionCore,
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
    BaseChildlessCodeObjCore,
    BaseParamCodeObjCore,
    BaseParentCodeObjCore,
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
    BaseParamCodeObjCore,
    BaseChildlessCodeObjCore,
    BaseParentCodeObjCore,
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
    BaseChildlessCodeObjCore,
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
from setta.types.generated.layerings import (
    BaseArtifactSectionLayering,
    BaseCanvasSectionLayering,
    BaseCodeSectionLayering,
    BaseDictSectionLayering,
    BaseParentSectionLayering,
    BaseSectionWithParamsLayering,
    BrowserSectionLayering,
    CallableSectionLayering,
    ChartSectionLayering,
    ChatSectionLayering,
    CodeSectionLayering,
    DictRootSectionLayering,
    DictSectionLayering,
    DrawSectionLayering,
    GenPythonCodeSectionLayering,
    GlobalVariablesSectionLayering,
    GroupSectionLayering,
    IFrameSectionLayering,
    ImageSectionLayering,
    ListRootSectionLayering,
    SocialSectionLayering,
    TerminalSectionLayering,
    TextBlockSectionLayering,
)

BaseSectionLayeringUnion = Union[
    BaseSectionWithParamsLayering,
    BaseArtifactSectionLayering,
    BaseCanvasSectionLayering,
    BaseCodeSectionLayering,
    BaseParentSectionLayering,
    BaseDictSectionLayering,
    CallableSectionLayering,
    DictSectionLayering,
    ListRootSectionLayering,
    DictRootSectionLayering,
    GroupSectionLayering,
    ImageSectionLayering,
    ChartSectionLayering,
    DrawSectionLayering,
    TextBlockSectionLayering,
    SocialSectionLayering,
    GlobalVariablesSectionLayering,
    CodeSectionLayering,
    GenPythonCodeSectionLayering,
    TerminalSectionLayering,
    IFrameSectionLayering,
    ChatSectionLayering,
    BrowserSectionLayering,
]

BaseSectionLayeringUnionWithDiscriminator = Annotated[
    BaseSectionLayeringUnion, Field(discriminator="type")
]

BaseSectionLayeringTypeAdapter = TypeAdapter(BaseSectionLayeringUnionWithDiscriminator)

BaseSectionLayeringTypeSet = set(
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

BaseSectionWithParamsLayeringUnion = Union[
    BaseDictSectionLayering,
    CallableSectionLayering,
    DictSectionLayering,
    GlobalVariablesSectionLayering,
]

BaseSectionWithParamsLayeringUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsLayeringUnion, Field(discriminator="type")
]

BaseSectionWithParamsLayeringTypeAdapter = TypeAdapter(
    BaseSectionWithParamsLayeringUnionWithDiscriminator
)

BaseSectionWithParamsLayeringTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionLayeringUnion = Union[
    ImageSectionLayering, ChartSectionLayering, DrawSectionLayering
]

BaseArtifactSectionLayeringUnionWithDiscriminator = Annotated[
    BaseArtifactSectionLayeringUnion, Field(discriminator="type")
]

BaseArtifactSectionLayeringTypeAdapter = TypeAdapter(
    BaseArtifactSectionLayeringUnionWithDiscriminator
)

BaseArtifactSectionLayeringTypeSet = set(["Image", "Chart", "Draw"])

BaseCanvasSectionLayeringUnion = Union[ChartSectionLayering, DrawSectionLayering]

BaseCanvasSectionLayeringUnionWithDiscriminator = Annotated[
    BaseCanvasSectionLayeringUnion, Field(discriminator="type")
]

BaseCanvasSectionLayeringTypeAdapter = TypeAdapter(
    BaseCanvasSectionLayeringUnionWithDiscriminator
)

BaseCanvasSectionLayeringTypeSet = set(["Chart", "Draw"])

BaseCodeSectionLayeringUnion = Union[CodeSectionLayering, GenPythonCodeSectionLayering]

BaseCodeSectionLayeringUnionWithDiscriminator = Annotated[
    BaseCodeSectionLayeringUnion, Field(discriminator="type")
]

BaseCodeSectionLayeringTypeAdapter = TypeAdapter(
    BaseCodeSectionLayeringUnionWithDiscriminator
)

BaseCodeSectionLayeringTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionLayeringUnion = Union[
    ListRootSectionLayering, DictRootSectionLayering, GroupSectionLayering
]

BaseParentSectionLayeringUnionWithDiscriminator = Annotated[
    BaseParentSectionLayeringUnion, Field(discriminator="type")
]

BaseParentSectionLayeringTypeAdapter = TypeAdapter(
    BaseParentSectionLayeringUnionWithDiscriminator
)

BaseParentSectionLayeringTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionLayeringUnion = Union[
    DictSectionLayering, GlobalVariablesSectionLayering
]

BaseDictSectionLayeringUnionWithDiscriminator = Annotated[
    BaseDictSectionLayeringUnion, Field(discriminator="type")
]

BaseDictSectionLayeringTypeAdapter = TypeAdapter(
    BaseDictSectionLayeringUnionWithDiscriminator
)

BaseDictSectionLayeringTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.generated.layerings import (
    BaseChildlessCodeObjLayering,
    BaseParamCodeObjLayering,
    BaseParentCodeObjLayering,
    CodeCallableCodeObjLayering,
    CodeParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    NestedParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    TextParamCodeObjLayering,
)

BaseCodeObjLayeringUnion = Union[
    BaseParamCodeObjLayering,
    BaseChildlessCodeObjLayering,
    BaseParentCodeObjLayering,
    CodeCallableCodeObjLayering,
    CodeParamCodeObjLayering,
    TextParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    NestedParamCodeObjLayering,
]

BaseCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseCodeObjLayeringUnion, Field(discriminator="type")
]

BaseCodeObjLayeringTypeAdapter = TypeAdapter(BaseCodeObjLayeringUnionWithDiscriminator)

BaseCodeObjLayeringTypeSet = set(
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

BaseParamCodeObjLayeringUnion = Union[
    BaseChildlessCodeObjLayering,
    CodeParamCodeObjLayering,
    TextParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    NestedParamCodeObjLayering,
]

BaseParamCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseParamCodeObjLayeringUnion, Field(discriminator="type")
]

BaseParamCodeObjLayeringTypeAdapter = TypeAdapter(
    BaseParamCodeObjLayeringUnionWithDiscriminator
)

BaseParamCodeObjLayeringTypeSet = set(
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

BaseChildlessCodeObjLayeringUnion = Union[
    CodeParamCodeObjLayering,
    TextParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    PasswordParamCodeObjLayering,
]

BaseChildlessCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjLayeringUnion, Field(discriminator="type")
]

BaseChildlessCodeObjLayeringTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjLayeringUnionWithDiscriminator
)

BaseChildlessCodeObjLayeringTypeSet = set(
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

BaseParentCodeObjLayeringUnion = Union[
    CodeCallableCodeObjLayering, NestedParamCodeObjLayering
]

BaseParentCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseParentCodeObjLayeringUnion, Field(discriminator="type")
]

BaseParentCodeObjLayeringTypeAdapter = TypeAdapter(
    BaseParentCodeObjLayeringUnionWithDiscriminator
)

BaseParentCodeObjLayeringTypeSet = set(["CodeCallable", "NestedParam"])
