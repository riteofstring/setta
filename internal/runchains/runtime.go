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
	if err := r.requireStepRuntime(); err != nil {
		return agentruns.Run{}, err
	}
	trimmedRunID, err := normalizeChainRunID(runID)
	if err != nil {
		return agentruns.Run{}, err
	}
	active, ok := r.lookupActiveRun(trimmedRunID)
	if ok && active.cancel != nil {
		active.cancel()
	}
	if err := r.stopActiveStepRun(active, ok); err != nil {
		return agentruns.Run{}, err
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
		if err := r.validateSpecStep(step, index, chainInputs); err != nil {
			return err
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
		if r.cancelChainIfContextDone(ctx, runID) {
			return
		}
		childRun, err := r.startChainStep(ctx, runID, step, index, chainInputs, stepSummaries)
		if err != nil {
			if r.cancelChainIfStepRunStopped(ctx, runID, err) {
				return
			}
			r.failChainWithError(runID, err)
			return
		}

		summary := buildStepSummary(step, childRun)
		stepSummaries = append(stepSummaries, summary)
		if err := r.updateOutputs(runID, spec, stepSummaries); err != nil {
			r.failChainWithError(runID, err)
			return
		}
		if r.finishChainAfterStep(runID, spec, step, index, childRun) {
			return
		}
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
	if err := validateSupportedStepEngine(step.ID, engineConfig.EngineType); err != nil {
		return agentruns.Run{}, err
	}
	profile, inputs, err := r.prepareStepRun(step, stepIndex, chainRunID, chainInputs, previousOutputs)
	if err != nil {
		return agentruns.Run{}, err
	}
	return r.startStepRun(ctx, chainRunID, engineConfig.EngineType, profile, inputs, step)
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
	payloadInputs := cloneChainStepInputs(chainInputs)
	mergeStepInputOverrides(payloadInputs, step.Inputs)
	ensureUnscopedStepInputs(payloadInputs)
	if err := validateStepEngineInput(payloadInputs, step.EngineConfigID); err != nil {
		return nil, err
	}
	attachStepRuntimeInputs(payloadInputs, step, stepIndex, chainRunID, previousOutputs)
	applyOptionalStepPrompt(payloadInputs, step)
	applyOptionalStepMessages(payloadInputs, step)
	if err := prependPreviousOutputsContext(payloadInputs, step, previousOutputs); err != nil {
		return nil, err
	}
	return payloadInputs, nil
}

func (r *Runtime) requireStepRuntime() error {
	if r == nil || (r.managed == nil && r.external == nil) {
		return ErrStepRuntimeRequired
	}
	if r.Disabled() {
		return ErrStepRuntimeRequired
	}
	return nil
}

func normalizeChainRunID(runID string) (string, error) {
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return "", fmt.Errorf("%w: run id is required", agentruns.ErrRunNotFound)
	}
	return trimmedRunID, nil
}

func (r *Runtime) lookupActiveRun(runID string) (activeRunState, bool) {
	r.mu.RLock()
	active, ok := r.active[runID]
	r.mu.RUnlock()
	return active, ok
}

func (r *Runtime) stopActiveStepRun(active activeRunState, ok bool) error {
	if !ok || strings.TrimSpace(active.stepRunID) == "" {
		return nil
	}
	switch active.stepEngineType {
	case agentruns.EngineTypeExternalAgent:
		return r.stopExternalStepRun(active.stepRunID)
	default:
		return r.stopManagedStepRun(active.stepRunID)
	}
}

func (r *Runtime) stopExternalStepRun(runID string) error {
	if r.external == nil {
		return ErrExternalRuntimeUnavailable
	}
	if _, err := r.external.StopRun(runID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
		return err
	}
	return nil
}

func (r *Runtime) stopManagedStepRun(runID string) error {
	if r.managed == nil {
		return ErrManagedRuntimeRequired
	}
	if _, err := r.managed.StopRun(runID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
		return err
	}
	return nil
}

func (r *Runtime) validateSpecStep(step Step, stepIndex int, chainInputs map[string]any) error {
	engineConfig, stepInputs, profile, err := r.prepareStepValidation(step, stepIndex, chainInputs)
	if err != nil {
		return err
	}
	return r.validateStepRunner(engineConfig.EngineType, profile, stepInputs, stepIndex)
}

func (r *Runtime) prepareStepValidation(step Step, stepIndex int, chainInputs map[string]any) (agentruns.EngineConfig, map[string]any, agentprofiles.Profile, error) {
	engineConfig, err := r.engines.Get(step.EngineConfigID)
	if err != nil {
		return agentruns.EngineConfig{}, nil, agentprofiles.Profile{}, err
	}
	profile, err := r.resolveStepProfile(step)
	if err != nil {
		return agentruns.EngineConfig{}, nil, agentprofiles.Profile{}, err
	}
	stepInputs, err := r.buildStepInputs(step, stepIndex, "validation-run", chainInputs, nil)
	if err != nil {
		return agentruns.EngineConfig{}, nil, agentprofiles.Profile{}, err
	}
	return engineConfig, stepInputs, profile, nil
}

func (r *Runtime) validateStepRunner(engineType agentruns.EngineType, profile agentprofiles.Profile, stepInputs map[string]any, stepIndex int) error {
	switch engineType {
	case agentruns.EngineTypeSettaLLM:
		if r.managed == nil {
			return ErrManagedRuntimeRequired
		}
		if r.managed.Disabled() {
			return ErrManagedRuntimeUnavailable
		}
		return r.validateManagedStepInputs(stepInputs)
	case agentruns.EngineTypeExternalAgent:
		if r.external == nil || r.external.Disabled() {
			return ErrExternalRuntimeUnavailable
		}
		if err := r.external.ValidateRun(profile, stepInputs); err != nil {
			return normalizeExternalValidationError(err)
		}
		return nil
	default:
		return fmt.Errorf("%w: run chain step %d uses unsupported engine type %q", ErrSupportedStepEngineRequired, stepIndex, engineType)
	}
}

func (r *Runtime) cancelChainIfContextDone(ctx context.Context, runID string) bool {
	if ctx.Err() == nil {
		return false
	}
	_, _ = r.markCancelled(runID)
	return true
}

func (r *Runtime) startChainStep(
	ctx context.Context,
	runID string,
	step Step,
	stepIndex int,
	chainInputs map[string]any,
	stepSummaries []map[string]any,
) (agentruns.Run, error) {
	if err := r.appendStepStartedEvent(runID, step, stepIndex); err != nil {
		return agentruns.Run{}, err
	}
	return r.runStep(ctx, step, stepIndex, runID, chainInputs, stepSummaries)
}

func (r *Runtime) appendStepStartedEvent(runID string, step Step, stepIndex int) error {
	return r.appendEvent(runID, "step_started", map[string]any{
		"stepIndex":      stepIndex,
		"stepId":         step.ID,
		"engineConfigId": step.EngineConfigID,
		"agentProfileId": derefString(step.AgentProfileID),
	})
}

func (r *Runtime) cancelChainIfStepRunStopped(ctx context.Context, runID string, err error) bool {
	if ctx.Err() == nil && !errors.Is(err, context.Canceled) {
		return false
	}
	_, _ = r.markCancelled(runID)
	return true
}

func (r *Runtime) failChainWithError(runID string, err error) {
	_, _ = r.markFailed(runID, map[string]any{"error": err.Error()})
}

func (r *Runtime) finishChainAfterStep(runID string, spec Spec, step Step, stepIndex int, childRun agentruns.Run) bool {
	if childRun.Status == agentruns.RunStatusCompleted {
		if err := r.appendStepFinishedEvent(runID, "step_completed", step, stepIndex, childRun); err != nil {
			r.failChainWithError(runID, err)
			return true
		}
		return false
	}
	if err := r.appendStepFinishedEvent(runID, "step_failed", step, stepIndex, childRun); err != nil {
		r.failChainWithError(runID, err)
		return true
	}
	if !spec.StopOnFailure {
		return false
	}
	if childRun.Status == agentruns.RunStatusCancelled {
		_, _ = r.markCancelled(runID)
		return true
	}
	_, _ = r.markFailed(runID, map[string]any{})
	return true
}

func (r *Runtime) appendStepFinishedEvent(runID string, eventType string, step Step, stepIndex int, childRun agentruns.Run) error {
	return r.appendEvent(runID, eventType, map[string]any{
		"stepIndex": stepIndex,
		"stepId":    step.ID,
		"runId":     childRun.ID,
		"status":    string(childRun.Status),
	})
}

func validateSupportedStepEngine(stepID string, engineType agentruns.EngineType) error {
	switch engineType {
	case agentruns.EngineTypeSettaLLM, agentruns.EngineTypeExternalAgent:
		return nil
	default:
		return fmt.Errorf("%w: step %q uses unsupported engine type %q", ErrSupportedStepEngineRequired, stepID, engineType)
	}
}

func (r *Runtime) prepareStepRun(
	step Step,
	stepIndex int,
	chainRunID string,
	chainInputs map[string]any,
	previousOutputs []map[string]any,
) (agentprofiles.Profile, map[string]any, error) {
	inputs, err := r.buildStepInputs(step, stepIndex, chainRunID, chainInputs, previousOutputs)
	if err != nil {
		return agentprofiles.Profile{}, nil, err
	}
	profile, err := r.resolveStepProfile(step)
	if err != nil {
		return agentprofiles.Profile{}, nil, err
	}
	profile.EngineConfigID = cloneStringPtr(&step.EngineConfigID)
	return profile, inputs, nil
}

func (r *Runtime) startStepRun(
	ctx context.Context,
	chainRunID string,
	engineType agentruns.EngineType,
	profile agentprofiles.Profile,
	inputs map[string]any,
	step Step,
) (agentruns.Run, error) {
	switch engineType {
	case agentruns.EngineTypeSettaLLM:
		return r.startManagedStepRun(ctx, chainRunID, profile, inputs)
	case agentruns.EngineTypeExternalAgent:
		return r.startExternalStepRun(ctx, chainRunID, profile, inputs)
	default:
		return agentruns.Run{}, fmt.Errorf("%w: step %q uses unsupported engine type %q", ErrSupportedStepEngineRequired, step.ID, engineType)
	}
}

func (r *Runtime) startManagedStepRun(ctx context.Context, chainRunID string, profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
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
}

func (r *Runtime) startExternalStepRun(ctx context.Context, chainRunID string, profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
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
}

func cloneChainStepInputs(chainInputs map[string]any) map[string]any {
	payloadInputs := map[string]any{}
	for _, key := range chainInputKeys {
		copyStepInputValue(payloadInputs, chainInputs, key)
	}
	copyStepInputValue(payloadInputs, chainInputs, "chainId")
	copyStepInputValue(payloadInputs, chainInputs, "chainName")
	return payloadInputs
}

func copyStepInputValue(target map[string]any, source map[string]any, key string) {
	if value, ok := source[key]; ok {
		target[key] = deepCloneJSONValue(value)
	}
}

func mergeStepInputOverrides(payloadInputs map[string]any, stepInputs map[string]any) {
	for key, value := range stepInputs {
		payloadInputs[key] = deepCloneJSONValue(value)
	}
}

func ensureUnscopedStepInputs(payloadInputs map[string]any) {
	if _, ok := payloadInputs["sectionId"]; ok {
		return
	}
	if _, ok := payloadInputs["allowUnscoped"]; ok {
		return
	}
	payloadInputs["allowUnscoped"] = true
}

func validateStepEngineInput(payloadInputs map[string]any, engineConfigID string) error {
	rawEngineConfigID, ok := payloadInputs["engineConfigId"]
	if !ok {
		return nil
	}
	typedEngineConfigID, ok := rawEngineConfigID.(string)
	if !ok {
		return fmt.Errorf("%w: engineConfigId must be a string", ErrInvalidRunChainInput)
	}
	if strings.TrimSpace(typedEngineConfigID) != engineConfigID {
		return fmt.Errorf("%w: engineConfigId does not match run chain step engine config", ErrInvalidRunChainInput)
	}
	return nil
}

func attachStepRuntimeInputs(payloadInputs map[string]any, step Step, stepIndex int, chainRunID string, previousOutputs []map[string]any) {
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
}

func applyOptionalStepPrompt(payloadInputs map[string]any, step Step) {
	if step.Prompt == nil || strings.TrimSpace(*step.Prompt) == "" {
		return
	}
	if _, exists := payloadInputs["prompt"]; exists {
		return
	}
	payloadInputs["prompt"] = *step.Prompt
}

func applyOptionalStepMessages(payloadInputs map[string]any, step Step) {
	if len(step.Messages) == 0 {
		return
	}
	if _, exists := payloadInputs["messages"]; exists {
		return
	}
	payloadInputs["messages"] = messagesToAnySlice(step.Messages)
}

func prependPreviousOutputsContext(payloadInputs map[string]any, step Step, previousOutputs []map[string]any) error {
	if !step.IncludePreviousOutputs || len(previousOutputs) == 0 {
		return nil
	}
	contextMessage, err := buildPreviousOutputsMessage(previousOutputs)
	if err != nil {
		return err
	}
	messages := messagesFromValue(payloadInputs["messages"])
	messages = append([]any{contextMessage}, messages...)
	payloadInputs["messages"] = messages
	return nil
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
	project, err := r.managedStepProject(inputs)
	if err != nil {
		return err
	}
	if err := validateOptionalStringInput(inputs, "chatId"); err != nil {
		return err
	}
	sectionID, err := optionalTrimmedStringInput(inputs, "sectionId")
	if err != nil {
		return err
	}
	allowUnscoped, err := optionalBoolInputValue(inputs, "allowUnscoped")
	if err != nil {
		return err
	}
	if err := validateManagedStepScope(project, sectionID, allowUnscoped); err != nil {
		return err
	}
	if err := validateOptionalBoolInput(inputs, "thinking"); err != nil {
		return err
	}
	if err := validateOptionalStringInput(inputs, "prompt"); err != nil {
		return err
	}
	return validateOptionalMessagesInput(inputs)
}

func (r *Runtime) managedStepProject(inputs map[string]any) (projectstate.Project, error) {
	projectSnapshot := r.projectState.Snapshot().Document
	defaultProjectID := strings.TrimSpace(projectSnapshot.DefaultProjectID)
	if defaultProjectID == "" {
		return projectstate.Project{}, fmt.Errorf("%w: project state does not define a default project config", ErrInvalidRunChainInput)
	}
	projectConfigID := defaultProjectID
	configuredProjectID, err := optionalTrimmedStringInput(inputs, "projectConfigId")
	if err != nil {
		return projectstate.Project{}, err
	}
	if configuredProjectID != nil {
		projectConfigID = *configuredProjectID
	}
	project, err := projectSnapshot.ProjectByID(projectConfigID)
	if err != nil {
		return projectstate.Project{}, fmt.Errorf("%w: %v", ErrInvalidRunChainInput, err)
	}
	return project, nil
}

func validateManagedStepScope(project projectstate.Project, sectionID *string, allowUnscoped bool) error {
	if sectionID == nil {
		if allowUnscoped {
			return nil
		}
		return fmt.Errorf("%w: sectionId is required unless allowUnscoped is true.", ErrInvalidRunChainInput)
	}
	if allowUnscoped {
		return fmt.Errorf("%w: allowUnscoped requires sectionId to be omitted.", ErrInvalidRunChainInput)
	}
	if _, _, _, err := project.ResolveSection(*sectionID); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidRunChainInput, err)
	}
	return nil
}

func optionalTrimmedStringInput(inputs map[string]any, key string) (*string, error) {
	value, err := optionalStringInput(inputs, key)
	if err != nil || value == nil {
		return value, err
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed, nil
}

func optionalStringInput(inputs map[string]any, key string) (*string, error) {
	rawValue, ok := inputs[key]
	if !ok {
		return nil, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil, fmt.Errorf("%w: %s must be a string", ErrInvalidRunChainInput, key)
	}
	return &value, nil
}

func validateOptionalStringInput(inputs map[string]any, key string) error {
	_, err := optionalStringInput(inputs, key)
	return err
}

func optionalBoolInputValue(inputs map[string]any, key string) (bool, error) {
	rawValue, ok := inputs[key]
	if !ok {
		return false, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, fmt.Errorf("%w: %s must be a boolean", ErrInvalidRunChainInput, key)
	}
	return value, nil
}

func validateOptionalBoolInput(inputs map[string]any, key string) error {
	_, err := optionalBoolInputValue(inputs, key)
	return err
}

func validateOptionalMessagesInput(inputs map[string]any) error {
	rawMessages, ok := inputs["messages"]
	if !ok {
		return nil
	}
	switch rawMessages.(type) {
	case []any, []map[string]any:
		return nil
	default:
		return fmt.Errorf("%w: messages must be a list", ErrInvalidRunChainInput)
	}
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
