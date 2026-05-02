package managedchat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/chatmodes"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

const (
	RunTypeManagedChat  = "llm_chat"
	runTypeExternalChat = "external_agent"
	runTypeScriptable   = "scriptable_chat"

	stopChatWaitTimeout = 2 * time.Second

	requiredErrorCheckPrompt = "## Required completion gate for create/scaffold work\n" +
		"- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n" +
		"- Report check outcomes explicitly as pass/fail before any completion claim.\n" +
		"- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)

var (
	ErrRunStoreRequired                         = errors.New("managed chat run store is required")
	ErrEngineStoreRequired                      = errors.New("managed chat engine store is required")
	ErrLLMRuntimeRequired                       = errors.New("managed chat llm runtime is required")
	ErrProjectStateRequired                     = errors.New("managed chat project state is required")
	ErrProfileStoreRequired                     = errors.New("managed chat profile store is required")
	ErrStarterRequired                          = errors.New("managed chat runtime is required")
	ErrStopperRequired                          = errors.New("managed chat stop runtime is required")
	ErrChatNotFound                             = errors.New("managed chat not found")
	ErrProjectConfigIDRequired                  = errors.New("projectConfigId is required")
	ErrMessageRequired                          = errors.New("message is required")
	ErrPermissionModeRequired                   = errors.New("permissionMode is required")
	ErrPermissionModeInvalid                    = errors.New("permissionMode is invalid")
	ErrSectionIDRequired                        = errors.New("sectionId is required unless allowUnscoped is true.")
	ErrAllowUnscopedRequiresSectionOmitted      = errors.New("allowUnscoped requires sectionId to be omitted.")
	ErrBranchFieldsRequired                     = errors.New("Branch edits require branchParentChatId and branchFromMessageId.")
	ErrContinueFromChatWithBranchEdits          = errors.New("continueFromChatId cannot be used with branch edits.")
	ErrContinueFromChatRequiresChatIDOmitted    = errors.New("continueFromChatId requires chatId to be omitted.")
	ErrFrontendAffinityTokenInvalid             = errors.New("frontendAffinityToken must not be blank")
	ErrAppGenerationModeInvalid                 = chatmodes.ErrAppGenerationModeInvalid
	ErrAppGenerationReferenceImageURLTooLarge   = chatmodes.ErrAppGenerationReferenceImageURLTooLarge
	ErrAppGenerationReferenceImageNotesTooLarge = chatmodes.ErrAppGenerationReferenceImageNotesTooLarge
	ErrAppGenerationImageAttachmentRequired     = chatmodes.ErrAppGenerationImageAttachmentRequired
	ErrChatEngineMismatch                       = errors.New("Chat engine mismatch; start a new chat.")
	ErrChatProjectConfigMismatch                = errors.New("Chat project config mismatch; start a new chat.")
	ErrContinueFromChatSourceNotFound           = errors.New("continuation source chat not found")
)

type ChatPermissionMode = projectstate.ChatPermissionMode

type LiveChatStateProvider interface {
	GetLiveChatState(runID string) (*ChatState, error)
}

type aiFollowSnapshotProvider interface {
	AIFollowSnapshot(projectConfigID string) []realtime.AIFollowToolArgumentsUpdateContent
}

type ChatStarter interface {
	Disabled() bool
	StartRun(profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error)
}

type RunStopper interface {
	StopRun(runID string) (agentruns.Run, error)
}

type runWaiter interface {
	WaitForRun(ctx context.Context, runID string) (agentruns.Run, error)
}

type ServiceOptions struct {
	ProjectState       *projectstate.Runtime
	Runs               *agentruns.RunStore
	Engines            *agentruns.EngineStore
	LLM                *llmconfig.Runtime
	Profiles           *agentprofiles.Store
	Starter            ChatStarter
	Live               LiveChatStateProvider
	Stopper            RunStopper
	AppGenerationModes chatmodes.AppGenerationModeResolver
	TimeNow            func() time.Time
}

type Service struct {
	projectState       *projectstate.Runtime
	runs               *agentruns.RunStore
	engines            *agentruns.EngineStore
	llm                *llmconfig.Runtime
	profiles           *agentprofiles.Store
	starter            ChatStarter
	live               LiveChatStateProvider
	stopper            RunStopper
	appGenerationModes chatmodes.AppGenerationModeResolver
	timeNow            func() time.Time
}

type ChatState struct {
	Messages           []map[string]any  `json:"messages"`
	ToolCallArguments  map[string]string `json:"toolCallArguments"`
	WaitingForResponse bool              `json:"waitingForResponse"`
}

type ChatContextUsage struct {
	ContextWindowTokens *int `json:"contextWindowTokens"`
	ContextUsedTokens   *int `json:"contextUsedTokens"`
	Estimated           bool `json:"estimated"`
}

type HydratedChat struct {
	Messages                 []map[string]any  `json:"messages"`
	ToolCallArguments        map[string]string `json:"toolCallArguments"`
	WaitingForResponse       bool              `json:"waitingForResponse"`
	LLMConfig                *llmconfig.Config `json:"llmConfig"`
	ContextUsage             *ChatContextUsage `json:"contextUsage"`
	AppGenerationByMessageID map[string]string `json:"appGenerationByMessageId"`
}

type StartChatRequest struct {
	ChatID                           *string
	ContinueFromChatID               *string
	Message                          map[string]any
	EngineConfigID                   string
	AgentProfileID                   *string
	Thinking                         bool
	ProjectConfigID                  string
	SectionID                        *string
	FrontendAffinityToken            *string
	AllowUnscoped                    bool
	BranchParentChatID               *string
	BranchFromMessageID              *string
	PermissionMode                   ChatPermissionMode
	SearchEnabled                    bool
	AppSpecStreamingEnabled          bool
	AppGenerationMode                *string
	AppGenerationReferenceImageURL   *string
	AppGenerationReferenceImageNotes *string
	AdditionalInputs                 map[string]any
}

type StartChatResult struct {
	ChatID string
	Run    agentruns.Run
}

type StopResult struct {
	AlreadyStopped   bool    `json:"alreadyStopped"`
	StoppedRunID     *string `json:"stoppedRunId"`
	StoppedMessageID *string `json:"stoppedMessageId"`
}

type ContinueFromChatSourceNotFoundError struct {
	ChatID string
}

func (e *ContinueFromChatSourceNotFoundError) Error() string {
	if e == nil {
		return "Continuation source chat not found."
	}
	return fmt.Sprintf("Continuation source chat %s not found.", e.ChatID)
}

func (e *ContinueFromChatSourceNotFoundError) Unwrap() error {
	return ErrContinueFromChatSourceNotFound
}

type BranchMessageNotFoundError struct {
	MessageID string
}

func (e *BranchMessageNotFoundError) Error() string {
	if e == nil {
		return "Message not found in chat history"
	}
	return fmt.Sprintf("Message %s not found in chat history", e.MessageID)
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	if options.Engines == nil {
		return nil, ErrEngineStoreRequired
	}
	if options.LLM == nil {
		return nil, ErrLLMRuntimeRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Service{
		projectState:       options.ProjectState,
		runs:               options.Runs,
		engines:            options.Engines,
		llm:                options.LLM,
		profiles:           options.Profiles,
		starter:            options.Starter,
		live:               options.Live,
		stopper:            options.Stopper,
		appGenerationModes: options.AppGenerationModes,
		timeNow:            timeNow,
	}, nil
}

func (s *Service) Disabled() bool {
	return s == nil || s.starter == nil || s.starter.Disabled()
}

func (s *Service) AIFollowSnapshot(projectConfigID string) []realtime.AIFollowToolArgumentsUpdateContent {
	if s == nil || s.live == nil {
		return []realtime.AIFollowToolArgumentsUpdateContent{}
	}
	provider, ok := s.live.(aiFollowSnapshotProvider)
	if !ok {
		return []realtime.AIFollowToolArgumentsUpdateContent{}
	}
	return provider.AIFollowSnapshot(projectConfigID)
}

func (s *Service) StartChat(request StartChatRequest) (StartChatResult, error) {
	return s.startChat(request)
}

func (s *Service) GetChat(chatID string, projectConfigID *string) (HydratedChat, error) {
	latestRun, err := s.loadHydratedChatRun(chatID, projectConfigID)
	if err != nil {
		return HydratedChat{}, err
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return HydratedChat{}, err
	}
	state, err = s.resolveHydratedChatState(latestRun, state)
	if err != nil {
		return HydratedChat{}, err
	}
	return s.hydrateChat(latestRun, state)
}

func (s *Service) loadHydratedChatRun(chatID string, projectConfigID *string) (agentruns.Run, error) {
	if s == nil || s.runs == nil {
		return agentruns.Run{}, ErrRunStoreRequired
	}
	filter, err := buildManagedChatRunFilter(chatID, projectConfigID)
	if err != nil {
		return agentruns.Run{}, err
	}
	runs, err := s.runs.ListByMetadata(filter)
	if err != nil {
		return agentruns.Run{}, err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return agentruns.Run{}, ErrChatNotFound
	}
	return latestRun, nil
}

func buildManagedChatRunFilter(chatID string, projectConfigID *string) (agentruns.RunFilter, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return agentruns.RunFilter{}, fmt.Errorf("chat id is required")
	}
	filter := agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &trimmedChatID,
	}
	if trimmedProjectID := derefOptionalString(projectConfigID); trimmedProjectID != "" {
		filter.ProjectConfigID = &trimmedProjectID
	}
	return filter, nil
}

func (s *Service) resolveHydratedChatState(latestRun agentruns.Run, state *ChatState) (*ChatState, error) {
	if latestRun.Status != agentruns.RunStatusRunning || s.live == nil {
		return state, nil
	}
	liveState, err := s.live.GetLiveChatState(latestRun.ID)
	if err != nil {
		return nil, err
	}
	if liveState == nil {
		return state, nil
	}
	return liveState.Clone(), nil
}

func (s *Service) hydrateChat(latestRun agentruns.Run, state *ChatState) (HydratedChat, error) {
	resolvedLLMConfig, err := s.resolveLLMConfig(latestRun)
	if err != nil {
		return HydratedChat{}, err
	}
	return HydratedChat{
		Messages:                 cloneMessageSlice(state.Messages),
		ToolCallArguments:        cloneStringMap(state.ToolCallArguments),
		WaitingForResponse:       state.WaitingForResponse,
		LLMConfig:                resolvedLLMConfig,
		ContextUsage:             resolveContextUsage(latestRun),
		AppGenerationByMessageID: agentruns.ExtractAppGenerationByMessageID(latestRun.Inputs),
	}, nil
}

func (s *Service) StopChat(chatID string) (StopResult, error) {
	return s.stopChat(chatID)
}

func (s *Service) resolveManagedProfile(agentProfileID *string, engineConfigID string) (agentprofiles.Profile, error) {
	if agentProfileID != nil && strings.TrimSpace(*agentProfileID) != "" {
		if s.profiles == nil {
			return agentprofiles.Profile{}, ErrProfileStoreRequired
		}
		profile, err := s.profiles.Get(strings.TrimSpace(*agentProfileID))
		if err != nil {
			return agentprofiles.Profile{}, err
		}
		profile.EngineConfigID = stringPtr(engineConfigID)
		return profile, nil
	}
	return agentprofiles.Profile{
		Name:           "Managed chat",
		Description:    "",
		SystemPrompt:   "",
		EngineConfigID: stringPtr(engineConfigID),
	}, nil
}

func (s *Service) ensureManagedChatIDCompatible(chatID string, projectConfigID string) ([]agentruns.Run, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return []agentruns.Run{}, nil
	}
	externalRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(runTypeExternalChat),
		ChatID:  stringPtr(trimmedChatID),
	})
	if err != nil {
		return nil, err
	}
	if len(externalRuns) > 0 {
		return nil, ErrChatEngineMismatch
	}
	scriptableRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(runTypeScriptable),
		ChatID:  stringPtr(trimmedChatID),
	})
	if err != nil {
		return nil, err
	}
	if len(scriptableRuns) > 0 {
		return nil, ErrChatEngineMismatch
	}
	managedRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  stringPtr(trimmedChatID),
	})
	if err != nil {
		return nil, err
	}
	for _, run := range managedRuns {
		existingProjectConfigID := resolveRunInputString(run, "projectConfigId")
		if existingProjectConfigID != "" && existingProjectConfigID != projectConfigID {
			return nil, ErrChatProjectConfigMismatch
		}
	}
	return managedRuns, nil
}

func (s *Service) getPriorMessagesForManagedChat(chatID string, projectConfigID string, prefetched []agentruns.Run) ([]map[string]any, error) {
	runs := prefetched
	if runs == nil {
		filter := agentruns.RunFilter{
			RunType:         stringPtr(RunTypeManagedChat),
			ChatID:          stringPtr(chatID),
			ProjectConfigID: stringPtr(projectConfigID),
		}
		var err error
		runs, err = s.runs.ListByMetadata(filter)
		if err != nil {
			return nil, err
		}
	}
	latestRun, ok := selectLatestRun(filterRunsByProjectConfigID(runs, projectConfigID))
	if !ok {
		return []map[string]any{}, nil
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *Service) getPriorMessagesForSeedChat(chatID string, projectConfigID string) ([]map[string]any, error) {
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return nil, &ContinueFromChatSourceNotFoundError{ChatID: chatID}
	}
	if resolveRunInputString(latestRun, "runType") == runTypeScriptable {
		return nil, ErrChatEngineMismatch
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *Service) getLatestRunForManagedChat(chatID string, projectConfigID string, prefetched []agentruns.Run) (*agentruns.Run, error) {
	runs := prefetched
	if runs == nil {
		var err error
		runs, err = s.runs.ListByMetadata(agentruns.RunFilter{
			RunType:         stringPtr(RunTypeManagedChat),
			ChatID:          stringPtr(chatID),
			ProjectConfigID: stringPtr(projectConfigID),
		})
		if err != nil {
			return nil, err
		}
	}
	run, ok := selectLatestRun(filterRunsByProjectConfigID(runs, projectConfigID))
	if !ok {
		return nil, nil
	}
	return &run, nil
}

func (s *Service) resolveLLMConfig(run agentruns.Run) (*llmconfig.Config, error) {
	engineConfigID := resolveRunInputString(run, "engineConfigId")
	if engineConfigID == "" {
		return nil, nil
	}
	engineConfig, err := s.engines.Get(engineConfigID)
	if err != nil {
		if errors.Is(err, agentruns.ErrEngineConfigNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if engineConfig.EngineType != agentruns.EngineTypeSettaLLM {
		return nil, nil
	}
	if engineConfig.SettaLLMConfigID == nil || strings.TrimSpace(*engineConfig.SettaLLMConfigID) == "" {
		return nil, nil
	}
	configs := s.llm.Configs()
	resolved, err := configs.ResolveConfig(strings.TrimSpace(*engineConfig.SettaLLMConfigID))
	if err != nil {
		return nil, nil
	}
	return &resolved, nil
}
