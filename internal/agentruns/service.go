package agentruns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

var (
	ErrProjectStateRequired        = errors.New("agent runs project state is required")
	ErrEngineStoreRequired         = errors.New("agent runs engine store is required")
	ErrRunStoreRequired            = errors.New("agent runs store is required")
	ErrLLMRuntimeRequired          = errors.New("agent runs llm runtime is required")
	ErrManagedExecutorUnavailable  = errors.New("managed agent executor is not available")
	ErrProfileEngineConfigRequired = errors.New("agent profile missing engine config id")
	ErrManagedLLMEngineRequired    = errors.New("managed agent runs require a Setta LLM engine config")
	ErrInvalidRunInput             = errors.New("invalid agent run input")
)

type TemporaryIDs interface {
	EnsureTemporaryID(canonicalID string) (string, error)
	Snapshot() (map[string]string, error)
}

type Executor interface {
	Execute(context.Context, ExecutionRequest) (ExecutionResult, error)
}

type RequestValidator interface {
	Validate(ExecutionRequest) error
}

type CompletionGuardProvider func() (bool, error)

type assistantFailureMessageError interface {
	AssistantFailureMessage() string
}

type ExecutionRequest struct {
	Profile                agentprofiles.Profile
	Run                    Run
	EngineConfig           EngineConfig
	LLMConfig              llmconfig.Config
	MCPServerIDs           []string
	CompletionGuardEnabled bool
	RequestParams          map[string]any
	APIKeys                map[string]string
	SystemPrompt           string
	ProjectConfigID        string
	ChatID                 string
	SectionID              *string
	TemporaryIDs           TemporaryIDs
	Thinking               bool
	Inputs                 map[string]any
}

type ExecutionResult struct {
	Outputs   map[string]any
	ToolCalls []map[string]any
	Cost      *float64
}

type ServiceOptions struct {
	ProjectState            *projectstate.Runtime
	Engines                 *EngineStore
	Runs                    *RunStore
	LLM                     *llmconfig.Runtime
	Executor                Executor
	TemporaryIDs            TemporaryIDs
	BasePrompt              string
	CompletionGuardEnabled  bool
	CompletionGuardProvider CompletionGuardProvider
	TimeNow                 func() time.Time
}

type Service struct {
	projectState            *projectstate.Runtime
	engines                 *EngineStore
	runs                    *RunStore
	llm                     *llmconfig.Runtime
	executor                Executor
	temporaryIDs            TemporaryIDs
	basePrompt              string
	completionGuardEnabled  bool
	completionGuardProvider CompletionGuardProvider
	timeNow                 func() time.Time
	runStateMu              sync.Mutex
}

type ResolvedEngine struct {
	EngineConfig EngineConfig
	LLMConfig    llmconfig.Config
}

type runContext struct {
	run                    Run
	profile                agentprofiles.Profile
	engine                 ResolvedEngine
	projectConfigID        string
	chatID                 string
	sectionID              *string
	thinking               bool
	completionGuardEnabled bool
	systemPrompt           string
	inputs                 map[string]any
	request                *ExecutionRequest
}

type parsedRunInputs struct {
	projectConfigID string
	chatID          string
	sectionID       *string
	allowUnscoped   bool
	thinking        bool
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	if options.Engines == nil {
		return nil, ErrEngineStoreRequired
	}
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
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
		projectState:            options.ProjectState,
		engines:                 options.Engines,
		runs:                    options.Runs,
		llm:                     options.LLM,
		executor:                options.Executor,
		temporaryIDs:            options.TemporaryIDs,
		basePrompt:              strings.TrimSpace(options.BasePrompt),
		completionGuardEnabled:  options.CompletionGuardEnabled,
		completionGuardProvider: options.CompletionGuardProvider,
		timeNow:                 timeNow,
	}, nil
}

func (s *Service) Disabled() bool {
	return s == nil || s.executor == nil
}

func (s *Service) RunSubAgent(ctx context.Context, profile agentprofiles.Profile, inputs map[string]any) (Run, error) {
	prepared, err := s.prepareRun(profile, inputs)
	if err != nil {
		return Run{}, err
	}
	return s.executeRun(ctx, prepared)
}

func (s *Service) prepareRun(profile agentprofiles.Profile, inputs map[string]any) (runContext, error) {
	if err := s.requireExecutor(); err != nil {
		return runContext{}, err
	}
	prepared, err := s.buildContext(profile, inputs)
	if err != nil {
		return runContext{}, err
	}
	if validator, ok := s.executor.(RequestValidator); ok {
		request, err := s.buildExecutionRequest(prepared)
		if err != nil {
			return runContext{}, err
		}
		if err := validator.Validate(request); err != nil {
			return runContext{}, err
		}
		prepared.request = &request
	}

	if err := s.runs.Save(prepared.run); err != nil {
		return runContext{}, err
	}
	if err := s.recordEvent(&prepared.run, "run_started", map[string]any{
		"profileId":       profile.ID,
		"engineConfigId":  prepared.engine.EngineConfig.ID,
		"projectConfigId": prepared.projectConfigID,
		"chatId":          prepared.chatID,
		"sectionId":       derefString(prepared.sectionID),
	}); err != nil {
		return runContext{}, err
	}
	if err := s.recordSnapshot(&prepared.run, prepared.projectConfigID); err != nil {
		return runContext{}, err
	}
	return prepared, nil
}

func (s *Service) executeRun(ctx context.Context, runContext runContext) (Run, error) {
	if err := s.requireExecutor(); err != nil {
		return Run{}, err
	}

	request, err := s.executionRequest(runContext)
	if err != nil {
		return s.failRun(runContext, err)
	}
	result, execErr := s.executor.Execute(ctx, request)

	s.runStateMu.Lock()
	defer s.runStateMu.Unlock()

	s.reloadPersistedRun(&runContext)
	if executionWasCancelled(ctx, execErr, runContext.run.Status) {
		return s.persistCancelledRunLocked(runContext, result)
	}
	if execErr != nil {
		return s.failRunLocked(runContext, execErr)
	}
	return s.completeRunLocked(runContext, result)
}

func (s *Service) requireExecutor() error {
	if s == nil || s.executor == nil {
		return ErrManagedExecutorUnavailable
	}
	return nil
}

func (s *Service) executionRequest(runContext runContext) (ExecutionRequest, error) {
	if runContext.request != nil {
		return cloneExecutionRequest(*runContext.request), nil
	}
	return s.buildExecutionRequest(runContext)
}

func (s *Service) reloadPersistedRun(runContext *runContext) {
	if s == nil || runContext == nil {
		return
	}
	persistedRun, err := s.runs.Load(runContext.run.ID)
	if err == nil {
		runContext.run = persistedRun
	}
}

func executionWasCancelled(ctx context.Context, execErr error, status RunStatus) bool {
	return ctx.Err() != nil || errors.Is(execErr, context.Canceled) || status == RunStatusCancelled
}

func (s *Service) persistCancelledRunLocked(runContext runContext, result ExecutionResult) (Run, error) {
	if err := s.persistExecutionResult(&runContext.run, runContext, result); err != nil {
		return Run{}, err
	}
	return s.cancelRunLocked(runContext.run.ID)
}

func (s *Service) completeRunLocked(runContext runContext, result ExecutionResult) (Run, error) {
	runContext.run.ToolCalls = cloneToolCalls(result.ToolCalls)
	runContext.run.Cost = cloneFloat64Ptr(result.Cost)
	runContext.run.Outputs = buildOutputs(result.Outputs, s.buildRunMetadata(runContext), result.Cost)
	runContext.run.Status = RunStatusCompleted
	finishedAt := s.timeNow().UTC()
	runContext.run.FinishedAt = &finishedAt
	if err := s.runs.Save(runContext.run); err != nil {
		return Run{}, err
	}
	if err := s.recordEvent(&runContext.run, "run_completed", map[string]any{}); err != nil {
		return Run{}, err
	}
	return s.runs.Load(runContext.run.ID)
}

func cloneExecutionRequest(request ExecutionRequest) ExecutionRequest {
	return ExecutionRequest{
		Profile:                request.Profile,
		Run:                    request.Run.Clone(),
		EngineConfig:           request.EngineConfig,
		LLMConfig:              request.LLMConfig,
		MCPServerIDs:           cloneStringSlice(request.MCPServerIDs),
		CompletionGuardEnabled: request.CompletionGuardEnabled,
		RequestParams:          cloneAnyMap(request.RequestParams),
		APIKeys:                cloneStringMap(request.APIKeys),
		SystemPrompt:           request.SystemPrompt,
		ProjectConfigID:        request.ProjectConfigID,
		ChatID:                 request.ChatID,
		SectionID:              cloneStringPtr(request.SectionID),
		TemporaryIDs:           request.TemporaryIDs,
		Thinking:               request.Thinking,
		Inputs:                 cloneAnyMap(request.Inputs),
	}
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return nil
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func (s *Service) buildExecutionRequest(runContext runContext) (ExecutionRequest, error) {
	requestParams, apiKeyEnv := s.llm.Configs().BuildRequestParams(runContext.engine.LLMConfig)
	apiKeys := s.llm.APIKeys()
	if apiKeyEnv != "" {
		apiKeys = llmconfig.FilterEnvVarsForConfig(apiKeys, llmconfig.AllConfigs{
			Configs: map[string]llmconfig.Config{
				runContext.engine.LLMConfig.ID: runContext.engine.LLMConfig,
			},
			MCPServers: map[string]llmconfig.ServerConfig{},
		})
	}
	mcpServerIDs, err := s.llm.Configs().ResolveMCPServerIDs(runContext.engine.LLMConfig)
	if err != nil {
		return ExecutionRequest{}, err
	}
	return ExecutionRequest{
		Profile:                runContext.profile,
		Run:                    runContext.run.Clone(),
		EngineConfig:           runContext.engine.EngineConfig,
		LLMConfig:              runContext.engine.LLMConfig,
		MCPServerIDs:           cloneStringSlice(mcpServerIDs),
		CompletionGuardEnabled: runContext.completionGuardEnabled,
		RequestParams:          requestParams,
		APIKeys:                apiKeys,
		SystemPrompt:           runContext.systemPrompt,
		ProjectConfigID:        runContext.projectConfigID,
		ChatID:                 runContext.chatID,
		SectionID:              cloneStringPtr(runContext.sectionID),
		TemporaryIDs:           s.temporaryIDs,
		Thinking:               runContext.thinking,
		Inputs:                 cloneAnyMap(runContext.inputs),
	}, nil
}

func (s *Service) persistExecutionResult(run *Run, context runContext, result ExecutionResult) error {
	if run == nil {
		return nil
	}
	if result.Outputs == nil && len(result.ToolCalls) == 0 && result.Cost == nil {
		return nil
	}
	run.ToolCalls = cloneToolCalls(result.ToolCalls)
	run.Cost = cloneFloat64Ptr(result.Cost)
	run.Outputs = buildOutputs(result.Outputs, s.buildRunMetadata(context), result.Cost)
	return s.runs.Save(*run)
}

func (s *Service) failRun(runContext runContext, cause error) (Run, error) {
	if s == nil {
		return Run{}, ErrManagedExecutorUnavailable
	}
	s.runStateMu.Lock()
	defer s.runStateMu.Unlock()
	return s.failRunLocked(runContext, cause)
}

func (s *Service) failRunLocked(runContext runContext, cause error) (Run, error) {
	runContext.run.Outputs = buildFailureOutputs(runContext.run.ID, assistantFailureMessage(cause), s.buildRunMetadata(runContext))
	runContext.run.Status = RunStatusFailed
	finishedAt := s.timeNow().UTC()
	runContext.run.FinishedAt = &finishedAt
	if err := s.runs.Save(runContext.run); err != nil {
		return Run{}, err
	}
	eventPayload := map[string]any{}
	if cause != nil {
		eventPayload["error"] = cause.Error()
	}
	if err := s.recordEvent(&runContext.run, "run_failed", eventPayload); err != nil {
		return Run{}, err
	}
	return s.runs.Load(runContext.run.ID)
}

func cloneStringSlice(values []string) []string {
	if values == nil {
		return nil
	}
	cloned := make([]string, 0, len(values))
	for _, value := range values {
		cloned = append(cloned, value)
	}
	return cloned
}

func (s *Service) cancelRun(runID string) (Run, error) {
	if s == nil {
		return Run{}, ErrManagedExecutorUnavailable
	}
	s.runStateMu.Lock()
	defer s.runStateMu.Unlock()
	return s.cancelRunLocked(runID)
}

func (s *Service) cancelRunLocked(runID string) (Run, error) {
	run, err := s.runs.Load(runID)
	if err != nil {
		return Run{}, err
	}
	if run.Status == RunStatusCompleted || run.Status == RunStatusFailed || run.Status == RunStatusCancelled {
		return run, nil
	}
	run.Status = RunStatusCancelled
	finishedAt := s.timeNow().UTC()
	run.FinishedAt = &finishedAt
	if err := s.runs.Save(run); err != nil {
		return Run{}, err
	}
	if err := s.recordEvent(&run, "run_cancelled", map[string]any{}); err != nil {
		return Run{}, err
	}
	return s.runs.Load(run.ID)
}

func ResolveManagedEngine(store *EngineStore, configs llmconfig.AllConfigs, engineConfigID string) (ResolvedEngine, error) {
	if store == nil {
		return ResolvedEngine{}, ErrEngineStoreRequired
	}
	engine, err := store.Get(engineConfigID)
	if err != nil {
		return ResolvedEngine{}, err
	}
	if engine.EngineType != EngineTypeSettaLLM {
		return ResolvedEngine{}, ErrManagedLLMEngineRequired
	}
	llmConfig, err := ResolveManagedLLMConfig(engine, configs)
	if err != nil {
		return ResolvedEngine{}, err
	}
	return ResolvedEngine{
		EngineConfig: engine,
		LLMConfig:    llmConfig,
	}, nil
}

func ResolveManagedLLMConfig(engine EngineConfig, configs llmconfig.AllConfigs) (llmconfig.Config, error) {
	if engine.EngineType != EngineTypeSettaLLM {
		return llmconfig.Config{}, ErrManagedLLMEngineRequired
	}
	llmConfigID := ""
	if engine.SettaLLMConfigID != nil {
		llmConfigID = strings.TrimSpace(*engine.SettaLLMConfigID)
	}
	if llmConfigID == "" {
		if trimmedDefault := strings.TrimSpace(configs.DefaultConfigID); trimmedDefault != "" {
			llmConfigID = trimmedDefault
		} else {
			configIDs := make([]string, 0, len(configs.Configs))
			for configID := range configs.Configs {
				configIDs = append(configIDs, configID)
			}
			sort.Strings(configIDs)
			if len(configIDs) == 0 {
				return llmconfig.Config{}, fmt.Errorf("no LLM config available for engine")
			}
			llmConfigID = configIDs[0]
		}
	}
	llmConfig, err := configs.ResolveConfig(llmConfigID)
	if err != nil {
		return llmconfig.Config{}, err
	}
	return llmConfig, nil
}

func invalidRunInputError(message string) error {
	return fmt.Errorf("%w: %s", ErrInvalidRunInput, message)
}

func parseOptionalTrimmedStringInput(inputs map[string]any, fieldName string) (string, bool, error) {
	rawValue, ok := inputs[fieldName]
	if !ok {
		return "", false, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", false, invalidRunInputError(fieldName + " must be a string")
	}
	return strings.TrimSpace(value), true, nil
}

func parseOptionalTrimmedStringPtrInput(inputs map[string]any, fieldName string) (*string, error) {
	value, ok, err := parseOptionalTrimmedStringInput(inputs, fieldName)
	if err != nil || !ok {
		return nil, err
	}
	return &value, nil
}

func parseOptionalBoolInput(inputs map[string]any, fieldName string) (bool, bool, error) {
	rawValue, ok := inputs[fieldName]
	if !ok {
		return false, false, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, false, invalidRunInputError(fieldName + " must be a boolean")
	}
	return value, true, nil
}

type optionalTrimmedStringField struct {
	fieldName string
	target    *string
}

func applyOptionalTrimmedStringFields(inputs map[string]any, fields []optionalTrimmedStringField) error {
	for _, field := range fields {
		value, ok, err := parseOptionalTrimmedStringInput(inputs, field.fieldName)
		if err != nil {
			return err
		}
		if ok {
			*field.target = value
		}
	}
	return nil
}

type optionalBoolField struct {
	fieldName string
	target    *bool
}

func applyOptionalBoolFields(inputs map[string]any, fields []optionalBoolField) error {
	for _, field := range fields {
		value, ok, err := parseOptionalBoolInput(inputs, field.fieldName)
		if err != nil {
			return err
		}
		if ok {
			*field.target = value
		}
	}
	return nil
}

func validateRunPayloadInputs(inputs map[string]any) error {
	if _, _, err := parseOptionalTrimmedStringInput(inputs, "prompt"); err != nil {
		return err
	}
	if rawMessages, ok := inputs["messages"]; ok {
		if _, ok := rawMessages.([]any); !ok {
			return invalidRunInputError("messages must be a list")
		}
	}
	return nil
}

func parseRunInputs(inputs map[string]any, defaultProjectConfigID string) (parsedRunInputs, error) {
	parsed := parsedRunInputs{
		projectConfigID: defaultProjectConfigID,
	}
	if err := applyOptionalTrimmedStringFields(inputs, []optionalTrimmedStringField{
		{fieldName: "projectConfigId", target: &parsed.projectConfigID},
		{fieldName: "chatId", target: &parsed.chatID},
	}); err != nil {
		return parsedRunInputs{}, err
	}
	sectionID, err := parseOptionalTrimmedStringPtrInput(inputs, "sectionId")
	if err != nil {
		return parsedRunInputs{}, err
	}
	parsed.sectionID = sectionID
	if err := applyOptionalBoolFields(inputs, []optionalBoolField{
		{fieldName: "allowUnscoped", target: &parsed.allowUnscoped},
		{fieldName: "thinking", target: &parsed.thinking},
	}); err != nil {
		return parsedRunInputs{}, err
	}
	if err := validateRunPayloadInputs(inputs); err != nil {
		return parsedRunInputs{}, err
	}
	if err := parsed.validateSectionRequirements(); err != nil {
		return parsedRunInputs{}, err
	}
	return parsed, nil
}

func (parsed parsedRunInputs) validateSectionRequirements() error {
	switch {
	case parsed.sectionID == nil && !parsed.allowUnscoped:
		return invalidRunInputError("sectionId is required unless allowUnscoped is true.")
	case parsed.sectionID != nil && parsed.allowUnscoped:
		return invalidRunInputError("allowUnscoped requires sectionId to be omitted.")
	default:
		return nil
	}
}

func (parsed parsedRunInputs) validateProjectSection(project projectstate.Project) error {
	if parsed.sectionID == nil {
		return nil
	}
	if _, _, _, err := project.ResolveSection(*parsed.sectionID); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	return nil
}

func resolveProfileEngineConfigID(profile agentprofiles.Profile) (string, error) {
	if profile.EngineConfigID == nil {
		return "", ErrProfileEngineConfigRequired
	}
	engineConfigID := strings.TrimSpace(*profile.EngineConfigID)
	if engineConfigID == "" {
		return "", ErrProfileEngineConfigRequired
	}
	return engineConfigID, nil
}

func (s *Service) resolveProfileEngine(profile agentprofiles.Profile) (ResolvedEngine, error) {
	engineConfigID, err := resolveProfileEngineConfigID(profile)
	if err != nil {
		return ResolvedEngine{}, err
	}
	return ResolveManagedEngine(s.engines, s.llm.Configs(), engineConfigID)
}

func normalizeRunPayloadInputs(inputs map[string]any, resolvedEngineConfigID string) (map[string]any, error) {
	payloadInputs := cloneAnyMap(inputs)
	if payloadInputs == nil {
		payloadInputs = map[string]any{}
	}
	if rawEngineConfigID, ok := payloadInputs["engineConfigId"]; ok {
		engineConfigIDValue, ok := rawEngineConfigID.(string)
		if !ok {
			return nil, invalidRunInputError("engineConfigId must be a string")
		}
		if strings.TrimSpace(engineConfigIDValue) != resolvedEngineConfigID {
			return nil, invalidRunInputError("engineConfigId does not match resolved engine config")
		}
	}
	payloadInputs["engineConfigId"] = resolvedEngineConfigID
	return payloadInputs, nil
}

func (s *Service) buildContext(profile agentprofiles.Profile, inputs map[string]any) (runContext, error) {
	projectSnapshot := s.projectState.Snapshot().Document
	if strings.TrimSpace(projectSnapshot.DefaultProjectID) == "" {
		return runContext{}, fmt.Errorf("project state does not define a default project config")
	}
	parsedInputs, err := parseRunInputs(inputs, projectSnapshot.DefaultProjectID)
	if err != nil {
		return runContext{}, err
	}
	project, err := projectSnapshot.ProjectByID(parsedInputs.projectConfigID)
	if err != nil {
		return runContext{}, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	if err := parsedInputs.validateProjectSection(project); err != nil {
		return runContext{}, err
	}
	engine, err := s.resolveProfileEngine(profile)
	if err != nil {
		return runContext{}, err
	}
	payloadInputs, err := normalizeRunPayloadInputs(inputs, engine.EngineConfig.ID)
	if err != nil {
		return runContext{}, err
	}
	run := NewRun(&profile.ID, payloadInputs, s.timeNow())
	chatID := parsedInputs.chatID
	if strings.TrimSpace(chatID) == "" {
		chatID = run.ID
	}
	completionGuardEnabled, err := s.resolveCompletionGuardEnabled()
	if err != nil {
		return runContext{}, err
	}
	systemPrompt, err := buildSystemPrompt(s.basePrompt, profile, parsedInputs.projectConfigID, s.temporaryIDs, completionGuardEnabled)
	if err != nil {
		return runContext{}, err
	}
	return runContext{
		run:                    run,
		profile:                profile,
		engine:                 engine,
		projectConfigID:        parsedInputs.projectConfigID,
		chatID:                 chatID,
		sectionID:              cloneStringPtr(parsedInputs.sectionID),
		thinking:               parsedInputs.thinking,
		completionGuardEnabled: completionGuardEnabled,
		systemPrompt:           systemPrompt,
		inputs:                 payloadInputs,
	}, nil
}

func (s *Service) resolveCompletionGuardEnabled() (bool, error) {
	if s == nil {
		return false, ErrManagedExecutorUnavailable
	}
	if s.completionGuardProvider == nil {
		return s.completionGuardEnabled, nil
	}
	return s.completionGuardProvider()
}

func (s *Service) recordEvent(run *Run, eventType string, payload map[string]any) error {
	if run == nil {
		return nil
	}
	run.Events = append(run.Events, NewRunEvent(eventType, payload, s.timeNow()))
	return s.runs.Save(*run)
}

func (s *Service) recordSnapshot(run *Run, projectConfigID string) error {
	projectSnapshot := s.projectState.Snapshot().Document
	temporaryIDMap := map[string]string{}
	if s.temporaryIDs != nil {
		snapshot, err := s.temporaryIDs.Snapshot()
		if err != nil {
			return err
		}
		temporaryIDMap = snapshot
	}
	projectStatePayload, err := toJSONObject(projectSnapshot)
	if err != nil {
		return err
	}
	temporaryIDPayload := map[string]any{}
	for canonicalID, temporaryID := range temporaryIDMap {
		temporaryIDPayload[canonicalID] = temporaryID
	}
	return s.recordEvent(run, "snapshot", map[string]any{
		"projectConfigId": projectConfigID,
		"projectState":    projectStatePayload,
		"temporaryIdMap":  temporaryIDPayload,
	})
}

func (s *Service) buildRunMetadata(context runContext) map[string]any {
	metadata := map[string]any{
		"engineConfigId":  context.engine.EngineConfig.ID,
		"llmConfigId":     context.engine.LLMConfig.ID,
		"model":           context.engine.LLMConfig.Model,
		"thinking":        context.thinking,
		"chatId":          context.chatID,
		"projectConfigId": context.projectConfigID,
	}
	if context.engine.LLMConfig.Provider != "" {
		metadata["provider"] = context.engine.LLMConfig.Provider
	}
	if context.profile.ID != "" {
		metadata["profileId"] = context.profile.ID
	}
	if context.sectionID != nil && strings.TrimSpace(*context.sectionID) != "" {
		metadata["sectionId"] = *context.sectionID
	}
	return metadata
}

func buildOutputs(base map[string]any, metadata map[string]any, cost *float64) map[string]any {
	outputs := cloneAnyMap(base)
	if outputs == nil {
		outputs = map[string]any{}
	}
	if len(metadata) > 0 {
		outputs["metadata"] = cloneAnyMap(metadata)
	}
	if cost != nil {
		outputs["cost"] = *cost
	}
	return outputs
}

func buildFailureOutputs(runID string, message string, metadata map[string]any) map[string]any {
	base := map[string]any{}
	if trimmed := strings.TrimSpace(message); trimmed != "" {
		base["messages"] = []any{buildAssistantFailureMessage(runID, trimmed)}
	}
	return buildOutputs(base, metadata, nil)
}

func buildAssistantFailureMessage(runID string, message string) map[string]any {
	messageID := "assistant_failed"
	if trimmedRunID := strings.TrimSpace(runID); trimmedRunID != "" {
		messageID += "_" + trimmedRunID
	}
	return map[string]any{
		"id":   messageID,
		"role": "assistant",
		"content": []any{
			map[string]any{
				"type": "text",
				"text": message,
			},
		},
		"attachments": []any{},
	}
}

func assistantFailureMessage(err error) string {
	if err == nil {
		return ""
	}
	var visibleErr assistantFailureMessageError
	if !errors.As(err, &visibleErr) {
		return ""
	}
	return strings.TrimSpace(visibleErr.AssistantFailureMessage())
}

func buildSystemPrompt(basePrompt string, profile agentprofiles.Profile, projectConfigID string, temporaryIDs TemporaryIDs, completionGuardEnabled bool) (string, error) {
	effectiveBasePrompt := strings.TrimSpace(basePrompt)
	if !completionGuardEnabled {
		effectiveBasePrompt = removeMarkdownSection(
			effectiveBasePrompt,
			"## Completion Reporting Contract",
		)
	}
	temporaryProjectConfigID := strings.TrimSpace(projectConfigID)
	if temporaryIDs != nil {
		resolvedID, err := temporaryIDs.EnsureTemporaryID(projectConfigID)
		if err != nil {
			return "", err
		}
		temporaryProjectConfigID = resolvedID
	}
	prompt := strings.TrimSpace(effectiveBasePrompt)
	if prompt != "" {
		prompt += "\n\n"
	}
	prompt += "## Active project config\n"
	prompt += fmt.Sprintf("- id: %s\n", temporaryProjectConfigID)

	profileLines := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(profile.Name); trimmed != "" {
		profileLines = append(profileLines, fmt.Sprintf("- name: %s", trimmed))
	}
	if trimmed := strings.TrimSpace(profile.Description); trimmed != "" {
		profileLines = append(profileLines, fmt.Sprintf("- description: %s", trimmed))
	}
	if len(profileLines) == 0 && strings.TrimSpace(profile.SystemPrompt) == "" {
		return strings.TrimSpace(prompt), nil
	}
	prompt += "\n## Agent profile"
	if len(profileLines) > 0 {
		prompt += "\n" + strings.Join(profileLines, "\n")
	}
	if trimmed := strings.TrimSpace(profile.SystemPrompt); trimmed != "" {
		prompt += "\n\n" + trimmed
	}
	return strings.TrimSpace(prompt), nil
}

func removeMarkdownSection(text string, heading string) string {
	lines := strings.Split(text, "\n")
	startIndex := -1
	for index, line := range lines {
		if strings.TrimSpace(line) == heading {
			startIndex = index
			break
		}
	}
	if startIndex == -1 {
		return strings.TrimSpace(text)
	}
	endIndex := len(lines)
	for index := startIndex + 1; index < len(lines); index++ {
		if strings.HasPrefix(lines[index], "## ") {
			endIndex = index
			break
		}
	}
	filtered := append([]string{}, lines[:startIndex]...)
	filtered = append(filtered, lines[endIndex:]...)
	return strings.TrimSpace(strings.Join(filtered, "\n"))
}

func toJSONObject(value any) (map[string]any, error) {
	content, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode snapshot payload: %w", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode snapshot payload: %w", err)
	}
	return payload, nil
}

func derefString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
