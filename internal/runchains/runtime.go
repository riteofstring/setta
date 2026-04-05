package runchains

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/projectstate"
)

const (
	runTypeChain     = "run_chain"
	runTypeChainStep = "run_chain_step"
)

var (
	ErrRunStoreRequired            = errors.New("run-chain store is required")
	ErrEngineStoreRequired         = errors.New("run-chain engine store is required")
	ErrProfileStoreRequired        = errors.New("run-chain profile store is required")
	ErrProjectStateRequired        = errors.New("run-chain project state is required")
	ErrStepRuntimeRequired         = errors.New("run-chain step runtime is required")
	ErrManagedRuntimeRequired      = errors.New("run-chain managed step runtime is required")
	ErrManagedRuntimeUnavailable   = errors.New("managed run-chain runtime is not available")
	ErrExternalRuntimeUnavailable  = errors.New("external-agent run-chain steps are not available")
	ErrInvalidRunChainInput        = errors.New("invalid run chain input")
	ErrSupportedStepEngineRequired = errors.New("run-chain steps require a Setta LLM or external-agent engine config")
)

var chainInputKeys = []string{
	"projectConfigId",
	"chatId",
	"sectionId",
	"thinking",
}

type RuntimeOptions struct {
	Runs         *agentruns.RunStore
	Engines      *agentruns.EngineStore
	Profiles     *agentprofiles.Store
	ProjectState *projectstate.Runtime
	Managed      managedStepRunner
	External     externalStepRunner
	TemporaryIDs agentruns.TemporaryIDs
	BaseContext  context.Context
	TimeNow      func() time.Time
}

type Runtime struct {
	runs         *agentruns.RunStore
	engines      *agentruns.EngineStore
	profiles     *agentprofiles.Store
	projectState *projectstate.Runtime
	managed      managedStepRunner
	external     externalStepRunner
	temporaryIDs agentruns.TemporaryIDs
	baseContext  context.Context
	timeNow      func() time.Time

	mu     sync.RWMutex
	active map[string]activeRunState
}

type activeRunState struct {
	cancel         context.CancelFunc
	done           chan struct{}
	stepRunID      string
	stepEngineType agentruns.EngineType
}

type managedStepRunner interface {
	Disabled() bool
	StartRun(profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error)
	StopRun(runID string) (agentruns.Run, error)
	WaitForRun(ctx context.Context, runID string) (agentruns.Run, error)
}

type externalStepRunner interface {
	Disabled() bool
	ValidateRun(profile agentprofiles.Profile, inputs map[string]any) error
	StartRun(ctx context.Context, profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error)
	StopRun(runID string) (agentruns.Run, error)
	WaitForRun(ctx context.Context, runID string) (agentruns.Run, error)
}

func NewRuntime(options RuntimeOptions) (*Runtime, error) {
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	if options.Engines == nil {
		return nil, ErrEngineStoreRequired
	}
	if options.Profiles == nil {
		return nil, ErrProfileStoreRequired
	}
	if options.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	if options.Managed == nil && options.External == nil {
		return nil, ErrStepRuntimeRequired
	}
	baseContext := options.BaseContext
	if baseContext == nil {
		baseContext = context.Background()
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Runtime{
		runs:         options.Runs,
		engines:      options.Engines,
		profiles:     options.Profiles,
		projectState: options.ProjectState,
		managed:      options.Managed,
		external:     options.External,
		temporaryIDs: options.TemporaryIDs,
		baseContext:  baseContext,
		timeNow:      timeNow,
		active:       map[string]activeRunState{},
	}, nil
}

func (r *Runtime) Disabled() bool {
	if r == nil {
		return true
	}
	managedDisabled := r.managed == nil || r.managed.Disabled()
	externalDisabled := r.external == nil || r.external.Disabled()
	return managedDisabled && externalDisabled
}

func (r *Runtime) StartRun(specInput SpecInput, inputs map[string]any) (agentruns.Run, error) {
	if r == nil || (r.managed == nil && r.external == nil) {
		return agentruns.Run{}, ErrStepRuntimeRequired
	}
	if r.Disabled() {
		return agentruns.Run{}, ErrStepRuntimeRequired
	}
	spec, err := NormalizeSpec(specInput)
	if err != nil {
		return agentruns.Run{}, err
	}
	chainInputs, err := r.prepareChainInputs(spec, inputs)
	if err != nil {
		return agentruns.Run{}, err
	}
	if err := r.validateSpec(spec, chainInputs); err != nil {
		return agentruns.Run{}, err
	}

	run := agentruns.NewRun(nil, chainInputs, r.timeNow())
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.recordEvent(&run, "chain_started", map[string]any{
		"chainId":    spec.ID,
		"chainRunId": run.ID,
		"stepCount":  len(spec.Steps),
	}); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.recordSnapshot(&run); err != nil {
		return agentruns.Run{}, err
	}

	ctx, cancel := context.WithCancel(r.baseContext)
	done := make(chan struct{})
	r.mu.Lock()
	r.active[run.ID] = activeRunState{
		cancel: cancel,
		done:   done,
	}
	r.mu.Unlock()

	go func(runID string, runSpec Spec, runInputs map[string]any) {
		defer close(done)
		defer func() {
			r.mu.Lock()
			delete(r.active, runID)
			r.mu.Unlock()
		}()
		r.executeChain(ctx, runID, runSpec, runInputs)
	}(run.ID, spec, chainInputs)

	return run.Clone(), nil
}

func (r *Runtime) StopRun(runID string) (agentruns.Run, error) {
	if r == nil || (r.managed == nil && r.external == nil) {
		return agentruns.Run{}, ErrStepRuntimeRequired
	}
	if r.Disabled() {
		return agentruns.Run{}, ErrStepRuntimeRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return agentruns.Run{}, fmt.Errorf("%w: run id is required", agentruns.ErrRunNotFound)
	}

	r.mu.RLock()
	active, ok := r.active[trimmedRunID]
	r.mu.RUnlock()
	if ok && active.cancel != nil {
		active.cancel()
	}
	if ok && strings.TrimSpace(active.stepRunID) != "" {
		switch active.stepEngineType {
		case agentruns.EngineTypeExternalAgent:
			if r.external == nil {
				return agentruns.Run{}, ErrExternalRuntimeUnavailable
			}
			if _, err := r.external.StopRun(active.stepRunID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
				return agentruns.Run{}, err
			}
		default:
			if r.managed == nil {
				return agentruns.Run{}, ErrManagedRuntimeRequired
			}
			if _, err := r.managed.StopRun(active.stepRunID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
				return agentruns.Run{}, err
			}
		}
	}
	return r.markCancelled(trimmedRunID)
}

func (r *Runtime) WaitForRun(ctx context.Context, runID string) (agentruns.Run, error) {
	if r == nil || (r.managed == nil && r.external == nil) {
		return agentruns.Run{}, ErrStepRuntimeRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return agentruns.Run{}, fmt.Errorf("%w: run id is required", agentruns.ErrRunNotFound)
	}
	r.mu.RLock()
	active, ok := r.active[trimmedRunID]
	r.mu.RUnlock()
	if ok {
		select {
		case <-active.done:
		case <-ctx.Done():
			return agentruns.Run{}, ctx.Err()
		}
	}
	return r.runs.Load(trimmedRunID)
}

func (r *Runtime) validateSpec(spec Spec, chainInputs map[string]any) error {
	for index, step := range spec.Steps {
		engineConfig, err := r.engines.Get(step.EngineConfigID)
		if err != nil {
			return err
		}
		profile, err := r.resolveStepProfile(step)
		if err != nil {
			return err
		}
		stepInputs, err := r.buildStepInputs(step, index, "validation-run", chainInputs, nil)
		if err != nil {
			return err
		}
		switch engineConfig.EngineType {
		case agentruns.EngineTypeSettaLLM:
			if r.managed == nil {
				return ErrManagedRuntimeRequired
			}
			if r.managed.Disabled() {
				return ErrManagedRuntimeUnavailable
			}
			if err := r.validateManagedStepInputs(stepInputs); err != nil {
				return err
			}
		case agentruns.EngineTypeExternalAgent:
			if r.external == nil || r.external.Disabled() {
				return ErrExternalRuntimeUnavailable
			}
			if err := r.external.ValidateRun(profile, stepInputs); err != nil {
				return normalizeExternalValidationError(err)
			}
		default:
			return fmt.Errorf("%w: run chain step %d uses unsupported engine type %q", ErrSupportedStepEngineRequired, index, engineConfig.EngineType)
		}
	}
	return nil
}

func (r *Runtime) prepareChainInputs(spec Spec, inputs map[string]any) (map[string]any, error) {
	chainSpec, err := spec.jsonValue()
	if err != nil {
		return nil, err
	}
	payloadInputs := cloneAnyMap(inputs)
	if payloadInputs == nil {
		payloadInputs = map[string]any{}
	}
	payloadInputs["runType"] = runTypeChain
	payloadInputs["chainId"] = spec.ID
	payloadInputs["chainName"] = spec.Name
	payloadInputs["chainSpec"] = chainSpec
	return payloadInputs, nil
}

func (r *Runtime) executeChain(ctx context.Context, runID string, spec Spec, chainInputs map[string]any) {
	stepSummaries := make([]map[string]any, 0, len(spec.Steps))
	for index, step := range spec.Steps {
		if ctx.Err() != nil {
			_, _ = r.markCancelled(runID)
			return
		}
		if err := r.appendEvent(runID, "step_started", map[string]any{
			"stepIndex":      index,
			"stepId":         step.ID,
			"engineConfigId": step.EngineConfigID,
			"agentProfileId": derefString(step.AgentProfileID),
		}); err != nil {
			_, _ = r.markFailed(runID, map[string]any{"error": err.Error()})
			return
		}

		childRun, err := r.runStep(ctx, step, index, runID, chainInputs, stepSummaries)
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, context.Canceled) {
				_, _ = r.markCancelled(runID)
				return
			}
			_, _ = r.markFailed(runID, map[string]any{"error": err.Error()})
			return
		}

		summary := buildStepSummary(step, childRun)
		stepSummaries = append(stepSummaries, summary)
		if err := r.updateOutputs(runID, spec, stepSummaries); err != nil {
			_, _ = r.markFailed(runID, map[string]any{"error": err.Error()})
			return
		}

		if childRun.Status == agentruns.RunStatusCompleted {
			if err := r.appendEvent(runID, "step_completed", map[string]any{
				"stepIndex": index,
				"stepId":    step.ID,
				"runId":     childRun.ID,
				"status":    string(childRun.Status),
			}); err != nil {
				_, _ = r.markFailed(runID, map[string]any{"error": err.Error()})
				return
			}
			continue
		}

		if err := r.appendEvent(runID, "step_failed", map[string]any{
			"stepIndex": index,
			"stepId":    step.ID,
			"runId":     childRun.ID,
			"status":    string(childRun.Status),
		}); err != nil {
			_, _ = r.markFailed(runID, map[string]any{"error": err.Error()})
			return
		}
		if !spec.StopOnFailure {
			continue
		}
		if childRun.Status == agentruns.RunStatusCancelled {
			_, _ = r.markCancelled(runID)
			return
		}
		_, _ = r.markFailed(runID, map[string]any{})
		return
	}

	_, _ = r.markCompleted(runID, spec, stepSummaries)
}

func (r *Runtime) runStep(
	ctx context.Context,
	step Step,
	stepIndex int,
	chainRunID string,
	chainInputs map[string]any,
	previousOutputs []map[string]any,
) (agentruns.Run, error) {
	engineConfig, err := r.engines.Get(step.EngineConfigID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if engineConfig.EngineType != agentruns.EngineTypeSettaLLM {
		switch engineConfig.EngineType {
		case agentruns.EngineTypeExternalAgent:
		default:
			return agentruns.Run{}, fmt.Errorf("%w: step %q uses unsupported engine type %q", ErrSupportedStepEngineRequired, step.ID, engineConfig.EngineType)
		}
	}
	inputs, err := r.buildStepInputs(step, stepIndex, chainRunID, chainInputs, previousOutputs)
	if err != nil {
		return agentruns.Run{}, err
	}
	profile, err := r.resolveStepProfile(step)
	if err != nil {
		return agentruns.Run{}, err
	}
	profile.EngineConfigID = cloneStringPtr(&step.EngineConfigID)
	switch engineConfig.EngineType {
	case agentruns.EngineTypeSettaLLM:
		if r.managed == nil {
			return agentruns.Run{}, ErrManagedRuntimeRequired
		}
		childRun, err := r.managed.StartRun(profile, inputs)
		if err != nil {
			return agentruns.Run{}, err
		}
		r.setActiveStep(chainRunID, childRun.ID, agentruns.EngineTypeSettaLLM)
		defer r.clearActiveStep(chainRunID, childRun.ID)
		if err := r.stopStepIfContextCancelled(ctx, childRun.ID, agentruns.EngineTypeSettaLLM); err != nil {
			return agentruns.Run{}, err
		}
		return r.managed.WaitForRun(ctx, childRun.ID)
	case agentruns.EngineTypeExternalAgent:
		if r.external == nil {
			return agentruns.Run{}, ErrExternalRuntimeUnavailable
		}
		childRun, err := r.external.StartRun(ctx, profile, inputs)
		if err != nil {
			return agentruns.Run{}, err
		}
		r.setActiveStep(chainRunID, childRun.ID, agentruns.EngineTypeExternalAgent)
		defer r.clearActiveStep(chainRunID, childRun.ID)
		if err := r.stopStepIfContextCancelled(ctx, childRun.ID, agentruns.EngineTypeExternalAgent); err != nil {
			return agentruns.Run{}, err
		}
		return r.external.WaitForRun(ctx, childRun.ID)
	default:
		return agentruns.Run{}, fmt.Errorf("%w: step %q uses unsupported engine type %q", ErrSupportedStepEngineRequired, step.ID, engineConfig.EngineType)
	}
}

func (r *Runtime) resolveStepProfile(step Step) (agentprofiles.Profile, error) {
	if step.AgentProfileID != nil {
		profile, err := r.profiles.Get(*step.AgentProfileID)
		if err != nil {
			return agentprofiles.Profile{}, err
		}
		profile.EngineConfigID = cloneStringPtr(&step.EngineConfigID)
		return profile, nil
	}
	engineConfigID := step.EngineConfigID
	name := strings.TrimSpace(step.Name)
	if name == "" {
		name = "Orchestrated step"
	}
	return agentprofiles.Profile{
		ID:             newRandomID(),
		Name:           name,
		Description:    "",
		SystemPrompt:   "",
		EngineConfigID: &engineConfigID,
		ToolAllowlist:  []string{},
	}, nil
}

func (r *Runtime) buildStepInputs(
	step Step,
	stepIndex int,
	chainRunID string,
	chainInputs map[string]any,
	previousOutputs []map[string]any,
) (map[string]any, error) {
	payloadInputs := map[string]any{}
	for _, key := range chainInputKeys {
		if value, ok := chainInputs[key]; ok {
			payloadInputs[key] = deepCloneJSONValue(value)
		}
	}
	if value, ok := chainInputs["chainId"]; ok {
		payloadInputs["chainId"] = deepCloneJSONValue(value)
	}
	if value, ok := chainInputs["chainName"]; ok {
		payloadInputs["chainName"] = deepCloneJSONValue(value)
	}
	if step.Inputs != nil {
		for key, value := range step.Inputs {
			payloadInputs[key] = deepCloneJSONValue(value)
		}
	}
	if _, ok := payloadInputs["sectionId"]; !ok {
		if _, ok := payloadInputs["allowUnscoped"]; !ok {
			payloadInputs["allowUnscoped"] = true
		}
	}
	if rawEngineConfigID, ok := payloadInputs["engineConfigId"]; ok {
		engineConfigID, ok := rawEngineConfigID.(string)
		if !ok {
			return nil, fmt.Errorf("%w: engineConfigId must be a string", ErrInvalidRunChainInput)
		}
		if strings.TrimSpace(engineConfigID) != step.EngineConfigID {
			return nil, fmt.Errorf("%w: engineConfigId does not match run chain step engine config", ErrInvalidRunChainInput)
		}
	}
	payloadInputs["engineConfigId"] = step.EngineConfigID
	payloadInputs["runType"] = runTypeChainStep
	payloadInputs["chainRunId"] = chainRunID
	payloadInputs["parentRunId"] = chainRunID
	payloadInputs["stepId"] = step.ID
	payloadInputs["stepIndex"] = stepIndex
	if step.AgentProfileID != nil {
		payloadInputs["agentProfileId"] = *step.AgentProfileID
	}
	if len(previousOutputs) > 0 {
		payloadInputs["previousOutputs"] = deepCloneJSONValue(previousOutputs)
	}
	if step.Prompt != nil && strings.TrimSpace(*step.Prompt) != "" {
		if _, exists := payloadInputs["prompt"]; !exists {
			payloadInputs["prompt"] = *step.Prompt
		}
	}
	if len(step.Messages) > 0 {
		if _, exists := payloadInputs["messages"]; !exists {
			payloadInputs["messages"] = messagesToAnySlice(step.Messages)
		}
	}
	if step.IncludePreviousOutputs && len(previousOutputs) > 0 {
		contextMessage, err := buildPreviousOutputsMessage(previousOutputs)
		if err != nil {
			return nil, err
		}
		messages := messagesFromValue(payloadInputs["messages"])
		messages = append([]any{contextMessage}, messages...)
		payloadInputs["messages"] = messages
	}
	return payloadInputs, nil
}

func buildPreviousOutputsMessage(previousOutputs []map[string]any) (map[string]any, error) {
	content, err := json.MarshalIndent(previousOutputs, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("%w: encode previous outputs: %v", ErrInvalidRunChainInput, err)
	}
	return map[string]any{
		"id":   newRandomID(),
		"role": "user",
		"content": []any{
			map[string]any{
				"type": "text",
				"text": "Previous step outputs:\n" + string(content),
			},
		},
	}, nil
}

func (r *Runtime) validateManagedStepInputs(inputs map[string]any) error {
	projectSnapshot := r.projectState.Snapshot().Document
	if strings.TrimSpace(projectSnapshot.DefaultProjectID) == "" {
		return fmt.Errorf("%w: project state does not define a default project config", ErrInvalidRunChainInput)
	}
	projectConfigID := projectSnapshot.DefaultProjectID
	if rawProjectConfigID, ok := inputs["projectConfigId"]; ok {
		projectConfigIDValue, ok := rawProjectConfigID.(string)
		if !ok {
			return fmt.Errorf("%w: projectConfigId must be a string", ErrInvalidRunChainInput)
		}
		projectConfigID = strings.TrimSpace(projectConfigIDValue)
	}
	project, err := projectSnapshot.ProjectByID(projectConfigID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidRunChainInput, err)
	}
	if rawChatID, ok := inputs["chatId"]; ok {
		if _, ok := rawChatID.(string); !ok {
			return fmt.Errorf("%w: chatId must be a string", ErrInvalidRunChainInput)
		}
	}
	var sectionID *string
	if rawSectionID, ok := inputs["sectionId"]; ok {
		sectionIDValue, ok := rawSectionID.(string)
		if !ok {
			return fmt.Errorf("%w: sectionId must be a string", ErrInvalidRunChainInput)
		}
		trimmed := strings.TrimSpace(sectionIDValue)
		sectionID = &trimmed
	}
	allowUnscoped := false
	if rawAllowUnscoped, ok := inputs["allowUnscoped"]; ok {
		allowUnscopedValue, ok := rawAllowUnscoped.(bool)
		if !ok {
			return fmt.Errorf("%w: allowUnscoped must be a boolean", ErrInvalidRunChainInput)
		}
		allowUnscoped = allowUnscopedValue
	}
	if sectionID == nil && !allowUnscoped {
		return fmt.Errorf("%w: sectionId is required unless allowUnscoped is true.", ErrInvalidRunChainInput)
	}
	if sectionID != nil && allowUnscoped {
		return fmt.Errorf("%w: allowUnscoped requires sectionId to be omitted.", ErrInvalidRunChainInput)
	}
	if sectionID != nil {
		if _, _, _, err := project.ResolveSection(*sectionID); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalidRunChainInput, err)
		}
	}
	if rawThinking, ok := inputs["thinking"]; ok {
		if _, ok := rawThinking.(bool); !ok {
			return fmt.Errorf("%w: thinking must be a boolean", ErrInvalidRunChainInput)
		}
	}
	if rawPrompt, ok := inputs["prompt"]; ok {
		if _, ok := rawPrompt.(string); !ok {
			return fmt.Errorf("%w: prompt must be a string", ErrInvalidRunChainInput)
		}
	}
	if rawMessages, ok := inputs["messages"]; ok {
		switch rawMessages.(type) {
		case []any, []map[string]any:
		default:
			return fmt.Errorf("%w: messages must be a list", ErrInvalidRunChainInput)
		}
	}
	return nil
}

func buildStepSummary(step Step, childRun agentruns.Run) map[string]any {
	return map[string]any{
		"stepId":         step.ID,
		"name":           step.Name,
		"engineConfigId": step.EngineConfigID,
		"agentProfileId": derefString(step.AgentProfileID),
		"runId":          childRun.ID,
		"status":         string(childRun.Status),
		"outputs":        cloneAnyMap(childRun.Outputs),
	}
}

func messagesToAnySlice(messages []map[string]any) []any {
	converted := make([]any, 0, len(messages))
	for _, message := range messages {
		converted = append(converted, cloneAnyMap(message))
	}
	return converted
}

func messagesFromValue(value any) []any {
	switch typed := value.(type) {
	case nil:
		return []any{}
	case []any:
		return cloneAnySlice(typed)
	case []map[string]any:
		return messagesToAnySlice(typed)
	default:
		return []any{}
	}
}

func (r *Runtime) appendEvent(runID string, eventType string, payload map[string]any) error {
	run, err := r.runs.Load(runID)
	if err != nil {
		return err
	}
	return r.recordEvent(&run, eventType, payload)
}

func (r *Runtime) recordEvent(run *agentruns.Run, eventType string, payload map[string]any) error {
	run.Events = append(run.Events, agentruns.NewRunEvent(eventType, payload, r.timeNow()))
	return r.runs.Save(*run)
}

func (r *Runtime) recordSnapshot(run *agentruns.Run) error {
	temporaryIDs := map[string]string{}
	if r.temporaryIDs != nil {
		snapshot, err := r.temporaryIDs.Snapshot()
		if err != nil {
			return err
		}
		for canonicalID, temporaryID := range snapshot {
			temporaryIDs[canonicalID] = temporaryID
		}
	}
	return r.recordEvent(run, "snapshot", map[string]any{
		"projectState":   r.projectState.Snapshot().Document,
		"temporaryIdMap": temporaryIDs,
	})
}

func (r *Runtime) updateOutputs(runID string, spec Spec, stepSummaries []map[string]any) error {
	run, err := r.runs.Load(runID)
	if err != nil {
		return err
	}
	outputs := cloneAnyMap(run.Outputs)
	if outputs == nil {
		outputs = map[string]any{}
	}
	outputs["chainId"] = spec.ID
	outputs["chainName"] = spec.Name
	outputs["steps"] = deepCloneJSONValue(stepSummaries)
	run.Outputs = outputs
	return r.runs.Save(run)
}

func (r *Runtime) markCompleted(runID string, spec Spec, stepSummaries []map[string]any) (agentruns.Run, error) {
	if err := r.updateOutputs(runID, spec, stepSummaries); err != nil {
		return agentruns.Run{}, err
	}
	run, err := r.runs.Load(runID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if isTerminal(run.Status) {
		return run, nil
	}
	run.Status = agentruns.RunStatusCompleted
	finishedAt := r.timeNow().UTC()
	run.FinishedAt = &finishedAt
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.recordEvent(&run, "chain_completed", map[string]any{}); err != nil {
		return agentruns.Run{}, err
	}
	return r.runs.Load(runID)
}

func (r *Runtime) markCancelled(runID string) (agentruns.Run, error) {
	run, err := r.runs.Load(runID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if isTerminal(run.Status) {
		return run, nil
	}
	run.Status = agentruns.RunStatusCancelled
	finishedAt := r.timeNow().UTC()
	run.FinishedAt = &finishedAt
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.recordEvent(&run, "chain_cancelled", map[string]any{}); err != nil {
		return agentruns.Run{}, err
	}
	return r.runs.Load(runID)
}

func (r *Runtime) markFailed(runID string, payload map[string]any) (agentruns.Run, error) {
	run, err := r.runs.Load(runID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if isTerminal(run.Status) {
		return run, nil
	}
	run.Status = agentruns.RunStatusFailed
	finishedAt := r.timeNow().UTC()
	run.FinishedAt = &finishedAt
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.recordEvent(&run, "chain_failed", payload); err != nil {
		return agentruns.Run{}, err
	}
	return r.runs.Load(runID)
}

func (r *Runtime) setActiveStep(runID string, stepRunID string, stepEngineType agentruns.EngineType) {
	r.mu.Lock()
	defer r.mu.Unlock()
	active, ok := r.active[runID]
	if !ok {
		return
	}
	active.stepRunID = stepRunID
	active.stepEngineType = stepEngineType
	r.active[runID] = active
}

func (r *Runtime) clearActiveStep(runID string, stepRunID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	active, ok := r.active[runID]
	if !ok {
		return
	}
	if active.stepRunID != stepRunID {
		return
	}
	active.stepRunID = ""
	active.stepEngineType = ""
	r.active[runID] = active
}

func (r *Runtime) stopStepIfContextCancelled(ctx context.Context, stepRunID string, stepEngineType agentruns.EngineType) error {
	if ctx == nil || ctx.Err() == nil || strings.TrimSpace(stepRunID) == "" {
		return nil
	}
	switch stepEngineType {
	case agentruns.EngineTypeExternalAgent:
		if r.external == nil {
			return ErrExternalRuntimeUnavailable
		}
		if _, err := r.external.StopRun(stepRunID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
			return err
		}
	default:
		if r.managed == nil {
			return ErrManagedRuntimeRequired
		}
		if _, err := r.managed.StopRun(stepRunID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
			return err
		}
	}
	return nil
}

func isTerminal(status agentruns.RunStatus) bool {
	switch status {
	case agentruns.RunStatusCompleted, agentruns.RunStatusFailed, agentruns.RunStatusCancelled:
		return true
	default:
		return false
	}
}

func derefString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func normalizeExternalValidationError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, externalagents.ErrInvalidRunInput):
		message := strings.TrimPrefix(strings.TrimSpace(err.Error()), externalagents.ErrInvalidRunInput.Error()+": ")
		if message == "" {
			return ErrInvalidRunChainInput
		}
		return fmt.Errorf("%w: %s", ErrInvalidRunChainInput, message)
	default:
		return err
	}
}
