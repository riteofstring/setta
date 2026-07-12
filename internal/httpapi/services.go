package httpapi

import (
	"context"
	"net/http"
	"time"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/notify"
	"setta/internal/orchestrator"
	"setta/internal/runtimeauth"
	"setta/internal/semanticgraph"
	"setta/internal/speech"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspaceactivity"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type AppearanceService interface {
	Read(context.Context) (appearance.AppearanceSettings, error)
	Update(context.Context, appearance.AppearanceSettings) (appearance.AppearanceSettings, error)
}

type WorkspaceService interface {
	Close(id string) (workspacesession.WorkspaceSession, error)
	OpenLocalFolder(rootPath string) (workspace.WorkspaceSummary, workspacesession.WorkspaceSession, error)
	RemoveRecent(id string) (workspacesession.WorkspaceSession, error)
	Reorder(ids []string) (workspacesession.WorkspaceSession, error)
	Select(id string) (workspacesession.WorkspaceSession, error)
	SelectedConversationIDs() map[string]string
	SetSelectedConversation(workspaceID string, conversationID string) (map[string]string, error)
	Session() workspacesession.WorkspaceSession
}

type WorkspaceUIService interface {
	ReadLayout(workspaceID string) (workspaceui.WorkspaceUILayoutReadResult, error)
	SaveLayout(layout workspaceui.WorkspaceUILayout) (workspaceui.WorkspaceUILayout, error)
}

type WorkspaceActivityService interface {
	ReadSnapshot(workspaceID string, limit int) (workspaceactivity.WorkspaceActivitySnapshot, error)
	ReadExecutionSnapshot(workspaceID string, executionID string, limit int) (workspaceactivity.WorkspaceActivitySnapshot, error)
	SubscribeEvents(cursor workspaceactivity.EventCursor, workspaceID string) (*workspaceactivity.EventSubscription, error)
}

type ConversationService interface {
	CreateTopic(context.Context, string, string) (conversation.ConversationSnapshot, error)
	ForkTopic(context.Context, string, string, string, string) (conversation.ConversationSnapshot, error)
	CreateSideConversation(context.Context, string, string, string) (conversation.ConversationSnapshot, error)
	SendSideConversationTurn(context.Context, string, string, string, string) (conversation.ConversationSnapshot, error)
	DisposeSideConversation(context.Context, string, string, string, string) (conversation.ConversationSnapshot, error)
	SendTurn(context.Context, string, string, string) (conversation.ConversationSnapshot, error)
	QueueTurn(context.Context, string, string, string) (conversation.ConversationSnapshot, error)
	SteerTurn(context.Context, string, string, string) (conversation.ConversationSnapshot, error)
	StopTurn(context.Context, string, string) (conversation.ConversationSnapshot, error)
	SubmitApproval(
		context.Context,
		string,
		string,
		conversation.ConversationApprovalResponse,
	) (conversation.ConversationSnapshot, error)
	UpdateNarratorVoiceSelection(
		context.Context,
		string,
		string,
		speech.VoiceSelectionRequest,
	) (conversation.ConversationPresentationProfile, error)
	ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error)
	SubscribeEvents(
		conversation.ConversationEventCursor,
		string,
		string,
	) (conversation.ConversationEventSubscription, error)
}

type ConversationNavigatorService interface {
	ListNavigatorPage(
		context.Context,
		string,
		string,
		*conversation.NavigatorCursor,
		int,
	) (conversation.NavigatorPage, error)
}

type NarratorStatusService interface {
	AskStatus(context.Context, string, string, string) (conversation.ConversationSnapshot, error)
}

type ConversationInputService interface {
	DiscardInput(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	ReadInputState(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	RetryInput(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	SubmitInput(context.Context, conversation.ConversationInput) (conversation.AcceptedConversationInput, error)
}

type MasterInputService interface {
	SubmitInput(context.Context, master.MasterInput) (master.AcceptedMasterInput, error)
}

type SpeechService interface {
	ReadCapabilities(context.Context) (speech.SpeechCapabilities, error)
	ReadMasterVoiceSelection(context.Context) (speech.MasterVoiceSelection, error)
	UpdateMasterVoiceSelection(
		context.Context,
		speech.VoiceSelectionRequest,
	) (speech.MasterVoiceSelection, error)
	CreateTranscriptionSession(context.Context, string) (speech.SpeechTranscriptionSession, error)
	SynthesizeSpeech(context.Context, speech.SpeechSynthesisRequest) (speech.SpeechAudio, error)
}

type ChatService interface {
	ActiveRun(workspaceID string, conversationID string) (chat.Run, bool, error)
	ActiveRunWithLiveness(workspaceID string, conversationID string) (chat.Run, *chat.RunLiveness, bool, error)
	CancelActiveRun(workspaceID string, conversationID string) (chat.Run, error)
	ReconcileActiveRuns(context.Context, string, string, chat.RunLivenessReason) (chat.RunLivenessReconciliationResult, error)
	CreateConversation(workspaceID string, title string) (chat.Conversation, error)
	DeleteConversation(workspaceID string, conversationID string) (chat.ConversationListResult, error)
	ListDiagnostics(workspaceID string, conversationID string, runID string) ([]chat.Diagnostic, error)
	ListConversations(workspaceID string) (chat.ConversationListResult, error)
	MarkConversationRead(workspaceID string, conversationID string) (chat.ConversationListItem, error)
	ListRuns(workspaceID string, conversationID string) ([]chat.Run, error)
	LoadMessagePage(workspaceID string, conversationID string, beforeBlockOrdinal int, limit int) (chat.MessagePage, error)
	LoadComposerPromptHistory(workspaceID string, conversationID string, beforeOrdinal int, limit int) (chat.ComposerPromptHistoryPage, error)
	LoadRunActivityPage(workspaceID string, runID string, afterItemID string, limit int) (chat.RunActivityPage, error)
	LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (chat.RunItemOutputPage, error)
	ListBackgroundTerminals(workspaceID string, conversationID string) (chat.BackgroundTerminalListProjection, error)
	LoadBackgroundTerminalOutputPage(workspaceID string, conversationID string, processID string, afterOrdinal int, limit int) (chat.BackgroundTerminalOutputPage, error)
	KillBackgroundTerminal(context.Context, string, string, string) (chat.BackgroundTerminalProcess, error)
	KillAllBackgroundTerminals(context.Context, string, string) (chat.BackgroundTerminalListProjection, error)
	CreateImageAttachmentFromBytes(workspaceID string, conversationID string, fileName string, data []byte) (chat.ImageAttachment, error)
	CreateImageAttachmentFromPath(workspaceID string, conversationID string, sourcePath string) (chat.ImageAttachment, error)
	ExecuteChatCommand(workspaceID string, conversationID string, raw string) (chat.ChatCommandExecuteResult, error)
	ExecuteChatCommandWithOptions(workspaceID string, conversationID string, raw string, options chat.ChatCommandExecutionOptions) (chat.ChatCommandExecuteResult, error)
	EditQueuedInput(workspaceID string, conversationID string, messageID string, input chat.ChatInput) (chat.QueueEditResult, error)
	ListCommands(workspaceID string, conversationID string) (chat.ChatCommandListResult, error)
	OpenChatCodexModelPicker(workspaceID string, conversationID string) (chat.ChatCommandExecuteResult, error)
	OpenChatCodexPermissionPicker(workspaceID string, conversationID string) (chat.ChatCommandExecuteResult, error)
	QueueUserInput(workspaceID string, conversationID string, input chat.ChatInput) (chat.QueueMessageResult, error)
	ReadChatCodexDefaults(context.Context) (chat.ChatCodexDefaultsView, error)
	RemoveQueuedMessage(workspaceID string, conversationID string, messageID string) (chat.QueueRemoveResult, error)
	SendUserInput(workspaceID string, conversationID string, input chat.ChatInput) (chat.SendMessageResult, error)
	SendSteeringInputImmediately(workspaceID string, conversationID string, input *chat.ChatInput) (chat.ImmediateSteeringResult, error)
	SetChatCodexModel(workspaceID string, conversationID string, modelID string) (chat.ChatCommandExecuteResult, error)
	SetChatCodexPermissionPreset(workspaceID string, conversationID string, preset chat.ChatPermissionPresetID, confirmed bool) (chat.ChatCommandExecuteResult, error)
	SetChatCodexReasoningEffort(workspaceID string, conversationID string, effort chat.ReasoningEffort) (chat.ChatCommandExecuteResult, error)
	SetConversationPinned(workspaceID string, conversationID string, pinned bool) (chat.ConversationListItem, error)
	SteerActiveRunInput(workspaceID string, conversationID string, input chat.ChatInput) (chat.SteerMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
	SubmitApproval(workspaceID string, conversationID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (chat.Run, error)
	UpdateChatCodexDefaults(context.Context, chat.ChatCodexSettings, bool) (chat.ChatCodexDefaultsView, error)
}

type CodexAccountService interface {
	CancelLogin(context.Context, codexaccount.CancelCodexLoginRequest) (codexaccount.CodexAccountState, error)
	Logout(context.Context, codexaccount.LogoutCodexAccountRequest) (codexaccount.CodexAccountState, error)
	Read(context.Context) (codexaccount.CodexAccountState, error)
	Refresh(context.Context, codexaccount.RefreshCodexAccountRequest) (codexaccount.CodexAccountState, error)
	StartLogin(context.Context, codexaccount.StartCodexLoginRequest) (codexaccount.StartCodexLoginResponse, error)
}

type WorkflowService interface {
	CancelExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	CreateDefinition(workspaceID string, name string, description string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowDefinition, error)
	DeleteDefinition(workspaceID string, definitionID string) error
	ListDefinitions(workspaceID string) ([]orchestrator.WorkflowDefinition, error)
	ListExecutionSummariesForDefinition(workspaceID string, definitionID string, limit int) ([]orchestrator.WorkflowExecutionSummary, error)
	ReadDefinition(workspaceID string, definitionID string) (orchestrator.WorkflowDefinition, error)
	ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	ListExecutions(workspaceID string) ([]orchestrator.WorkflowExecution, error)
	ReadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (orchestrator.WorkflowExecutionEventPage, error)
	ReadGraphProjection(workspaceID string, definitionID string, versionID string, executionID string) (orchestrator.WorkflowGraphProjection, bool, error)
	ReadWorkflowNodeTrajectory(workspaceID string, executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, afterItemID string, itemLimit int, outputLimit int) (orchestrator.WorkflowAgentTrajectoryPage, error)
	RetryWorkflowNodeRunLiveness(context.Context, string, string, string) (chat.RunLivenessReconciliationResult, error)
	StartExecution(workspaceID string, definitionID string, versionID string) (orchestrator.WorkflowExecution, error)
	SteerWorkflowNodeRun(workspaceID string, executionID string, nodeExecutionID string, input chat.ChatInput) (chat.SteerMessageResult, error)
	StopWorkflowNodeRun(workspaceID string, executionID string, nodeExecutionID string) (orchestrator.WorkflowExecution, error)
	SubscribeEvents(cursor orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error)
	SubmitApproval(workspaceID string, executionID string, nodeExecutionID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (orchestrator.WorkflowExecution, error)
	UpdateDefinition(workspaceID string, definitionID string, name string, description string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowDefinition, error)
	ValidateDefinition(workspaceID string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowValidationResult, error)
}

var _ WorkflowService = (*orchestrator.Service)(nil)

type SemanticGraphService interface {
	ReadGraph(context.Context, string) (semanticgraph.SemanticGraph, error)
	ReadNodeDetail(context.Context, string, string) (semanticgraph.SemanticNodeDetail, bool, error)
	ListEvidence(context.Context, string, string) (semanticgraph.SemanticEvidenceList, error)
	ListActivity(context.Context, string, string, int) (semanticgraph.SemanticActivityList, error)
	ListActivityPage(context.Context, semanticgraph.SemanticActivityFilter) (semanticgraph.SemanticActivityPage, error)
	ReadActivitySummary(context.Context, string, int) (semanticgraph.SemanticActivitySummary, error)
	ReadSteeringState(context.Context, string, string) (semanticgraph.SemanticSteeringState, error)
	ReadEventHistory(context.Context, string, string, int, int) (semanticgraph.SemanticEventHistory, error)
	ReadContextPack(context.Context, string, string) (semanticgraph.SemanticContextPackRecord, bool, error)
	ListContextPacks(context.Context, semanticgraph.SemanticContextPackFilter) (semanticgraph.SemanticContextPackList, error)
	BuildCartographerWindow(context.Context, semanticgraph.CartographerManualWindowRequest) (semanticgraph.CartographerWindowBuildResult, error)
	ProcessCartographerWindow(context.Context, string, string) (semanticgraph.CartographerWindowProcessResult, error)
	ReadCartographerProcessingState(context.Context) (semanticgraph.CartographerProcessingState, error)
	ReadCartographerRun(context.Context, string, string) (semanticgraph.CartographerRun, bool, error)
	ListCartographerRuns(context.Context, semanticgraph.CartographerRunFilter) (semanticgraph.CartographerRunList, error)
	ListCartographerWindows(context.Context, semanticgraph.CartographerWindowFilter) (semanticgraph.CartographerWindowList, error)
	ListCartographerCursors(context.Context, semanticgraph.CartographerCursorFilter) (semanticgraph.CartographerCursorList, error)
	ListCartographerPatches(context.Context, semanticgraph.CartographerPatchFilter) (semanticgraph.CartographerPatchList, error)
	AcceptCartographerPatch(context.Context, string, string) (semanticgraph.CartographerPatchReviewResult, error)
	RejectCartographerPatch(context.Context, string, string) (semanticgraph.CartographerPatchReviewResult, error)
	UpdateLayoutPositions(context.Context, string, []semanticgraph.SemanticLayoutPositionInput) (semanticgraph.SemanticLayoutPositionList, error)
	AttachWorkflowExecution(context.Context, semanticgraph.AttachWorkflowExecutionInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachWorkflowNode(context.Context, semanticgraph.AttachWorkflowNodeInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachChatRun(context.Context, semanticgraph.AttachChatRunInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachChatMessage(context.Context, semanticgraph.AttachChatMessageInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachRunItem(context.Context, semanticgraph.AttachRunItemInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachFileRange(context.Context, semanticgraph.AttachFileRangeInput) (semanticgraph.SemanticAttachmentResult, error)
	EndActivity(context.Context, semanticgraph.EndSemanticActivityInput) (semanticgraph.SemanticActivityEndResult, error)
	RenameNode(context.Context, semanticgraph.RenameSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	UpdateNode(context.Context, semanticgraph.UpdateSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	DismissNode(context.Context, semanticgraph.SemanticNodeOperationInput) (semanticgraph.SemanticMutationResult, error)
	PromoteNode(context.Context, semanticgraph.SemanticNodeOperationInput) (semanticgraph.SemanticMutationResult, error)
	SplitNode(context.Context, semanticgraph.SplitSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	MergeNodes(context.Context, semanticgraph.MergeSemanticNodesInput) (semanticgraph.SemanticMutationResult, error)
	CreateUserNode(context.Context, semanticgraph.CreateSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	CreateUserEdge(context.Context, semanticgraph.CreateSemanticEdgeInput) (semanticgraph.SemanticMutationResult, error)
	UpdateEdge(context.Context, semanticgraph.UpdateSemanticEdgeInput) (semanticgraph.SemanticMutationResult, error)
	RemoveEdge(context.Context, semanticgraph.SemanticEdgeOperationInput) (semanticgraph.SemanticMutationResult, error)
	CreateSteeringDirective(context.Context, semanticgraph.CreateSteeringDirectiveInput) (semanticgraph.SemanticMutationResult, error)
	SubscribeSemanticGraphChanges(semanticgraph.SemanticGraphChangeCursor) (*semanticgraph.SemanticGraphChangeSubscription, error)
	UpdateSteeringDirective(context.Context, semanticgraph.UpdateSteeringDirectiveInput) (semanticgraph.SemanticMutationResult, error)
}

type TerminalService interface {
	Attach(context.Context, string, string) (terminal.SessionSummary, error)
	Close(context.Context, string, bool) (terminal.TerminalCloseResult, error)
	Create(context.Context, string, string, string, string, int, int) (terminal.SessionSummary, error)
	CreateProfile(terminal.TerminalProfileInput) (terminal.TerminalProfileList, error)
	DeleteProfile(string) (terminal.TerminalProfileList, error)
	ListProfiles() (terminal.TerminalProfileList, error)
	Resize(context.Context, string, int, int) (terminal.SessionSummary, error)
	SetDefaultProfile(string) (terminal.TerminalProfileList, error)
	SubscribeEvents(terminal.EventCursor) (*terminal.EventSubscription, error)
	UpdateProfile(string, terminal.TerminalProfileInput) (terminal.TerminalProfileList, error)
	WriteInput(context.Context, string, []byte) (int, error)
}

type RuntimeAuthService interface {
	CompletePairing(context.Context, string, string) (runtimeauth.DeviceSession, string, bool, error)
	IsDeviceSessionRevoked(context.Context, string) (bool, error)
	ListDeviceSessions(context.Context) ([]runtimeauth.DeviceSession, error)
	ResolveDeviceToken(context.Context, string) (runtimeauth.DeviceSession, bool, error)
	RevokeDeviceSession(context.Context, string) (runtimeauth.DeviceSession, bool, error)
	TouchDeviceSession(context.Context, string) (bool, error)
}

type RuntimeIdentity struct {
	ID          string
	DisplayName string
}

type RuntimeIdentityService interface {
	RuntimeIdentity(context.Context) (RuntimeIdentity, error)
	UpdateRuntimeDisplayName(context.Context, string) (RuntimeIdentity, error)
}

type NotifyService interface {
	PublicKey() string
	RemoveDeviceSubscriptions(context.Context, string) error
	Subscribe(context.Context, string, notify.WebPushSubscription) (notify.Subscription, error)
	Test(context.Context, string) (notify.TestResult, error)
	Unsubscribe(context.Context, string, string) (bool, error)
}

type HandlerConfig struct {
	AppearanceService            AppearanceService
	Metadata                     BackendMetadata
	ChatService                  ChatService
	ConversationInputService     ConversationInputService
	ConversationNavigatorService ConversationNavigatorService
	ConversationService          ConversationService
	MasterInputService           MasterInputService
	NarratorStatusService        NarratorStatusService
	CodexAccountService          CodexAccountService
	NotifyService                NotifyService
	PairingFailureLimiter        *PairingFailureLimiter
	RevocationSweepInterval      time.Duration
	RuntimeAuthService           RuntimeAuthService
	RuntimeIdentityService       RuntimeIdentityService
	RuntimeMetadata              RuntimeMetadata
	SemanticGraphService         SemanticGraphService
	SpeechService                SpeechService
	TerminalService              TerminalService
	WorkspaceActivityService     WorkspaceActivityService
	WorkspaceUIService           WorkspaceUIService
	WorkspaceService             WorkspaceService
	WorkflowService              WorkflowService
}

type handler struct {
	appearanceService            AppearanceService
	metadata                     BackendMetadata
	chatService                  ChatService
	conversationInputService     ConversationInputService
	conversationNavigatorService ConversationNavigatorService
	conversationService          ConversationService
	masterInputService           MasterInputService
	narratorStatusService        NarratorStatusService
	codexAccountService          CodexAccountService
	notifyService                NotifyService
	pairingFailureLimiter        *PairingFailureLimiter
	revocationSweepInterval      time.Duration
	runtimeAuthService           RuntimeAuthService
	runtimeIdentityService       RuntimeIdentityService
	runtimeMetadata              RuntimeMetadata
	semanticGraphService         SemanticGraphService
	speechService                SpeechService
	terminalService              TerminalService
	workspaceActivityService     WorkspaceActivityService
	workspaceUIService           WorkspaceUIService
	workspaceService             WorkspaceService
	workflowService              WorkflowService
}

func NewHandler(config HandlerConfig) http.Handler {
	pairingFailureLimiter := config.PairingFailureLimiter
	if pairingFailureLimiter == nil {
		pairingFailureLimiter = NewPairingFailureLimiter(10, time.Minute)
	}
	revocationSweepInterval := config.RevocationSweepInterval
	if revocationSweepInterval <= 0 {
		revocationSweepInterval = 30 * time.Second
	}
	apiHandler := handler{
		appearanceService:            config.AppearanceService,
		metadata:                     config.Metadata,
		chatService:                  config.ChatService,
		conversationInputService:     config.ConversationInputService,
		conversationNavigatorService: config.ConversationNavigatorService,
		conversationService:          config.ConversationService,
		masterInputService:           config.MasterInputService,
		narratorStatusService:        config.NarratorStatusService,
		codexAccountService:          config.CodexAccountService,
		notifyService:                config.NotifyService,
		pairingFailureLimiter:        pairingFailureLimiter,
		revocationSweepInterval:      revocationSweepInterval,
		runtimeAuthService:           config.RuntimeAuthService,
		runtimeIdentityService:       config.RuntimeIdentityService,
		runtimeMetadata:              config.RuntimeMetadata,
		semanticGraphService:         config.SemanticGraphService,
		speechService:                config.SpeechService,
		terminalService:              config.TerminalService,
		workspaceActivityService:     config.WorkspaceActivityService,
		workspaceUIService:           config.WorkspaceUIService,
		workspaceService:             config.WorkspaceService,
		workflowService:              config.WorkflowService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return mux
}
