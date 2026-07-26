package httpapi

import (
	"context"
	"net/http"
	"time"

	"setta/internal/appearance"
	"setta/internal/codexaccount"
	"setta/internal/conversation"
	"setta/internal/credissuer"
	"setta/internal/director"
	"setta/internal/localcredissuer"
	"setta/internal/runtimeauth"
	"setta/internal/runtimecapability"
	"setta/internal/runtimesetup"
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
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

type ConversationService interface {
	CreateTopic(context.Context, string, string) (conversation.ConversationSnapshot, error)
	CreateTopicWithOptionalWorkspace(context.Context, *string, string) (conversation.ConversationSnapshot, error)
	ArchiveTopic(context.Context, string, string) (conversation.ConversationSnapshot, error)
	BindFolderResource(context.Context, string, string) (conversation.ConversationSnapshot, error)
	SendSideConversationTurn(context.Context, string, string, string, string) (conversation.ConversationSnapshot, error)
	DisposeSideConversation(context.Context, string, string, string) (conversation.ConversationSnapshot, error)
	StopTurn(context.Context, string, string) (conversation.ConversationSnapshot, error)
	SubmitApproval(
		context.Context,
		string,
		string,
		conversation.ConversationApprovalResponse,
	) (conversation.ConversationSnapshot, error)
	ReadArtifact(context.Context, *string, string, string) (conversation.Artifact, error)
	ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error)
	ReadSnapshotByID(context.Context, string) (conversation.ConversationSnapshot, error)
	SubscribeEvents(
		conversation.ConversationEventCursor,
		string,
		string,
	) (conversation.ConversationEventSubscription, error)
	SubscribeEventsByID(
		conversation.ConversationEventCursor,
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

// DirectorService is the Director command center boundary. It is deliberately
// the whole app-scoped surface: dispatch one intent, read one bounded snapshot,
// and subscribe from that snapshot's cursor. Nothing here names a pane, a
// conversation, a provider, or an execution target.
type DirectorService interface {
	Dispatch(context.Context, director.DirectorIntent) (director.DirectorReceipt, error)
	Snapshot() (director.DirectorSnapshot, error)
	Subscribe(director.DirectorEventCursor) (director.DirectorEventSubscription, error)
}

type SpeechService interface {
	ReadCapabilities(context.Context) (speech.SpeechCapabilities, error)
	ReadDirectorVoiceSelection(context.Context) (speech.DirectorVoiceSelection, error)
	ReadNarratorVoiceDefault(context.Context) (speech.NarratorVoiceDefault, error)
	UpdateDirectorVoiceSelection(
		context.Context,
		speech.VoiceSelectionRequest,
	) (speech.DirectorVoiceSelection, error)
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
	ResolveSynthesisInput(context.Context, speech.SpeechSynthesisRequest) (speech.SpeechSynthesisInput, error)
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

type RuntimeAccessService interface {
	VerifyRuntimeAccessCredential(context.Context, string) (credissuer.VerifiedCredential, bool, error)
	RevalidateRuntimeAccessCredential(context.Context, credissuer.VerifiedCredential) (bool, error)
}

// LocalCredentialIssuerService is available only when a local development
// runtime explicitly opts into hosting the bounded proof-of-concept issuer.
// Cloud runtimes must use the control-plane issuer and leave this service nil.
type LocalCredentialIssuerService interface {
	Enroll(context.Context, localcredissuer.EnrollRequest, int) (localcredissuer.EnrollResponse, error)
	Refresh(context.Context, localcredissuer.RefreshRequest) (localcredissuer.RuntimeCredentialResponse, error)
	ListDeviceSessions(context.Context) ([]runtimeauth.DeviceSession, error)
	RevokeDeviceSession(context.Context, string) (runtimeauth.DeviceSession, bool, error)
}

type RuntimeIdentity struct {
	ID          string
	DisplayName string
}

type RuntimeIdentityService interface {
	RuntimeIdentity(context.Context) (RuntimeIdentity, error)
	UpdateRuntimeDisplayName(context.Context, string) (RuntimeIdentity, error)
}

type RuntimeSetupService interface {
	CreateAttestation(context.Context, runtimesetup.AttestationChallenge) (runtimesetup.Attestation, runtimesetup.AttestationStatus, error)
}

type RuntimeDiagnosticsService interface {
	RuntimeDiagnostics(context.Context) runtimecapability.RuntimeDiagnostics
}

type HandlerConfig struct {
	AppearanceService            AppearanceService
	Metadata                     BackendMetadata
	ConversationNavigatorService ConversationNavigatorService
	ConversationService          ConversationService
	DirectorService              DirectorService
	RoleConfigurationService     RoleConfigurationService
	CodexAccountService          CodexAccountService
	PairingFailureLimiter        *PairingFailureLimiter
	SetupAttestationLimiter      *PairingFailureLimiter
	RevocationSweepInterval      time.Duration
	LocalCredentialIssuer        LocalCredentialIssuerService
	RuntimeAccessService         RuntimeAccessService
	RuntimeEndpointAccess        RuntimeEndpointAccessConfig
	RuntimeAuthService           RuntimeAuthService
	RuntimeDiagnosticsService    RuntimeDiagnosticsService
	RuntimeIdentityService       RuntimeIdentityService
	RuntimeMetadata              RuntimeMetadata
	RuntimeSetupService          RuntimeSetupService
	SpeechService                SpeechService
	WorkspaceService             WorkspaceService
}

type handler struct {
	appearanceService            AppearanceService
	metadata                     BackendMetadata
	conversationNavigatorService ConversationNavigatorService
	conversationService          ConversationService
	directorService              DirectorService
	roleConfigurationService     RoleConfigurationService
	codexAccountService          CodexAccountService
	pairingFailureLimiter        *PairingFailureLimiter
	setupAttestationLimiter      *PairingFailureLimiter
	revocationSweepInterval      time.Duration
	localCredentialIssuer        LocalCredentialIssuerService
	runtimeAccessService         RuntimeAccessService
	runtimeEndpointAccess        RuntimeEndpointAccessPolicy
	runtimeAuthService           RuntimeAuthService
	runtimeDiagnosticsService    RuntimeDiagnosticsService
	runtimeIdentityService       RuntimeIdentityService
	runtimeMetadata              RuntimeMetadata
	runtimeSetupService          RuntimeSetupService
	speechService                SpeechService
	workspaceService             WorkspaceService
}

func NewHandler(config HandlerConfig) http.Handler {
	handler, err := NewHandlerWithError(config)
	if err != nil {
		panic(err)
	}
	return handler
}

func NewHandlerWithError(config HandlerConfig) (http.Handler, error) {
	pairingFailureLimiter := config.PairingFailureLimiter
	if pairingFailureLimiter == nil {
		pairingFailureLimiter = NewPairingFailureLimiter(10, time.Minute)
	}
	setupAttestationLimiter := config.SetupAttestationLimiter
	if setupAttestationLimiter == nil {
		setupAttestationLimiter = NewPairingFailureLimiter(30, time.Minute)
	}
	revocationSweepInterval := config.RevocationSweepInterval
	if revocationSweepInterval <= 0 {
		revocationSweepInterval = 30 * time.Second
	}
	runtimeEndpointAccess, err := NewRuntimeEndpointAccessPolicy(config.RuntimeEndpointAccess)
	if err != nil {
		return nil, err
	}
	apiHandler := handler{
		appearanceService:            config.AppearanceService,
		metadata:                     config.Metadata,
		conversationNavigatorService: config.ConversationNavigatorService,
		conversationService:          config.ConversationService,
		directorService:              config.DirectorService,
		roleConfigurationService:     config.RoleConfigurationService,
		codexAccountService:          config.CodexAccountService,
		pairingFailureLimiter:        pairingFailureLimiter,
		setupAttestationLimiter:      setupAttestationLimiter,
		revocationSweepInterval:      revocationSweepInterval,
		localCredentialIssuer:        config.LocalCredentialIssuer,
		runtimeAccessService:         config.RuntimeAccessService,
		runtimeEndpointAccess:        runtimeEndpointAccess,
		runtimeAuthService:           config.RuntimeAuthService,
		runtimeDiagnosticsService:    config.RuntimeDiagnosticsService,
		runtimeIdentityService:       config.RuntimeIdentityService,
		runtimeMetadata:              config.RuntimeMetadata,
		runtimeSetupService:          config.RuntimeSetupService,
		speechService:                config.SpeechService,
		workspaceService:             config.WorkspaceService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return runtimeEndpointAccess.Wrap(mux), nil
}
