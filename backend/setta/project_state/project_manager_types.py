from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel, Field

from setta.code_gen.dependency_graph import RenameReferenceChangedValue
from setta.project_state.lsp_response_handlers.signatureHelp import SignatureHelpStatus
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.app_definition import AppDefinition, AppRoute
from setta.types.app_validation import AppCapabilities, AppValidationIssue
from setta.types.artifact import ChartType, DrawAreaLayerItem
from setta.types.binary_content import BinaryContentRef
from setta.types.chat_messages import JSONValue
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.code_obj_impls import CodeObjType
from setta.types.edges import Edge, EdgePort
from setta.types.generated.chart_settings_unions import (
    BaseChartSettingsUnionWithDiscriminator,
)
from setta.types.generated.unions import (
    BaseSectionImplArgsUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectCodegenTarget,
    TopLevelSectionLayout,
    Viewport,
    ViewportBounds,
    WatchCodeFolder,
    WindowSpaceState,
)
from setta.types.project_state import (
    ProjectChatWindowingState,
    ProjectStateSingleConfig,
)
from setta.types.prompt import PromptFormat
from setta.types.section_impls import (
    BrowserAreaViewMode,
    BrowserSavedSearch,
    ChatDictationMode,
    ChatPermissionMode,
    ChatSectionState,
    CodeFileAccessMode,
    ListRootViewMode,
    SectionSize,
    SectionType,
    SpreadsheetGridDensity,
    StateMachineGateType,
    TaskBoardColumn,
    TaskBoardTask,
    TaskBoardViewMode,
    TextBlockDisplayMode,
    TextBlockFormat,
)
from setta.types.settings_state import RenameRefactorMode, RunSnapshotMode
from setta.types.state_machine_edges import (
    StateMachineEdge,
    StateMachineSourceActivationCountCondition,
    StateMachineSourceFilter,
    StateMachineTargetAction,
)
from setta.utils.constants import C


class ProjectManagerRequestWithFrontendOp(BaseModel):
    frontendOpId: str | None = None


class ProjectManagerRequestWithProjectConfig(ProjectManagerRequestWithFrontendOp):
    """Base request payload for operations scoped to a project configuration."""

    projectConfigId: ID = Field(
        description="Project configuration being queried or mutated.",
    )


class ProjectManagerRequestWithSection(ProjectManagerRequestWithProjectConfig):
    """Base request payload for operations targeting a single section."""

    sectionId: ID = Field(
        description="Section targeted by the request.",
    )


class ProjectManagerRequestWithSectionVariant(ProjectManagerRequestWithSection):
    """Base request payload for operations targeting a specific section variant."""

    variantId: ID = Field(
        description="Variant targeted by the request.",
    )


class ProjectManagerRequestWithVariant(ProjectManagerRequestWithProjectConfig):
    """Base request payload for operations targeting a variant without section context."""

    variantId: ID = Field(
        description="Variant targeted by the request.",
    )


class ProjectManagerRequestWithSectionParam(ProjectManagerRequestWithSection):
    """Base request payload for operations targeting a parameter within a section."""

    paramInfoId: ID = Field(
        description="Parameter targeted by the request.",
    )


class ProjectManagerRequestWithSectionIds(ProjectManagerRequestWithProjectConfig):
    """Base request payload for operations referencing multiple sections."""

    sectionIds: list[ID] = Field(
        description="Identifiers of the sections targeted by the request.",
    )


class RunCodeRequest(BaseModel):
    projectConfigId: ID = Field(
        description="Project configuration to run.",
    )
    sectionId: ID | None = Field(
        description="Optional section to run; defaults to the entry code block.",
    )
    terminalSectionId: ID | None = Field(
        default=None,
        description="Optional terminal section to stream run output.",
    )
    cliId: str | None = Field(
        default=None,
        description="CLI client id to stream run output.",
    )
    runSnapshotMode: RunSnapshotMode | None = Field(
        default=None,
        description="Optional run snapshot mode override for this run.",
    )
    drawSnapshotsBySectionId: dict[ID, BinaryContentRef] | None = Field(
        default=None,
        description="Optional binary PNG payloads for draw sections keyed by section id.",
    )
    sectionVariantOverrides: dict[ID, ID] | None = Field(
        default=None,
        description="Optional section variant overrides keyed by section id.",
    )
    paramOverrides: dict[str, str] | None = Field(
        default=None,
        description='Optional parameter overrides keyed by "sectionId:paramId".',
    )


class RunStatus(str, Enum):
    queued = "queued"
    running = "running"
    exited = "exited"
    failed = "failed"
    canceled = "canceled"
    lost = "lost"


class RunDetachedRequest(ProjectManagerRequestWithProjectConfig):
    entrySectionId: ID | None = Field(
        default=None,
        description="Optional section to run; defaults to the entry code block.",
    )
    runSnapshotMode: RunSnapshotMode | None = Field(
        default=None,
        description="Optional run snapshot mode override for this run.",
    )
    sectionVariantOverrides: dict[ID, ID] | None = Field(
        default=None,
        description="Optional section variant overrides keyed by section id.",
    )
    paramOverrides: dict[str, str] | None = Field(
        default=None,
        description='Optional parameter overrides keyed by "sectionId:paramId".',
    )
    tags: dict[str, str] | None = Field(
        default=None,
        description="Optional tags to associate with the run.",
    )


class RunDetachedResponse(BaseModel):
    runId: str
    status: RunStatus


class RunStatusResponse(BaseModel):
    runId: str
    status: RunStatus
    createdAtMs: int
    startedAtMs: int | None
    exitedAtMs: int | None
    exitCode: int | None
    pid: int | None
    command: str
    snapshotPath: str
    projectConfigId: ID
    entrySectionId: ID | None
    tags: dict[str, str]


class GetRunStatusRequest(BaseModel):
    runId: str


class CancelRunRequest(BaseModel):
    runId: str


class ClearTextFieldCompletionRequest(ProjectManagerRequestWithSection):
    paramInfoId: ID | None


class SetCallableRequest(ProjectManagerRequestWithSection):
    """Request payload for re-binding a callable section implementation."""

    callableName: str = Field(
        description="Fully-qualified callable identifier to store on the section.",
    )
    refetchParams: bool = Field(
        description="True to refresh callable parameter definitions post-update.",
    )


class SetCallableChildCodeObj(BaseModel):
    codeObjId: ID = Field(
        description="Identifier of the parameter code object bound to the callable.",
    )
    name: str = Field(
        description="Name of the parameter code object bound to the callable.",
    )


class SetCallableResponse(BaseModel):
    callableId: ID | None = Field(
        default=None,
        description="The callable currently attached to the section after the update.",
    )
    childCodeObjs: list[SetCallableChildCodeObj] = Field(
        default_factory=list,
        description="Ordered parameter code objects associated with the callable.",
    )
    lspStatus: SignatureHelpStatus = Field(
        description="Outcome of the signatureHelp request used to discover parameters.",
    )


class TextFieldCompletionRequest(ProjectManagerRequestWithSection):
    paramInfoId: ID | None
    fullText: str
    position: int


class OutputAccessorCompletionRequest(ProjectManagerRequestWithSection):
    fullText: str
    position: int


class CodeAreaCompletionRequest(ProjectManagerRequestWithSection):
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(ProjectManagerRequestWithProjectConfig):
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(ProjectManagerRequestWithProjectConfig):
    fullText: str
    position: int


class ChangeParamImplRequest(ProjectManagerRequestWithSectionParam):
    """Switch a parameter to a different implementation option."""

    selectedId: ID = Field(
        description="Implementation identifier selected by the caller.",
    )


class UpdateParamImplConfigRequest(ProjectManagerRequestWithSectionParam):
    """Persist a new configuration object for a parameter implementation."""

    newConfig: dict = Field(
        description="Arbitrary dict serialized into the implementation config.",
    )


class MoveParamsRequest(ProjectManagerRequestWithSection):
    """Reorder or reparent parameters within a section."""

    paramIds: list[ID] = Field(
        description="Ordered parameter identifiers to move.",
    )
    newParentId: ID = Field(
        description="Parent code object that will receive the parameters.",
    )
    newIndex: int = Field(
        description="Index within the new parent's children list.",
    )


class MoveParamGroup(BaseModel):
    """Single ordered move operation for parameters."""

    paramIds: list[ID] = Field(
        description="Ordered parameter identifiers to move.",
    )
    newParentId: ID = Field(
        description="Parent code object that will receive the parameters.",
    )
    newIndex: int = Field(
        description="Index within the new parent's children list.",
    )


class MoveParamGroupsRequest(ProjectManagerRequestWithSection):
    """Apply multiple parameter move operations as a single batch."""

    moves: list[MoveParamGroup] = Field(
        description="Ordered param move operations to apply.",
    )


class IndentParamsRequest(ProjectManagerRequestWithSection):
    """Indent parameters under the previous sibling."""

    paramIds: list[ID] = Field(
        description="Ordered parameter identifiers to indent.",
    )


class UnindentParamsRequest(ProjectManagerRequestWithSection):
    """Unindent parameters to the parent's parent."""

    paramIds: list[ID] = Field(
        description="Ordered parameter identifiers to unindent.",
    )


class CreateTopLevelSectionRequest(ProjectManagerRequestWithProjectConfig):
    """Create a new section anchored at the top level of the canvas."""

    implType: SectionType = Field(
        description="Section implementation type to instantiate.",
    )
    controlCodeObjType: CodeObjType | None = Field(
        default=None,
        description="Optional meta control code obj type to instantiate.",
    )
    implOverrides: BaseSectionImplArgsUnionWithDiscriminator | None = Field(
        default=None,
        description="Implementation-specific overrides applied during creation.",
        json_schema_extra={C.MCP_HIDDEN_FIELD_SCHEMA_KEY: True},
    )
    position: Position | None = Field(
        default=None,
        description="Canvas coordinates where the section should be placed.",
    )
    name: str | None = Field(
        default=None,
        description="Optional initial section name to apply atomically at creation.",
    )
    topLevelSections: dict[ID, TopLevelSectionLayout] | None = Field(
        default=None,
        description="Latest top-level section layout snapshot for smart placement.",
        json_schema_extra={C.MCP_HIDDEN_FIELD_SCHEMA_KEY: True},
    )
    viewportBounds: ViewportBounds | None = Field(
        default=None,
        description="Visible canvas bounds for smart placement.",
        json_schema_extra={C.MCP_HIDDEN_FIELD_SCHEMA_KEY: True},
    )


class CreateTopLevelSectionResponse(BaseModel):
    sectionId: ID = Field(
        description="Identifier for the newly created top-level section.",
    )
    metaControlParamId: ID | None = Field(
        default=None,
        description=(
            "Meta control param identifier created with this section when applicable."
        ),
    )
    panTo: Position | None = Field(
        default=None,
        description="Optional viewport center for panning to the new section.",
    )


class CreateChildSectionsRequest(ProjectManagerRequestWithProjectConfig):
    """Insert one or more child sections directly beneath a parent."""

    parentId: ID = Field(
        description="Parent section that will receive the newly created children.",
    )
    implType: SectionType = Field(
        description="Implementation type shared by each created child.",
    )
    numChildren: int = Field(
        description="Total children to create within the parent.",
    )
    startIdx: int | None = Field(
        description="Optional insertion index determining where children are placed.",
    )


class CreateChildSectionsViaIncrementerRequest(ProjectManagerRequestWithProjectConfig):
    """Expand incrementer controls by creating additional repeated children."""

    calledBy: ID = Field(
        description="Identifier of the incrementer or section initiating the action.",
    )
    numChildren: int = Field(
        description="Number of children the incrementer should add.",
    )
    implType: SectionType = Field(
        description="Implementation type used for each new child.",
    )


class DeleteSectionsRequest(ProjectManagerRequestWithSectionIds):
    """Delete one or more sections from the project state."""


class DeleteChildSectionsViaDecrementerRequest(ProjectManagerRequestWithProjectConfig):
    """Reduce an incrementer-controlled group by deleting existing children."""

    calledBy: ID = Field(
        description="Identifier of the decrementer or section requesting removal.",
    )
    numChildren: int = Field(
        description="How many trailing children to remove.",
    )


class CreateNewSectionVariantRequest(ProjectManagerRequestWithSection):
    """Clone the current section state into a new variant slot."""


class CreateViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Create a new view mode with default visibility settings."""


class SetActiveViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Set the active view mode for the project config."""

    activeViewModeId: ID = Field(
        description="Identifier of the view mode to activate.",
    )


class ToggleIsEditingViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Toggle the active view mode between edit and preview."""


class ToggleSectionVisibilityRequest(ProjectManagerRequestWithSectionIds):
    """Toggle visibility for sections in the active view mode."""


class ToggleViewModeUserFacingRequest(ProjectManagerRequestWithProjectConfig):
    """Update whether a view mode is considered user-facing."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to update.",
    )


class ToggleViewModeTabRequest(ProjectManagerRequestWithProjectConfig):
    """Update whether a view mode is shown as a tab."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to update.",
    )


class SetViewModeNameRequest(ProjectManagerRequestWithProjectConfig):
    """Rename a view mode in the current project config."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to rename.",
    )
    name: str = Field(
        description="New display name for the view mode.",
    )


class SetViewModeSortOrderRequest(ProjectManagerRequestWithProjectConfig):
    """Persist a full ordered list of view mode IDs."""

    orderedViewModeIds: list[ID] = Field(
        description="Complete list of view mode IDs in desired order.",
    )


class DeleteViewModeRequest(ProjectManagerRequestWithProjectConfig):
    """Remove a view mode from the current project config."""

    viewModeId: ID = Field(
        description="Identifier of the view mode to delete.",
    )


class CreateWindowSpaceRequest(ProjectManagerRequestWithProjectConfig):
    """Create a saved window space from a floating-window snapshot."""

    state: WindowSpaceState = Field(
        description="Serialized floating-window arrangement to persist.",
    )
    name: str | None = Field(
        default=None,
        description="Optional initial display name for the saved window space.",
    )


class SetWindowSpaceNameRequest(ProjectManagerRequestWithProjectConfig):
    """Rename a saved window space."""

    windowSpaceId: ID = Field(
        description="Identifier of the window space to rename.",
    )
    name: str = Field(
        description="New display name for the window space.",
    )


class SetWindowSpaceSortOrderRequest(ProjectManagerRequestWithProjectConfig):
    """Persist a full ordered list of window-space IDs."""

    orderedWindowSpaceIds: list[ID] = Field(
        description="Complete list of window-space IDs in desired order.",
    )


class DeleteWindowSpaceRequest(ProjectManagerRequestWithProjectConfig):
    """Delete a saved window space."""

    windowSpaceId: ID = Field(
        description="Identifier of the window space to delete.",
    )


class UndoRequest(ProjectManagerRequestWithProjectConfig):
    steps: int


class RedoRequest(ProjectManagerRequestWithProjectConfig):
    steps: int


class GetLatestProjectStateRequest(ProjectManagerRequestWithProjectConfig):
    """Request a full snapshot of the specified project config's state."""


class GetLatestProjectStateSummaryRequest(ProjectManagerRequestWithProjectConfig):
    """Request a lightweight summary snapshot of the specified project config."""


class GetLatestLspDiagnosticsRequest(ProjectManagerRequestWithProjectConfig):
    """Request the latest parsed LSP diagnostics payload for a project config."""


class ForceRefreshProjectRequest(ProjectManagerRequestWithProjectConfig):
    pass


class SetTopLevelSectionLayoutRequest(ProjectManagerRequestWithProjectConfig):
    """Override layout metadata for every top-level section in a config."""

    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(
        description="Mapping of section IDs to their serialized layout data.",
    )


class AutoLayoutTopLevelSectionsRequest(ProjectManagerRequestWithProjectConfig):
    """Compute and apply an automatic layout for top-level sections."""

    margin: int = Field(
        default=50,
        description="Padding applied around each section during packing.",
    )


class AddKwargRequest(ProjectManagerRequestWithSection):
    """Append a keyword argument entry to the callable section."""


class DeleteKwargRequest(ProjectManagerRequestWithSection):
    """Remove the most recently added keyword argument from a section."""


class DeleteSelectedParamsRequest(ProjectManagerRequestWithSection):
    """Remove selected parameters from a section."""

    paramInfoIds: list[ID] = Field(
        description="Parameter IDs to remove from the section.",
    )


class DeleteSectionVariantOrAskRequest(ProjectManagerRequestWithSectionVariant):
    pass


class ToggleVariantJSONSourceRequest(ProjectManagerRequestWithSectionVariant):
    pass


class SetVariantJsonSourceKeysRequest(ProjectManagerRequestWithSectionVariant):
    jsonSourceKeys: list[str] = Field(
        description="Key path within the JSON source to scope this section to.",
    )


class DeleteJSONSourceFileAndVariantRequest(ProjectManagerRequestWithSectionVariant):
    filepath: str


class SetTextBlockTextRequest(ProjectManagerRequestWithSection):
    text: str


class SetProjectConfigCodegenTargetsRequest(ProjectManagerRequestWithProjectConfig):
    """Update the enabled code generation targets for a project."""

    codegenTargets: list[ProjectCodegenTarget] = Field(
        description="Ordered list of enabled codegen targets.",
    )


class GetAppDefinitionRequest(ProjectManagerRequestWithFrontendOp):
    """Fetch the stored app UI spec and definition."""


class AppDefinitionResponse(BaseModel, extra="forbid"):
    appSpec: JSONValue | None = None
    appDefinition: AppDefinition | None = None


class SetAppDefinitionRequest(ProjectManagerRequestWithFrontendOp):
    """Replace the app UI spec and optionally update app definition metadata."""

    appSpec: JSONValue = Field(
        description="Full JSON app spec to persist.",
    )
    appSpecPath: str | None = Field(
        default=None,
        description="Optional override path for the app spec file.",
    )
    appSpecVersion: str | None = Field(
        default=None,
        description="Optional app spec version override.",
    )
    catalogId: str | None = Field(
        default=None,
        description="Optional catalog id override for the app spec.",
    )
    routes: list[AppRoute] | None = Field(
        default=None,
        description="Optional route definitions for the app.",
    )
    dataBindings: dict[str, JSONValue] | None = Field(
        default=None,
        description="Optional data binding overrides for the app.",
    )
    actions: dict[str, JSONValue] | None = Field(
        default=None,
        description="Optional action map overrides for the app.",
    )
    theme: dict[str, JSONValue] | None = Field(
        default=None,
        description="Optional theme overrides for the app.",
    )
    assets: list[JSONValue] | None = Field(
        default=None,
        description="Optional asset list for the app.",
    )


class ValidateAppDefinitionRequest(ProjectManagerRequestWithFrontendOp):
    """Validate an app spec + definition overrides without persisting them."""

    appSpec: JSONValue = Field(description="Full JSON app spec to validate.")
    appSpecVersion: str | None = Field(
        default=None,
        description="Optional app spec version override.",
    )
    catalogId: str | None = Field(
        default=None,
        description="Optional catalog id override for the app spec.",
    )
    routes: list[AppRoute] | None = Field(
        default=None,
        description="Optional route definitions for the app.",
    )
    dataBindings: dict[str, JSONValue] | None = Field(
        default=None,
        description="Optional data binding overrides for the app.",
    )
    actions: dict[str, JSONValue] | None = Field(
        default=None,
        description="Optional action map overrides for the app.",
    )
    theme: dict[str, JSONValue] | None = Field(
        default=None,
        description="Optional theme overrides for the app.",
    )
    assets: list[JSONValue] | None = Field(
        default=None,
        description="Optional asset list for the app.",
    )


class ValidateAppDefinitionResponse(BaseModel, extra="forbid"):
    errors: list[AppValidationIssue] = Field(default_factory=list)
    warnings: list[AppValidationIssue] = Field(default_factory=list)
    capabilities: AppCapabilities


class UpdateAppDefinitionRequest(ProjectManagerRequestWithFrontendOp):
    """Apply a JSON merge patch to the stored app UI spec."""

    patch: JSONValue = Field(
        description="Partial JSON payload to merge into the app spec.",
    )


class SetPromptTemplateRequest(ProjectManagerRequestWithSection):
    template: str


class SetPromptTemplateLinkRequest(ProjectManagerRequestWithSection):
    promptTemplateId: ID | None


class SetPromptFormatRequest(ProjectManagerRequestWithSection):
    format: PromptFormat


class SetGenCodePrefixRequest(ProjectManagerRequestWithProjectConfig):
    """Update the text prepended to generated Python code (python target only)."""

    genCodePrefix: str = Field(
        description="Arbitrary prefix inserted at the start of generated code files.",
    )


class SetGenCodeSuffixRequest(ProjectManagerRequestWithProjectConfig):
    """Update the text appended to generated Python code (python target only)."""

    genCodeSuffix: str = Field(
        description="Suffix appended to the end of generated code files.",
    )


class SetShowParamDisplayNamesRequest(ProjectManagerRequestWithProjectConfig):
    """Toggle whether display names are used for parameters in the UI."""

    showParamDisplayNames: bool = Field(
        description="True to show display names for parameters, false to show canonical names.",
    )


class SetWatchCodeEnabledRequest(ProjectManagerRequestWithProjectConfig):
    """Enable or disable watch code mode for the project."""

    enabled: bool = Field(
        description="Whether watch code mode is enabled for this project.",
    )


class SetWatchCodeInputsRequest(ProjectManagerRequestWithProjectConfig):
    """Update watched file and folder inputs for watch code mode."""

    watchCodeFolders: list[WatchCodeFolder] = Field(
        description="Folders to watch for new callables.",
    )
    watchCodeFiles: list[str] = Field(
        description="Specific files to watch for new callables.",
    )


class SetParamEnteredValueRequest(ProjectManagerRequestWithSectionParam):
    """Assign a new manual value to a parameter within a section."""

    value: str = Field(
        description="Raw text value to persist for the parameter.",
    )


class GetPasswordParamValueRequest(ProjectManagerRequestWithSectionParam):
    """Fetch the saved secret for a password parameter within a section."""


class GetPasswordParamValueResponse(BaseModel):
    value: str = Field(
        description="Stored secret value for the password parameter.",
    )


class SetTypeErrorIgnoreRequest(ProjectManagerRequestWithSection):
    """Toggle ignoring type errors for a callable or parameter within a section."""

    paramInfoId: ID | None = Field(
        description="Parameter identifier to ignore, or None to target callable errors.",
    )
    ignoreTypeErrors: bool = Field(
        description="Whether to hide type errors for the targeted entry.",
    )


class SetCodeSectionDiagnosticsMuteRequest(ProjectManagerRequestWithSection):
    """Toggle muting LSP diagnostics for a code section."""

    mute: bool = Field(
        description="Whether to mute LSP diagnostics for the code section.",
    )


class SetCodeSectionDiagnosticCodeSuppressionRequest(ProjectManagerRequestWithSection):
    """Toggle suppressing a diagnostic code for a code section."""

    code: str | int = Field(
        description="Diagnostic code to suppress for this code section.",
    )
    suppress: bool = Field(
        description="Whether to suppress the diagnostic code.",
    )


class SetCodeSectionAttachedTerminalRequest(ProjectManagerRequestWithSection):
    """Attach or detach a terminal section for a code section."""

    terminalSectionId: ID | None = Field(
        default=None,
        description="Terminal section to attach; null detaches.",
    )


class SetParamNameAndValueRequest(ProjectManagerRequestWithSection):
    """Set a parameter's name and value in one step."""

    codeObjId: ID = Field(
        description="Identifier of the parameter code object that should be renamed.",
    )
    name: str = Field(
        description="New name to apply to the parameter code object.",
    )
    value: str = Field(
        description="Raw text value to persist for the parameter.",
    )


class SetCodeObjNameRequest(ProjectManagerRequestWithProjectConfig):
    """Rename a code object tracked within the project state."""

    codeObjId: ID = Field(
        description="Identifier of the code object that should be renamed.",
    )
    name: str = Field(
        description="New human-readable name to store on the code object.",
    )


class SetCodeObjDisplayNameRequest(ProjectManagerRequestWithProjectConfig):
    """Set the user-facing display name for a code object."""

    codeObjId: ID = Field(
        description="Identifier of the code object whose display name should change.",
    )
    displayName: str = Field(
        description="Optional user-facing display name for the code object.",
    )


class TogglePositionLocksRequest(ProjectManagerRequestWithSectionIds):
    """Flip the layout lock flag for multiple sections."""


class ToggleMinimizedRequest(ProjectManagerRequestWithSection):
    """Expand or collapse a section."""


class ToggleGroupOrientationRequest(ProjectManagerRequestWithSection):
    """Switch a group section between horizontal and vertical layouts."""


class SetGroupOverflowModeRequest(ProjectManagerRequestWithSection):
    """Toggle whether a group section constrains its children with scrolling."""

    overflowMode: bool = Field(
        description="True to keep group contents in a scrollable viewport.",
    )


class SetCodeRequest(ProjectManagerRequestWithSection):
    """Submit inline code edits for a section."""

    code: str = Field(
        description="Source text that replaces the section's existing code.",
    )


class FormatCodeRequest(ProjectManagerRequestWithSection):
    """Format the code in a section using Ruff."""


class CodeFileBindingUpdate(BaseModel):
    canonical_path: str
    access_mode: CodeFileAccessMode


class SetCodeFileBindingRequest(ProjectManagerRequestWithSection):
    binding: CodeFileBindingUpdate


class SetSectionParamFilterRequest(ProjectManagerRequestWithSection):
    """Set the interactive filter string applied to a section's parameters."""

    value: str = Field(
        description="Raw text filter string; empty text clears any filter.",
    )


class SetSectionEdgeInputsRequest(ProjectManagerRequestWithSection):
    edgeInputParams: list[ID]


class SetSectionEdgeOutputsRequest(ProjectManagerRequestWithSection):
    edgeOutputPorts: list[EdgePort]


class CreateEdgeRequest(ProjectManagerRequestWithProjectConfig):
    sourceSectionId: ID
    sourceVariantId: ID
    sourcePortId: ID
    targetSectionId: ID
    targetVariantId: ID
    targetPortId: ID
    type: str = "default"
    label: str | None = None
    style: dict[str, str | int | float] | None = None
    animated: bool = False
    hidden: bool = False
    zIndex: int = 0
    data: dict[str, object] | None = None


class UpdateEdgeRequest(ProjectManagerRequestWithProjectConfig):
    edge: Edge


class DeleteEdgesRequest(ProjectManagerRequestWithProjectConfig):
    edgeIds: list[ID]


class ReconnectEdgeRequest(ProjectManagerRequestWithProjectConfig):
    edgeId: ID
    sourceSectionId: ID
    sourceVariantId: ID
    sourcePortId: ID
    targetSectionId: ID
    targetVariantId: ID
    targetPortId: ID


class SetEdgesRequest(ProjectManagerRequestWithProjectConfig):
    edges: list[Edge]


class CreateAgenticEdgeRequest(ProjectManagerRequestWithProjectConfig):
    id: ID | None = None
    sourceSectionId: ID
    targetSectionId: ID
    kind: AgenticEdgeKind
    contextMode: AgenticEdgeContextMode = AgenticEdgeContextMode.reference_only
    style: dict[str, str | int | float] | None = None
    hidden: bool = False
    zIndex: int = 0


class UpdateAgenticEdgeRequest(ProjectManagerRequestWithProjectConfig):
    edge: AgenticEdge


class DeleteAgenticEdgesRequest(ProjectManagerRequestWithProjectConfig):
    edgeIds: list[ID]


class SetAgenticEdgesRequest(ProjectManagerRequestWithProjectConfig):
    edges: list[AgenticEdge]


class CreateStateMachineEdgeRequest(ProjectManagerRequestWithProjectConfig):
    id: ID | None = None
    machineGroupId: str
    sourceSectionId: ID
    sourcePortId: str
    targetSectionId: ID
    targetPortId: str
    sourceFilter: StateMachineSourceFilter | None = None
    sourceActivationCountCondition: (
        StateMachineSourceActivationCountCondition | None
    ) = None
    targetAction: StateMachineTargetAction | None = None
    style: dict[str, str | int | float] | None = None
    hidden: bool = False
    zIndex: int = 0


class UpdateStateMachineEdgeRequest(ProjectManagerRequestWithProjectConfig):
    edge: StateMachineEdge


class DeleteStateMachineEdgesRequest(ProjectManagerRequestWithProjectConfig):
    edgeIds: list[ID]


class SetStateMachineEdgesRequest(ProjectManagerRequestWithProjectConfig):
    edges: list[StateMachineEdge]


class SetSectionVariantRequest(ProjectManagerRequestWithSectionVariant):
    """Swap a section to the specified variant."""

    pass


class SetDefaultSectionVariantRequest(ProjectManagerRequestWithSectionVariant):
    """Redefine which variant becomes the default for a section."""

    pass


class SetSectionVariantSortOrderRequest(ProjectManagerRequestWithSection):
    """Persist the ordered list of variants for a section."""

    orderedVariantIds: list[ID] = Field(
        description="Complete list of variant IDs in desired order.",
    )


class ToggleVariantFrozenRequest(ProjectManagerRequestWithVariant):
    pass


class SetSectionVariantNameRequest(ProjectManagerRequestWithVariant):
    name: str


class SetSectionSizesRequest(ProjectManagerRequestWithProjectConfig):
    """Resize one or more sections and persist their section size settings."""

    sectionSizes: dict[ID, SectionSize] = Field(
        description=(
            "Mapping of section IDs to their desired width/height size settings."
        ),
    )


class SetActiveIdsRequest(ProjectManagerRequestWithProjectConfig):
    activeIds: list[ID]


class SetViewportRequest(ProjectManagerRequestWithProjectConfig):
    viewport: Viewport | None


class SetSectionNameRequest(ProjectManagerRequestWithSection):
    """Request payload for renaming a section without changing variants."""

    name: str = Field(
        description="New display name that should be stored on the section.",
    )


class SetSectionTagColorRequest(ProjectManagerRequestWithSection):
    """Request payload for setting or clearing the per-section color tag."""

    tagColor: str | None = Field(
        default=None,
        description="Optional hex color string (for example, #3b82f6). Set null to clear.",
    )


class SetSectionStyleColorRequest(ProjectManagerRequestWithSection):
    """Request payload for setting or clearing per-section style chrome color."""

    styleColor: str | None = Field(
        default=None,
        description="Optional hex color string (for example, #3b82f6). Set null to clear.",
    )


class SetMetaControlShowSectionTitleRequest(ProjectManagerRequestWithSection):
    """Request payload for toggling a meta control section title."""

    showSectionTitle: bool = Field(
        description="True to display the meta control title inline with the control.",
    )


class AcceptRenameRefactorRequest(ProjectManagerRequestWithProjectConfig):
    pass


class DeclineRenameRefactorRequest(ProjectManagerRequestWithProjectConfig):
    pass


class RenameRefactorBroadcastContent(BaseModel):
    projectConfigId: ID
    frontendOpId: str
    renameMode: RenameRefactorMode
    changedNodeValues: list[RenameReferenceChangedValue]


class SetTextBlockDisplayModeRequest(ProjectManagerRequestWithSection):
    textDisplayMode: TextBlockDisplayMode


class SetTextBlockMasterFontSizeRequest(ProjectManagerRequestWithSection):
    masterFontSizePx: float


class SetTextBlockHeadingAsSectionNameRequest(ProjectManagerRequestWithSection):
    """Request payload for toggling text block heading-as-title behavior."""

    headingAsSectionName: bool = Field(
        description="True to use the first markdown heading as the section title.",
    )


class SetTextBlockMetaControlStyleRequest(ProjectManagerRequestWithSection):
    metaControlStyle: bool


class SetCallableHideParamsRequest(ProjectManagerRequestWithSection):
    hideParams: bool


class SetSectionHideUnpinnedParamsRequest(ProjectManagerRequestWithSection):
    hideUnpinnedParams: bool


class SetSectionPinnedParamsRequest(ProjectManagerRequestWithSection):
    pinnedParams: list[ID]


class SetSectionColumnWidthRequest(ProjectManagerRequestWithSection):
    columnWidth: float | None


class SetBrowserColumnWidthsRequest(ProjectManagerRequestWithSection):
    columnWidth: float | None
    typesColumnWidth: float | None


class SetBrowserAreaViewModeRequest(ProjectManagerRequestWithSection):
    viewMode: BrowserAreaViewMode


class SetBrowserHideColumnRequest(ProjectManagerRequestWithSection):
    hideColumn: bool


class SetBrowserSavedSearchesRequest(ProjectManagerRequestWithSection):
    savedSearches: list[BrowserSavedSearch]


class SetTextBlockFormatRequest(ProjectManagerRequestWithSection):
    format: TextBlockFormat


class SetParentDefaultChildSectionTypeRequest(ProjectManagerRequestWithSection):
    defaultChildSectionType: SectionType


class SetListRootViewModeRequest(ProjectManagerRequestWithSection):
    viewMode: ListRootViewMode


class SetTaskBoardSectionStateRequest(ProjectManagerRequestWithSection):
    viewMode: TaskBoardViewMode
    columns: list[TaskBoardColumn]
    tasks: list[TaskBoardTask]


class SetSpreadsheetFilePathRequest(ProjectManagerRequestWithSection):
    filePath: str
    activeSheet: str | None


class SetSpreadsheetSectionSettingsRequest(ProjectManagerRequestWithSection):
    readOnly: bool
    showRowNumbers: bool
    density: SpreadsheetGridDensity
    autoReloadOnExternalChange: bool


class SetStateMachineSectionSettingsRequest(ProjectManagerRequestWithSection):
    machineGroupId: str
    label: str
    gateType: StateMachineGateType | None = None


class SetChatSectionSettingsRequest(ProjectManagerRequestWithSection):
    managed: bool
    engineConfigId: ID | None
    transcriptionProfileId: ID | None
    agentProfileId: ID | None
    thinking: bool
    permissionMode: ChatPermissionMode
    searchEnabled: bool
    dictationMode: ChatDictationMode


class SetChatSectionStateRequest(ProjectManagerRequestWithSection):
    state: ChatSectionState


class SetProjectChatWindowingStateRequest(ProjectManagerRequestWithProjectConfig):
    state: ProjectChatWindowingState


class SetProjectChatWindowChatIdRequest(ProjectManagerRequestWithProjectConfig):
    instanceId: ID
    chatId: ID | None


class GetChatSectionChatIdRequest(ProjectManagerRequestWithSection):
    pass


class SetChatSectionChatIdRequest(ProjectManagerRequestWithSection):
    chatId: ID | None


class SetSocialUrlRequest(ProjectManagerRequestWithSection):
    url: str


class MoveSectionsRequest(ProjectManagerRequestWithSectionIds):
    newParentId: ID | None
    newIndex: int | None
    positionsById: dict[ID, Position] | None


class GroupSectionsRequest(ProjectManagerRequestWithSectionIds):
    pass


class UngroupGroupsRequest(ProjectManagerRequestWithProjectConfig):
    groupIds: list[ID]


class ToggleParamSelectedRequest(ProjectManagerRequestWithSectionParam):
    pass


class UnselectAllParamsRequest(ProjectManagerRequestWithProjectConfig):
    pass


class PrepareSectionsForCopyRequest(ProjectManagerRequestWithSectionIds):
    pass


class PasteSectionsRequest(ProjectManagerRequestWithProjectConfig):
    data: ProjectStateCoreWithSectionVariantMap
    position: Position
    asRef: bool


class SetImageAreaImagePathRequest(ProjectManagerRequestWithSection):
    imagePath: str


class SetChartAreaDataPathRequest(ProjectManagerRequestWithSection):
    dataPath: str


class SetChartTypeRequest(ProjectManagerRequestWithSection):
    chartType: ChartType


class SetChartSettingsRequest(ProjectManagerRequestWithSection):
    chartSettings: BaseChartSettingsUnionWithDiscriminator
    changedSettings: list[str]


class AppendDrawAreaLayerItemRequest(ProjectManagerRequestWithSection):
    layerIdx: int
    element: DrawAreaLayerItem


@dataclass
class ProjectStateSingleConfigWithCompletedOpIds:
    projectState: ProjectStateSingleConfig
    completedOpIds: list[str]
    pendingOpIds: list[str]


class SaveAsNewProjectConfigRequest(ProjectManagerRequestWithProjectConfig):
    newConfigName: str
    withRefs: bool
