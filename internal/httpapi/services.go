package httpapi

import (
	"context"
	"net/http"
	"time"

	"setta/internal/appearance"
	"setta/internal/codexaccount"
	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/runtimeauth"
	"setta/internal/speech"
	"setta/internal/workspace"
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
	Relocate(id string, rootPath string) (workspace.WorkspaceSummary, workspacesession.WorkspaceSession, error)
	RefreshAvailability(id string) (workspacesession.WorkspaceSession, error)
	RemoveRecent(id string) (workspacesession.WorkspaceSession, error)
	Reorder(ids []string) (workspacesession.WorkspaceSession, error)
	Select(id string) (workspacesession.WorkspaceSession, error)
	Session() workspacesession.WorkspaceSession
}

type WorkspaceUIService interface {
	ReadLayout(workspaceID string) (workspaceui.WorkspaceUILayoutReadResult, error)
	SaveLayout(layout workspaceui.WorkspaceUILayout) (workspaceui.WorkspaceUILayout, error)
}

type ConversationService interface {
	CreateTopic(context.Context, string, string) (conversation.ConversationSnapshot, error)
	ArchiveTopic(context.Context, string, string) (conversation.ConversationSnapshot, error)
	SendSideConversationTurn(context.Context, string, string, string, string) (conversation.ConversationSnapshot, error)
	DisposeSideConversation(context.Context, string, string, string, string) (conversation.ConversationSnapshot, error)
	StopTurn(context.Context, string, string) (conversation.ConversationSnapshot, error)
	SubmitApproval(
		context.Context,
		string,
		string,
		conversation.ConversationApprovalResponse,
	) (conversation.ConversationSnapshot, error)
	UpdatePresentationProfile(
		context.Context,
		string,
		string,
		conversation.ConversationPresentationSettings,
	) (conversation.ConversationPresentationProfile, error)
	ReadArtifact(context.Context, string, string, string) (conversation.Artifact, error)
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

type ConversationInputService interface {
	DiscardInput(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	ReadInputState(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	WaitInputState(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	RetryInput(context.Context, string, string, string) (conversation.ConversationInputRoutingState, error)
	SubmitInput(context.Context, conversation.ConversationInput) (conversation.AcceptedConversationInput, error)
}

type RoleConfigurationService interface {
	ReadModelCatalog(context.Context) (conversation.RoleModelCatalog, error)
	ReadGlobalConfiguration(context.Context) (conversation.RoleConfiguration, error)
	ReadWorkspaceConfiguration(context.Context, string) (conversation.RoleConfiguration, error)
	ReadConversationConfiguration(context.Context, string, string) (conversation.RoleConfiguration, error)
	UpdateGlobalConfiguration(
		context.Context,
		[]conversation.RoleProfileUpdate,
	) (conversation.RoleConfiguration, error)
	UpdateWorkspaceConfiguration(
		context.Context,
		string,
		[]conversation.RoleProfileUpdate,
	) (conversation.RoleConfiguration, error)
	UpdateConversationConfiguration(
		context.Context,
		string,
		string,
		[]conversation.RoleProfileUpdate,
	) (conversation.RoleConfiguration, error)
}

type MasterInputService interface {
	CancelInput(context.Context, string) (master.ShellInteractionState, error)
	ReadActiveShellInteraction(context.Context) (master.ActiveShellInteraction, error)
	ReadInputState(context.Context, string) (master.InputRoutingState, error)
	SubmitInput(context.Context, master.MasterInput) (master.AcceptedMasterInput, error)
	WaitPresentationIntent(context.Context, string) (master.PresentationIntent, error)
	ResolvePresentationIntent(context.Context, master.PresentationResolutionRequest) (master.PresentationResolution, error)
	WaitShellInteraction(context.Context, string) (master.ShellInteractionState, error)
}

type SpeechService interface {
	ReadCapabilities(context.Context) (speech.SpeechCapabilities, error)
	ReadMasterVoiceSelection(context.Context) (speech.MasterVoiceSelection, error)
	ReadNarratorVoiceDefault(context.Context) (speech.NarratorVoiceDefault, error)
	UpdateMasterVoiceSelection(
		context.Context,
		speech.VoiceSelectionRequest,
	) (speech.MasterVoiceSelection, error)
	UpdateNarratorVoiceDefault(
		context.Context,
		speech.VoiceSelectionRequest,
	) (speech.NarratorVoiceDefault, error)
	ValidateCredential(
		context.Context,
		speech.SpeechProvider,
		string,
		string,
	) (speech.SpeechCredentialValidationResult, error)
	LoadCredential(context.Context, speech.SpeechProvider, string) (speech.SpeechCredentialStatus, error)
	ClearCredential(context.Context, speech.SpeechProvider) (speech.SpeechCredentialStatus, error)
	CreateTranscriptionSession(
		context.Context,
		speech.SpeechProvider,
		string,
	) (speech.SpeechTranscriptionSession, error)
	SynthesizeSpeech(context.Context, speech.SpeechSynthesisRequest) (speech.SpeechAudio, error)
}

type CodexAccountService interface {
	CancelLogin(context.Context, codexaccount.CancelCodexLoginRequest) (codexaccount.CodexAccountState, error)
	Logout(context.Context, codexaccount.LogoutCodexAccountRequest) (codexaccount.CodexAccountState, error)
	Read(context.Context) (codexaccount.CodexAccountState, error)
	Refresh(context.Context, codexaccount.RefreshCodexAccountRequest) (codexaccount.CodexAccountState, error)
	StartLogin(context.Context, codexaccount.StartCodexLoginRequest) (codexaccount.StartCodexLoginResponse, error)
	SubscribeChanges() codexaccount.CodexAccountChangeSubscription
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

type HandlerConfig struct {
	AppearanceService            AppearanceService
	Metadata                     BackendMetadata
	ConversationInputService     ConversationInputService
	ConversationNavigatorService ConversationNavigatorService
	ConversationService          ConversationService
	RoleConfigurationService     RoleConfigurationService
	MasterInputService           MasterInputService
	CodexAccountService          CodexAccountService
	PairingFailureLimiter        *PairingFailureLimiter
	RevocationSweepInterval      time.Duration
	RuntimeAuthService           RuntimeAuthService
	RuntimeIdentityService       RuntimeIdentityService
	RuntimeMetadata              RuntimeMetadata
	SpeechService                SpeechService
	WorkspaceUIService           WorkspaceUIService
	WorkspaceService             WorkspaceService
}

type handler struct {
	appearanceService            AppearanceService
	metadata                     BackendMetadata
	conversationInputService     ConversationInputService
	conversationNavigatorService ConversationNavigatorService
	conversationService          ConversationService
	roleConfigurationService     RoleConfigurationService
	masterInputService           MasterInputService
	codexAccountService          CodexAccountService
	pairingFailureLimiter        *PairingFailureLimiter
	revocationSweepInterval      time.Duration
	runtimeAuthService           RuntimeAuthService
	runtimeIdentityService       RuntimeIdentityService
	runtimeMetadata              RuntimeMetadata
	speechService                SpeechService
	workspaceUIService           WorkspaceUIService
	workspaceService             WorkspaceService
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
		conversationInputService:     config.ConversationInputService,
		conversationNavigatorService: config.ConversationNavigatorService,
		conversationService:          config.ConversationService,
		roleConfigurationService:     config.RoleConfigurationService,
		masterInputService:           config.MasterInputService,
		codexAccountService:          config.CodexAccountService,
		pairingFailureLimiter:        pairingFailureLimiter,
		revocationSweepInterval:      revocationSweepInterval,
		runtimeAuthService:           config.RuntimeAuthService,
		runtimeIdentityService:       config.RuntimeIdentityService,
		runtimeMetadata:              config.RuntimeMetadata,
		speechService:                config.SpeechService,
		workspaceUIService:           config.WorkspaceUIService,
		workspaceService:             config.WorkspaceService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return mux
}
