from typing import Awaitable, Callable, NotRequired, TypedDict

from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.project_state.project_manager_types import (
    CodeFileBindingUpdate,
    CreateTopLevelSectionResponse,
    ProjectStateSingleConfigWithCompletedOpIds,
    SetCallableResponse,
)
from setta.types.artifact import (
    ChartType,
    DrawAreaLayerItem,
    LineChartSettings,
    ScatterChartSettings,
)
from setta.types.clipboard import (
    ProjectStateCoreWithSectionVariantMap,
    SectionsClipboardData,
)
from setta.types.code_obj_impls import CodeObjType
from setta.types.edges import Edge, EdgePort
from setta.types.generated.impl_args_as_typed_dicts import (
    BrowserSectionImplArgs,
    CallableSectionImplArgs,
    ChartSectionImplArgs,
    ChatSectionImplArgs,
    CodeSectionImplArgs,
    DictSectionImplArgs,
    DrawSectionImplArgs,
    GenPythonCodeSectionImplArgs,
    GlobalVariablesSectionImplArgs,
    GroupSectionImplArgs,
    IFrameSectionImplArgs,
    ImageSectionImplArgs,
    ListRootSectionImplArgs,
    MetaControlSectionImplArgs,
    SocialSectionImplArgs,
    TerminalSectionImplArgs,
    TextBlockSectionImplArgs,
)
from setta.types.id import ID
from setta.types.listener import ListenerCoverageSnapshot
from setta.types.project_config import (
    Position,
    TopLevelSectionLayout,
    Viewport,
    ViewportBounds,
)
from setta.types.section_impls import (
    BrowserAreaViewMode,
    SectionSize,
    SectionType,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
)
from setta.types.settings_state import RunSnapshotMode


class ListenerAcceptRenameRefactorRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerAddKwargRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID


class ListenerAppendDrawAreaLayerItemRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    layerIdx: int
    element: DrawAreaLayerItem


class ListenerAutoLayoutTopLevelSectionsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    margin: NotRequired[int]


class ListenerChangeParamImplRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID
    selectedId: ID


class ListenerClearTextFieldCompletionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID | None


class ListenerCodeAreaCompletionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    fullText: str
    position: int


class ListenerCreateChildSectionsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    parentId: ID
    implType: SectionType
    numChildren: int
    startIdx: int | None


class ListenerCreateChildSectionsViaIncrementerRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    calledBy: ID
    numChildren: int
    implType: SectionType


class ListenerCreateEdgeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sourceSectionId: ID
    sourceVariantId: ID
    sourcePortId: ID
    targetSectionId: ID
    targetVariantId: ID
    targetPortId: ID
    type: NotRequired[str]
    label: NotRequired[str | None]
    style: NotRequired[dict[str, str | int | float] | None]
    animated: NotRequired[bool]
    hidden: NotRequired[bool]
    zIndex: NotRequired[int]
    data: NotRequired[dict[str, object] | None]


class ListenerCreateNewSectionVariantRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID


class ListenerCreateTopLevelSectionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    implType: SectionType
    controlCodeObjType: NotRequired[CodeObjType | None]
    implOverrides: NotRequired[
        CallableSectionImplArgs
        | DictSectionImplArgs
        | ListRootSectionImplArgs
        | GroupSectionImplArgs
        | ImageSectionImplArgs
        | ChartSectionImplArgs
        | DrawSectionImplArgs
        | TextBlockSectionImplArgs
        | MetaControlSectionImplArgs
        | SocialSectionImplArgs
        | GlobalVariablesSectionImplArgs
        | CodeSectionImplArgs
        | GenPythonCodeSectionImplArgs
        | TerminalSectionImplArgs
        | IFrameSectionImplArgs
        | ChatSectionImplArgs
        | BrowserSectionImplArgs
        | None
    ]
    position: NotRequired[Position | None]
    topLevelSections: NotRequired[dict[ID, TopLevelSectionLayout] | None]
    viewportBounds: NotRequired[ViewportBounds | None]


class ListenerCreateViewModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerDeclineRenameRefactorRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerDeleteChildSectionsViaDecrementerRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    calledBy: ID
    numChildren: int


class ListenerDeleteEdgesRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    edgeIds: list[ID]


class ListenerDeleteJSONSourceFileAndVariantRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    variantId: ID
    filepath: str


class ListenerDeleteKwargRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID


class ListenerDeleteSectionVariantOrAskRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    variantId: ID


class ListenerDeleteSectionsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionIds: list[ID]


class ListenerDeleteViewModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    viewModeId: ID


class ListenerForceRefreshProjectRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerGenCodePrefixCompletionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    fullText: str
    position: int


class ListenerGenCodeSuffixCompletionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    fullText: str
    position: int


class ListenerGetLatestProjectStateRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerGroupSectionsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionIds: list[ID]


class ListenerKillSubprocessesRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]


class ListenerListenerCoverageRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]


class ListenerMoveSectionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    newParentId: ID | None
    newIndex: int | None
    position: Position | None


class ListenerOutputAccessorCompletionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    fullText: str
    position: int


class ListenerPasteSectionsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    data: ProjectStateCoreWithSectionVariantMap
    position: Position
    asRef: bool


class ListenerPrepareSectionsForCopyRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionIds: list[ID]


class ListenerReconnectEdgeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    edgeId: ID
    sourceSectionId: ID
    sourceVariantId: ID
    sourcePortId: ID
    targetSectionId: ID
    targetVariantId: ID
    targetPortId: ID


class ListenerRedoRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    steps: int


class ListenerRunCodeRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]
    sectionId: ID | None
    cliId: NotRequired[str | None]
    runSnapshotMode: NotRequired[RunSnapshotMode | None]


class ListenerSetActiveIdsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    activeIds: list[ID]


class ListenerSetActiveViewModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    activeViewModeId: ID


class ListenerSetBrowserAreaViewModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    viewMode: BrowserAreaViewMode


class ListenerSetBrowserColumnWidthsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    columnWidth: float | None
    typesColumnWidth: float | None


class ListenerSetBrowserHideColumnRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    hideColumn: bool


class ListenerSetCallableHideParamsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    hideParams: bool


class ListenerSetCallableRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    callableName: str
    refetchParams: bool


class ListenerSetChartAreaDataPathRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    dataPath: str


class ListenerSetChartSettingsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    chartSettings: LineChartSettings | ScatterChartSettings
    changedSettings: list[str]


class ListenerSetChartTypeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    chartType: ChartType


class ListenerSetCodeFileBindingRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    binding: CodeFileBindingUpdate


class ListenerSetCodeObjDisplayNameRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    codeObjId: ID
    displayName: str


class ListenerSetCodeObjNameRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    codeObjId: ID
    name: str


class ListenerSetCodeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    code: str


class ListenerSetDefaultSectionVariantRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    variantId: ID


class ListenerSetEdgesRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    edges: list[Edge]


class ListenerSetGenCodePrefixRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    genCodePrefix: str


class ListenerSetGenCodeSuffixRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    genCodeSuffix: str


class ListenerSetGroupOverflowModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    overflowMode: bool


class ListenerSetImageAreaImagePathRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    imagePath: str


class ListenerSetMetaControlShowSectionTitleRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    showSectionTitle: bool


class ListenerSetParamEnteredValueRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID
    value: str


class ListenerSetSectionColumnWidthRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    columnWidth: float | None


class ListenerSetSectionEdgeInputsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    edgeInputParams: list[ID]


class ListenerSetSectionEdgeOutputsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    edgeOutputPorts: list[EdgePort]


class ListenerSetSectionHideUnpinnedParamsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    hideUnpinnedParams: bool


class ListenerSetSectionNameRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    name: str


class ListenerSetSectionParamFilterRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    value: str


class ListenerSetSectionPinnedParamsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    pinnedParams: list[ID]


class ListenerSetSectionSizesRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionSizes: dict[ID, SectionSize]


class ListenerSetSectionVariantNameRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    variantId: ID
    name: str


class ListenerSetSectionVariantRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    variantId: ID


class ListenerSetSectionWithParamsDisplayModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    displayMode: SectionWithParamsDisplayMode


class ListenerSetShowParamDisplayNamesRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    showParamDisplayNames: bool


class ListenerSetSocialUrlRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    url: str


class ListenerSetTextBlockDisplayModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    textDisplayMode: TextBlockDisplayMode


class ListenerSetTextBlockFormatRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    format: TextBlockFormat


class ListenerSetTextBlockHeadingAsSectionNameRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    headingAsSectionName: bool


class ListenerSetTextBlockMetaControlStyleRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    metaControlStyle: bool


class ListenerSetTextBlockTextRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    text: str


class ListenerSetTopLevelSectionLayoutRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    topLevelSections: dict[ID, TopLevelSectionLayout]


class ListenerSetTypeErrorIgnoreRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID | None
    ignoreTypeErrors: bool


class ListenerSetViewModeNameRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    viewModeId: ID
    name: str


class ListenerSetViewportRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    viewport: Viewport | None


class ListenerTextFieldCompletionRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID | None
    fullText: str
    position: int


class ListenerToggleGroupOrientationRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID


class ListenerToggleIsEditingViewModeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerToggleMinimizedRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID


class ListenerToggleParamSelectedRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID


class ListenerTogglePositionLocksRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionIds: list[ID]


class ListenerToggleSectionVisibilityRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionIds: list[ID]


class ListenerToggleVariantFrozenRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    variantId: ID


class ListenerToggleVariantJSONSourceRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    variantId: ID


class ListenerToggleViewModeUserFacingRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    viewModeId: ID


class ListenerTypeCheckRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]


class ListenerUndoRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    steps: int


class ListenerUngroupGroupsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    groupIds: list[ID]


class ListenerUnselectAllParamsRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]


class ListenerUpdateEdgeRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    edge: Edge


class ListenerUpdateParamImplConfigRequestPayload(TypedDict):
    frontendOpId: NotRequired[str | None]
    projectConfigId: NotRequired[ID]
    sectionId: ID
    paramInfoId: ID
    newConfig: dict


class RouterEndpointAPI:
    def __init__(self, caller: Callable[[str, object], Awaitable[object]]) -> None:
        self._caller = caller

    async def accept_rename_refactor(
        self, payload: ListenerAcceptRenameRefactorRequestPayload
    ) -> None:
        return await self._caller("route_accept_rename_refactor", payload)

    async def add_kwarg(self, payload: ListenerAddKwargRequestPayload) -> None:
        return await self._caller("route_add_kwarg", payload)

    async def append_draw_area_layer_item(
        self, payload: ListenerAppendDrawAreaLayerItemRequestPayload
    ) -> None:
        return await self._caller("route_append_draw_area_layer_item", payload)

    async def auto_layout_top_level_sections(
        self, payload: ListenerAutoLayoutTopLevelSectionsRequestPayload
    ) -> None:
        return await self._caller("route_auto_layout_top_level_sections", payload)

    async def change_param_impl(
        self, payload: ListenerChangeParamImplRequestPayload
    ) -> None:
        return await self._caller("route_change_param_impl", payload)

    async def clear_text_field_completion(
        self, payload: ListenerClearTextFieldCompletionRequestPayload
    ) -> None:
        return await self._caller("route_clear_text_field_completion", payload)

    async def code_area_completion(
        self, payload: ListenerCodeAreaCompletionRequestPayload
    ) -> list[CodeMirrorCompletion]:
        return await self._caller("route_code_area_completion", payload)

    async def create_child_sections(
        self, payload: ListenerCreateChildSectionsRequestPayload
    ) -> None:
        return await self._caller("route_create_child_sections", payload)

    async def create_child_sections_via_incrementer(
        self, payload: ListenerCreateChildSectionsViaIncrementerRequestPayload
    ) -> None:
        return await self._caller(
            "route_create_child_sections_via_incrementer", payload
        )

    async def create_edge(self, payload: ListenerCreateEdgeRequestPayload) -> None:
        return await self._caller("route_create_edge", payload)

    async def create_new_section_variant(
        self, payload: ListenerCreateNewSectionVariantRequestPayload
    ) -> None:
        return await self._caller("route_create_new_section_variant", payload)

    async def create_top_level_section(
        self, payload: ListenerCreateTopLevelSectionRequestPayload
    ) -> CreateTopLevelSectionResponse:
        return await self._caller("route_create_top_level_section", payload)

    async def create_view_mode(
        self, payload: ListenerCreateViewModeRequestPayload
    ) -> str:
        return await self._caller("route_create_view_mode", payload)

    async def decline_rename_refactor(
        self, payload: ListenerDeclineRenameRefactorRequestPayload
    ) -> None:
        return await self._caller("route_decline_rename_refactor", payload)

    async def delete_child_sections_via_decrementer(
        self, payload: ListenerDeleteChildSectionsViaDecrementerRequestPayload
    ) -> None:
        return await self._caller(
            "route_delete_child_sections_via_decrementer", payload
        )

    async def delete_edges(self, payload: ListenerDeleteEdgesRequestPayload) -> None:
        return await self._caller("route_delete_edges", payload)

    async def delete_json_source_file_and_variant(
        self, payload: ListenerDeleteJSONSourceFileAndVariantRequestPayload
    ) -> None:
        return await self._caller("route_delete_json_source_file_and_variant", payload)

    async def delete_kwarg(self, payload: ListenerDeleteKwargRequestPayload) -> None:
        return await self._caller("route_delete_kwarg", payload)

    async def delete_section_variant_or_ask(
        self, payload: ListenerDeleteSectionVariantOrAskRequestPayload
    ) -> str | None:
        return await self._caller("route_delete_section_variant_or_ask", payload)

    async def delete_sections(
        self, payload: ListenerDeleteSectionsRequestPayload
    ) -> None:
        return await self._caller("route_delete_sections", payload)

    async def delete_view_mode(
        self, payload: ListenerDeleteViewModeRequestPayload
    ) -> None:
        return await self._caller("route_delete_view_mode", payload)

    async def force_refresh_listener(
        self, payload: ListenerForceRefreshProjectRequestPayload
    ) -> None:
        return await self._caller("route_force_refresh_listener", payload)

    async def gen_code_prefix_completion(
        self, payload: ListenerGenCodePrefixCompletionRequestPayload
    ) -> list[CodeMirrorCompletion]:
        return await self._caller("route_gen_code_prefix_completion", payload)

    async def gen_code_suffix_completion(
        self, payload: ListenerGenCodeSuffixCompletionRequestPayload
    ) -> list[CodeMirrorCompletion]:
        return await self._caller("route_gen_code_suffix_completion", payload)

    async def get_latest_project_state(
        self, payload: ListenerGetLatestProjectStateRequestPayload
    ) -> ProjectStateSingleConfigWithCompletedOpIds:
        return await self._caller("route_get_latest_project_state", payload)

    async def get_listener_coverage(
        self, payload: ListenerListenerCoverageRequestPayload
    ) -> ListenerCoverageSnapshot:
        return await self._caller("route_get_listener_coverage", payload)

    async def group_sections(
        self, payload: ListenerGroupSectionsRequestPayload
    ) -> None:
        return await self._caller("route_group_sections", payload)

    async def kill_subprocesses(
        self, payload: ListenerKillSubprocessesRequestPayload
    ) -> None:
        return await self._caller("route_kill_subprocesses", payload)

    async def move_section(self, payload: ListenerMoveSectionRequestPayload) -> None:
        return await self._caller("route_move_section", payload)

    async def output_accessor_completion(
        self, payload: ListenerOutputAccessorCompletionRequestPayload
    ) -> list[CodeMirrorCompletion]:
        return await self._caller("route_output_accessor_completion", payload)

    async def paste_sections(
        self, payload: ListenerPasteSectionsRequestPayload
    ) -> None:
        return await self._caller("route_paste_sections", payload)

    async def prepare_sections_for_copy(
        self, payload: ListenerPrepareSectionsForCopyRequestPayload
    ) -> SectionsClipboardData:
        return await self._caller("route_prepare_sections_for_copy", payload)

    async def reconnect_edge(
        self, payload: ListenerReconnectEdgeRequestPayload
    ) -> None:
        return await self._caller("route_reconnect_edge", payload)

    async def redo(self, payload: ListenerRedoRequestPayload) -> None:
        return await self._caller("route_redo", payload)

    async def run_code(self, payload: ListenerRunCodeRequestPayload) -> None:
        return await self._caller("route_run_code", payload)

    async def set_active_ids(self, payload: ListenerSetActiveIdsRequestPayload) -> None:
        return await self._caller("route_set_active_ids", payload)

    async def set_active_view_mode(
        self, payload: ListenerSetActiveViewModeRequestPayload
    ) -> None:
        return await self._caller("route_set_active_view_mode", payload)

    async def set_browser_area_view_mode(
        self, payload: ListenerSetBrowserAreaViewModeRequestPayload
    ) -> None:
        return await self._caller("route_set_browser_area_view_mode", payload)

    async def set_browser_column_widths(
        self, payload: ListenerSetBrowserColumnWidthsRequestPayload
    ) -> None:
        return await self._caller("route_set_browser_column_widths", payload)

    async def set_browser_hide_column(
        self, payload: ListenerSetBrowserHideColumnRequestPayload
    ) -> None:
        return await self._caller("route_set_browser_hide_column", payload)

    async def set_callable(
        self, payload: ListenerSetCallableRequestPayload
    ) -> SetCallableResponse:
        return await self._caller("route_set_callable", payload)

    async def set_callable_hide_params(
        self, payload: ListenerSetCallableHideParamsRequestPayload
    ) -> None:
        return await self._caller("route_set_callable_hide_params", payload)

    async def set_chart_area_data_path(
        self, payload: ListenerSetChartAreaDataPathRequestPayload
    ) -> None:
        return await self._caller("route_set_chart_area_data_path", payload)

    async def set_chart_settings(
        self, payload: ListenerSetChartSettingsRequestPayload
    ) -> None:
        return await self._caller("route_set_chart_settings", payload)

    async def set_chart_type(self, payload: ListenerSetChartTypeRequestPayload) -> None:
        return await self._caller("route_set_chart_type", payload)

    async def set_code(self, payload: ListenerSetCodeRequestPayload) -> None:
        return await self._caller("route_set_code", payload)

    async def set_code_file_binding(
        self, payload: ListenerSetCodeFileBindingRequestPayload
    ) -> None:
        return await self._caller("route_set_code_file_binding", payload)

    async def set_code_obj_display_name(
        self, payload: ListenerSetCodeObjDisplayNameRequestPayload
    ) -> None:
        return await self._caller("route_set_code_obj_display_name", payload)

    async def set_code_obj_name(
        self, payload: ListenerSetCodeObjNameRequestPayload
    ) -> None:
        return await self._caller("route_set_code_obj_name", payload)

    async def set_default_section_variant(
        self, payload: ListenerSetDefaultSectionVariantRequestPayload
    ) -> None:
        return await self._caller("route_set_default_section_variant", payload)

    async def set_edges(self, payload: ListenerSetEdgesRequestPayload) -> None:
        return await self._caller("route_set_edges", payload)

    async def set_gen_code_prefix(
        self, payload: ListenerSetGenCodePrefixRequestPayload
    ) -> None:
        return await self._caller("route_set_gen_code_prefix", payload)

    async def set_gen_code_suffix(
        self, payload: ListenerSetGenCodeSuffixRequestPayload
    ) -> None:
        return await self._caller("route_set_gen_code_suffix", payload)

    async def set_group_overflow_mode(
        self, payload: ListenerSetGroupOverflowModeRequestPayload
    ) -> None:
        return await self._caller("route_set_group_overflow_mode", payload)

    async def set_image_area_image_path(
        self, payload: ListenerSetImageAreaImagePathRequestPayload
    ) -> None:
        return await self._caller("route_set_image_area_image_path", payload)

    async def set_meta_control_show_section_title(
        self, payload: ListenerSetMetaControlShowSectionTitleRequestPayload
    ) -> None:
        return await self._caller("route_set_meta_control_show_section_title", payload)

    async def set_param_entered_value(
        self, payload: ListenerSetParamEnteredValueRequestPayload
    ) -> None:
        return await self._caller("route_set_param_entered_value", payload)

    async def set_section_column_width(
        self, payload: ListenerSetSectionColumnWidthRequestPayload
    ) -> None:
        return await self._caller("route_set_section_column_width", payload)

    async def set_section_edge_inputs(
        self, payload: ListenerSetSectionEdgeInputsRequestPayload
    ) -> None:
        return await self._caller("route_set_section_edge_inputs", payload)

    async def set_section_edge_outputs(
        self, payload: ListenerSetSectionEdgeOutputsRequestPayload
    ) -> None:
        return await self._caller("route_set_section_edge_outputs", payload)

    async def set_section_hide_unpinned_params(
        self, payload: ListenerSetSectionHideUnpinnedParamsRequestPayload
    ) -> None:
        return await self._caller("route_set_section_hide_unpinned_params", payload)

    async def set_section_name(
        self, payload: ListenerSetSectionNameRequestPayload
    ) -> None:
        return await self._caller("route_set_section_name", payload)

    async def set_section_param_filter(
        self, payload: ListenerSetSectionParamFilterRequestPayload
    ) -> None:
        return await self._caller("route_set_section_param_filter", payload)

    async def set_section_pinned_params(
        self, payload: ListenerSetSectionPinnedParamsRequestPayload
    ) -> None:
        return await self._caller("route_set_section_pinned_params", payload)

    async def set_section_sizes(
        self, payload: ListenerSetSectionSizesRequestPayload
    ) -> None:
        return await self._caller("route_set_section_sizes", payload)

    async def set_section_variant(
        self, payload: ListenerSetSectionVariantRequestPayload
    ) -> None:
        return await self._caller("route_set_section_variant", payload)

    async def set_section_variant_name(
        self, payload: ListenerSetSectionVariantNameRequestPayload
    ) -> None:
        return await self._caller("route_set_section_variant_name", payload)

    async def set_section_with_params_display_mode(
        self, payload: ListenerSetSectionWithParamsDisplayModeRequestPayload
    ) -> None:
        return await self._caller("route_set_section_with_params_display_mode", payload)

    async def set_show_param_display_names(
        self, payload: ListenerSetShowParamDisplayNamesRequestPayload
    ) -> None:
        return await self._caller("route_set_show_param_display_names", payload)

    async def set_social_url(self, payload: ListenerSetSocialUrlRequestPayload) -> None:
        return await self._caller("route_set_social_url", payload)

    async def set_text_block_display_mode(
        self, payload: ListenerSetTextBlockDisplayModeRequestPayload
    ) -> None:
        return await self._caller("route_set_text_block_display_mode", payload)

    async def set_text_block_format(
        self, payload: ListenerSetTextBlockFormatRequestPayload
    ) -> None:
        return await self._caller("route_set_text_block_format", payload)

    async def set_text_block_heading_as_section_name(
        self, payload: ListenerSetTextBlockHeadingAsSectionNameRequestPayload
    ) -> None:
        return await self._caller(
            "route_set_text_block_heading_as_section_name", payload
        )

    async def set_text_block_meta_control_style(
        self, payload: ListenerSetTextBlockMetaControlStyleRequestPayload
    ) -> None:
        return await self._caller("route_set_text_block_meta_control_style", payload)

    async def set_text_block_text(
        self, payload: ListenerSetTextBlockTextRequestPayload
    ) -> None:
        return await self._caller("route_set_text_block_text", payload)

    async def set_top_level_section_layout(
        self, payload: ListenerSetTopLevelSectionLayoutRequestPayload
    ) -> None:
        return await self._caller("route_set_top_level_section_layout", payload)

    async def set_type_error_ignore(
        self, payload: ListenerSetTypeErrorIgnoreRequestPayload
    ) -> None:
        return await self._caller("route_set_type_error_ignore", payload)

    async def set_view_mode_name(
        self, payload: ListenerSetViewModeNameRequestPayload
    ) -> None:
        return await self._caller("route_set_view_mode_name", payload)

    async def set_viewport(self, payload: ListenerSetViewportRequestPayload) -> None:
        return await self._caller("route_set_viewport", payload)

    async def text_field_completion(
        self, payload: ListenerTextFieldCompletionRequestPayload
    ) -> list[CodeMirrorCompletion]:
        return await self._caller("route_text_field_completion", payload)

    async def toggle_group_orientation(
        self, payload: ListenerToggleGroupOrientationRequestPayload
    ) -> None:
        return await self._caller("route_toggle_group_orientation", payload)

    async def toggle_is_editing_view_mode(
        self, payload: ListenerToggleIsEditingViewModeRequestPayload
    ) -> None:
        return await self._caller("route_toggle_is_editing_view_mode", payload)

    async def toggle_minimized(
        self, payload: ListenerToggleMinimizedRequestPayload
    ) -> None:
        return await self._caller("route_toggle_minimized", payload)

    async def toggle_param_selected(
        self, payload: ListenerToggleParamSelectedRequestPayload
    ) -> None:
        return await self._caller("route_toggle_param_selected", payload)

    async def toggle_position_locks(
        self, payload: ListenerTogglePositionLocksRequestPayload
    ) -> None:
        return await self._caller("route_toggle_position_locks", payload)

    async def toggle_section_visibility(
        self, payload: ListenerToggleSectionVisibilityRequestPayload
    ) -> None:
        return await self._caller("route_toggle_section_visibility", payload)

    async def toggle_variant_frozen(
        self, payload: ListenerToggleVariantFrozenRequestPayload
    ) -> None:
        return await self._caller("route_toggle_variant_frozen", payload)

    async def toggle_variant_json_source(
        self, payload: ListenerToggleVariantJSONSourceRequestPayload
    ) -> None:
        return await self._caller("route_toggle_variant_json_source", payload)

    async def toggle_view_mode_user_facing(
        self, payload: ListenerToggleViewModeUserFacingRequestPayload
    ) -> None:
        return await self._caller("route_toggle_view_mode_user_facing", payload)

    async def type_check(self, payload: ListenerTypeCheckRequestPayload) -> None:
        return await self._caller("route_type_check", payload)

    async def undo(self, payload: ListenerUndoRequestPayload) -> None:
        return await self._caller("route_undo", payload)

    async def ungroup_groups(
        self, payload: ListenerUngroupGroupsRequestPayload
    ) -> None:
        return await self._caller("route_ungroup_groups", payload)

    async def unselect_all_params(
        self, payload: ListenerUnselectAllParamsRequestPayload
    ) -> None:
        return await self._caller("route_unselect_all_params", payload)

    async def update_edge(self, payload: ListenerUpdateEdgeRequestPayload) -> None:
        return await self._caller("route_update_edge", payload)

    async def update_param_impl_config(
        self, payload: ListenerUpdateParamImplConfigRequestPayload
    ) -> None:
        return await self._caller("route_update_param_impl_config", payload)
