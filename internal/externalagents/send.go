package externalagents

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/chatattachments"
	"setta/internal/chatmodes"
	"setta/internal/externalagentconfigs"
	"setta/internal/projectstate"
)

const (
	RunTypeManagedChat = "llm_chat"

	requiredErrorCheckPrompt = "## Required completion gate for create/scaffold work\n" +
		"- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n" +
		"- Report check outcomes explicitly as pass/fail before any completion claim.\n" +
		"- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)

var (
	ErrSendProjectStateRequired              = errors.New("external agent send project state is required")
	ErrSendEngineStoreRequired               = errors.New("external agent send engine store is required")
	ErrSendRunStoreRequired                  = errors.New("external agent send run store is required")
	ErrSendConfigStoreRequired               = errors.New("external agent send config store is required")
	ErrSendRuntimeRequired                   = errors.New("external agent send runtime is required")
	ErrSendPreflightCheckerRequired          = errors.New("external agent send preflight checker is required")
	ErrSendAttachmentsRequired               = errors.New("external agent send attachments service is required")
	ErrExecutorUnavailable                   = errors.New("external agent executor is not available")
	ErrExternalAgentEngineRequired           = errors.New("engine config must be external_agent")
	ErrExternalAgentConfigIDRequired         = errors.New("external agent engine config missing external agent config id")
	ErrProjectConfigIDRequired               = errors.New("projectConfigId is required")
	ErrMessageRequired                       = errors.New("message is required")
	ErrPermissionModeRequired                = errors.New("permissionMode is required")
	ErrPermissionModeInvalid                 = errors.New("permissionMode is invalid")
	ErrSectionIDRequired                     = errors.New("sectionId is required unless allowUnscoped is true.")
	ErrAllowUnscopedRequiresSectionOmitted   = errors.New("allowUnscoped requires sectionId to be omitted.")
	ErrBranchFieldsRequired                  = errors.New("Branch edits require branchParentChatId and branchFromMessageId.")
	ErrContinueFromChatWithBranchEdits       = errors.New("continueFromChatId cannot be used with branch edits.")
	ErrContinueFromChatRequiresChatIDOmitted = errors.New("continueFromChatId requires chatId to be omitted.")
	ErrChatEngineMismatch                    = errors.New("Chat engine mismatch; start a new chat.")
	ErrChatProjectConfigMismatch             = errors.New("Chat project config mismatch; start a new chat.")
	ErrContinueFromChatSourceNotFound        = errors.New("continuation source chat not found")
	ErrFrontendAffinityTokenInvalid          = errors.New("frontendAffinityToken must not be blank")
	ErrAppGenerationImageAttachmentRequired  = chatmodes.ErrAppGenerationImageAttachmentRequired
)

type ChatPermissionMode = projectstate.ChatPermissionMode

type Executor interface {
	Start(context.Context, StartRequest) (StartResponse, error)
}

type StartRequest struct {
	Run             agentruns.Run
	EngineConfig    agentruns.EngineConfig
	ExternalConfig  externalagentconfigs.Config
	Profile         *agentprofiles.Profile
	ProjectConfigID string
	ChatID          string
	SectionID       *string
	Inputs          map[string]any
}

type StartResponse struct {
	Controller RunController
}

type SendServiceOptions struct {
	ProjectState       *projectstate.Runtime
	Engines            *agentruns.EngineStore
	Runs               *agentruns.RunStore
	Profiles           *agentprofiles.Store
	Configs            *externalagentconfigs.Store
	Runtime            *Runtime
	Preflight          externalagentconfigs.Checker
	Attachments        *chatattachments.Service
	Executor           Executor
	SettaFilesRoot     string
	AppGenerationModes chatmodes.AppGenerationModeResolver
	TimeNow            func() time.Time
}

type SendService struct {
	projectState       *projectstate.Runtime
	engines            *agentruns.EngineStore
	runs               *agentruns.RunStore
	profiles           *agentprofiles.Store
	configs            *externalagentconfigs.Store
	runtime            *Runtime
	preflight          externalagentconfigs.Checker
	attachments        *chatattachments.Service
	executor           Executor
	settaFilesRoot     string
	appGenerationModes chatmodes.AppGenerationModeResolver
	timeNow            func() time.Time
}

type runtimeReadyController interface {
	RunController
	markRuntimeReady()
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

type PreflightUnavailableError struct {
	Status externalagentconfigs.Status
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

func (e *PreflightUnavailableError) Error() string {
	if e == nil {
		return "external agent config is not available"
	}
	if len(e.Status.Issues) == 0 {
		return "External agent config is not available: preflight failed"
	}
	return fmt.Sprintf("External agent config is not available: %s", strings.Join(e.Status.Issues, "; "))
}

func NewSendService(options SendServiceOptions) (*SendService, error) {
	if options.ProjectState == nil {
		return nil, ErrSendProjectStateRequired
	}
	if options.Engines == nil {
		return nil, ErrSendEngineStoreRequired
	}
	if options.Runs == nil {
		return nil, ErrSendRunStoreRequired
	}
	if options.Configs == nil {
		return nil, ErrSendConfigStoreRequired
	}
	if options.Runtime == nil {
		return nil, ErrSendRuntimeRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &SendService{
		projectState:       options.ProjectState,
		engines:            options.Engines,
		runs:               options.Runs,
		profiles:           options.Profiles,
		configs:            options.Configs,
		runtime:            options.Runtime,
		preflight:          options.Preflight,
		attachments:        options.Attachments,
		executor:           options.Executor,
		settaFilesRoot:     strings.TrimSpace(options.SettaFilesRoot),
		appGenerationModes: options.AppGenerationModes,
		timeNow:            timeNow,
	}, nil
}

func (s *SendService) Disabled() bool {
	return s == nil || s.executor == nil
}

type normalizedStartChatRequest struct {
	Message                 map[string]any
	ChatID                  *string
	ContinueFromChatID      *string
	EngineConfigID          string
	AgentProfileID          *string
	Thinking                bool
	ProjectConfigID         string
	SectionID               *string
	FrontendAffinityToken   *string
	AllowUnscoped           bool
	BranchParentChatID      *string
	BranchFromMessageID     *string
	IsBranchRequest         bool
	PermissionMode          ChatPermissionMode
	SearchEnabled           bool
	AppGenerationMode       *string
	AppGenerationModePrompt string
	AdditionalInputs        map[string]any
	CompletionGuardEnabled  bool
}

type startChatConversation struct {
	ChatID                 string
	PrefetchedExternalRuns []agentruns.Run
	PriorMessages          []map[string]any
	ParentRun              *agentruns.Run
}

type resolvedStartChatEngine struct {
	EngineConfig   agentruns.EngineConfig
	ExternalConfig externalagentconfigs.Config
}

type preparedStartChatRun struct {
	ChatID         string
	Profile        *agentprofiles.Profile
	ProfileID      *string
	Inputs         map[string]any
	EngineConfig   agentruns.EngineConfig
	ExternalConfig externalagentconfigs.Config
}
