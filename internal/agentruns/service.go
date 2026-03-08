package agentruns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
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

type ExecutionRequest struct {
	Profile         agentprofiles.Profile
	Run             Run
	EngineConfig    EngineConfig
	LLMConfig       llmconfig.Config
	MCPServerIDs    []string
	RequestParams   map[string]any
	APIKeys         map[string]string
	SystemPrompt    string
	ProjectConfigID string
	ChatID          string
	SectionID       *string
	Thinking        bool
	Inputs          map[string]any
}

type ExecutionResult struct {
	Outputs   map[string]any
	ToolCalls []map[string]any
	Cost      *float64
}

type ServiceOptions struct {
	ProjectState           *projectstate.Runtime
	Engines                *EngineStore
	Runs                   *RunStore
	LLM                    *llmconfig.Runtime
	Executor               Executor
	TemporaryIDs           TemporaryIDs
	BasePrompt             string
	CompletionGuardEnabled bool
	TimeNow                func() time.Time
}

type Service struct {
	projectState           *projectstate.Runtime
	engines                *EngineStore
	runs                   *RunStore
	llm                    *llmconfig.Runtime
	executor               Executor
	temporaryIDs           TemporaryIDs
	basePrompt             string
	completionGuardEnabled bool
	timeNow                func() time.Time
}

type ResolvedEngine struct {
	EngineConfig EngineConfig
	LLMConfig    llmconfig.Config
}

type runContext struct {
	run             Run
	profile         agentprofiles.Profile
	engine          ResolvedEngine
	projectConfigID string
	chatID          string
	sectionID       *string
	thinking        bool
	systemPrompt    string
	inputs          map[string]any
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
		projectState:           options.ProjectState,
		engines:                options.Engines,
		runs:                   options.Runs,
		llm:                    options.LLM,
		executor:               options.Executor,
		temporaryIDs:           options.TemporaryIDs,
		basePrompt:             strings.TrimSpace(options.BasePrompt),
		completionGuardEnabled: options.CompletionGuardEnabled,
		timeNow:                timeNow,
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
	if s == nil {
		return runContext{}, ErrManagedExecutorUnavailable
	}
	if s.executor == nil {
		return runContext{}, ErrManagedExecutorUnavailable
	}
	prepared, err := s.buildContext(profile, inputs)
	if err != nil {
		return runContext{}, err
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
	if s == nil {
		return Run{}, ErrManagedExecutorUnavailable
	}
	if s.executor == nil {
		return Run{}, ErrManagedExecutorUnavailable
	}

	request, err := s.buildExecutionRequest(runContext)
	if err != nil {
		runContext.run.Outputs = buildOutputs(nil, s.buildRunMetadata(runContext), nil)
		runContext.run.Status = RunStatusFailed
		finishedAt := s.timeNow().UTC()
		runContext.run.FinishedAt = &finishedAt
		if saveErr := s.runs.Save(runContext.run); saveErr != nil {
			return Run{}, saveErr
		}
		if recordErr := s.recordEvent(&runContext.run, "run_failed", map[string]any{"error": err.Error()}); recordErr != nil {
			return Run{}, recordErr
		}
		return s.runs.Load(runContext.run.ID)
	}
	result, execErr := s.executor.Execute(ctx, request)
	if persistedRun, err := s.runs.Load(runContext.run.ID); err == nil {
		runContext.run = persistedRun
	}
	if ctx.Err() != nil || errors.Is(execErr, context.Canceled) || runContext.run.Status == RunStatusCancelled {
		if err := s.persistExecutionResult(&runContext.run, runContext, result); err != nil {
			return Run{}, err
		}
		return s.cancelRun(runContext.run.ID)
	}
	if execErr != nil {
		runContext.run.Outputs = buildOutputs(nil, s.buildRunMetadata(runContext), nil)
		runContext.run.Status = RunStatusFailed
		finishedAt := s.timeNow().UTC()
		runContext.run.FinishedAt = &finishedAt
		if err := s.runs.Save(runContext.run); err != nil {
			return Run{}, err
		}
		if err := s.recordEvent(&runContext.run, "run_failed", map[string]any{"error": execErr.Error()}); err != nil {
			return Run{}, err
		}
		return s.runs.Load(runContext.run.ID)
	}

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
		Profile:         runContext.profile,
		Run:             runContext.run.Clone(),
		EngineConfig:    runContext.engine.EngineConfig,
		LLMConfig:       runContext.engine.LLMConfig,
		MCPServerIDs:    cloneStringSlice(mcpServerIDs),
		RequestParams:   requestParams,
		APIKeys:         apiKeys,
		SystemPrompt:    runContext.systemPrompt,
		ProjectConfigID: runContext.projectConfigID,
		ChatID:          runContext.chatID,
		SectionID:       cloneStringPtr(runContext.sectionID),
		Thinking:        runContext.thinking,
		Inputs:          cloneAnyMap(runContext.inputs),
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
				return ResolvedEngine{}, fmt.Errorf("no LLM config available for engine")
			}
			llmConfigID = configIDs[0]
		}
	}
	llmConfig, err := configs.ResolveConfig(llmConfigID)
	if err != nil {
		return ResolvedEngine{}, err
	}
	return ResolvedEngine{
		EngineConfig: engine,
		LLMConfig:    llmConfig,
	}, nil
}

func (s *Service) buildContext(profile agentprofiles.Profile, inputs map[string]any) (runContext, error) {
	projectSnapshot := s.projectState.Snapshot().Document
	if strings.TrimSpace(projectSnapshot.DefaultProjectID) == "" {
		return runContext{}, fmt.Errorf("project state does not define a default project config")
	}
	projectConfigID := projectSnapshot.DefaultProjectID
	if rawProjectConfigID, ok := inputs["projectConfigId"]; ok {
		projectConfigIDValue, ok := rawProjectConfigID.(string)
		if !ok {
			return runContext{}, fmt.Errorf("%w: projectConfigId must be a string", ErrInvalidRunInput)
		}
		projectConfigID = strings.TrimSpace(projectConfigIDValue)
	}
	project, err := projectSnapshot.ProjectByID(projectConfigID)
	if err != nil {
		return runContext{}, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	var chatID string
	if rawChatID, ok := inputs["chatId"]; ok {
		chatIDValue, ok := rawChatID.(string)
		if !ok {
			return runContext{}, fmt.Errorf("%w: chatId must be a string", ErrInvalidRunInput)
		}
		chatID = strings.TrimSpace(chatIDValue)
	}
	var sectionID *string
	if rawSectionID, ok := inputs["sectionId"]; ok {
		sectionIDValue, ok := rawSectionID.(string)
		if !ok {
			return runContext{}, fmt.Errorf("%w: sectionId must be a string", ErrInvalidRunInput)
		}
		trimmed := strings.TrimSpace(sectionIDValue)
		sectionID = &trimmed
	}
	allowUnscoped := false
	if rawAllowUnscoped, ok := inputs["allowUnscoped"]; ok {
		allowValue, ok := rawAllowUnscoped.(bool)
		if !ok {
			return runContext{}, fmt.Errorf("%w: allowUnscoped must be a boolean", ErrInvalidRunInput)
		}
		allowUnscoped = allowValue
	}
	if sectionID == nil && !allowUnscoped {
		return runContext{}, fmt.Errorf("%w: sectionId is required unless allowUnscoped is true.", ErrInvalidRunInput)
	}
	if sectionID != nil && allowUnscoped {
		return runContext{}, fmt.Errorf("%w: allowUnscoped requires sectionId to be omitted.", ErrInvalidRunInput)
	}
	if sectionID != nil {
		if _, _, _, err := project.ResolveSection(*sectionID); err != nil {
			return runContext{}, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
		}
	}
	thinking := false
	if rawThinking, ok := inputs["thinking"]; ok {
		thinkingValue, ok := rawThinking.(bool)
		if !ok {
			return runContext{}, fmt.Errorf("%w: thinking must be a boolean", ErrInvalidRunInput)
		}
		thinking = thinkingValue
	}
	if rawPrompt, ok := inputs["prompt"]; ok {
		if _, ok := rawPrompt.(string); !ok {
			return runContext{}, fmt.Errorf("%w: prompt must be a string", ErrInvalidRunInput)
		}
	}
	if rawMessages, ok := inputs["messages"]; ok {
		if _, ok := rawMessages.([]any); !ok {
			return runContext{}, fmt.Errorf("%w: messages must be a list", ErrInvalidRunInput)
		}
	}
	engineConfigID := ""
	if profile.EngineConfigID == nil {
		return runContext{}, ErrProfileEngineConfigRequired
	}
	engineConfigID = strings.TrimSpace(*profile.EngineConfigID)
	if engineConfigID == "" {
		return runContext{}, ErrProfileEngineConfigRequired
	}
	engine, err := ResolveManagedEngine(s.engines, s.llm.Configs(), engineConfigID)
	if err != nil {
		return runContext{}, err
	}
	payloadInputs := cloneAnyMap(inputs)
	if payloadInputs == nil {
		payloadInputs = map[string]any{}
	}
	if rawEngineConfigID, ok := payloadInputs["engineConfigId"]; ok {
		engineConfigIDValue, ok := rawEngineConfigID.(string)
		if !ok {
			return runContext{}, fmt.Errorf("%w: engineConfigId must be a string", ErrInvalidRunInput)
		}
		if strings.TrimSpace(engineConfigIDValue) != engine.EngineConfig.ID {
			return runContext{}, fmt.Errorf("%w: engineConfigId does not match resolved engine config", ErrInvalidRunInput)
		}
	}
	payloadInputs["engineConfigId"] = engine.EngineConfig.ID
	run := NewRun(&profile.ID, payloadInputs, s.timeNow())
	if strings.TrimSpace(chatID) == "" {
		chatID = run.ID
	}
	systemPrompt, err := buildSystemPrompt(s.basePrompt, profile, projectConfigID, s.temporaryIDs, s.completionGuardEnabled)
	if err != nil {
		return runContext{}, err
	}
	return runContext{
		run:             run,
		profile:         profile,
		engine:          engine,
		projectConfigID: projectConfigID,
		chatID:          chatID,
		sectionID:       cloneStringPtr(sectionID),
		thinking:        thinking,
		systemPrompt:    systemPrompt,
		inputs:          payloadInputs,
	}, nil
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
