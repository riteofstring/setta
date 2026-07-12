package master

import (
	"errors"
	"fmt"
	"time"
)

type masterRouteAttemptState struct {
	session      *Session
	materialized *RouteContextMaterialization
	call         *RouteCallResult
}

type masterRouteAttemptError struct {
	state masterRouteAttemptState
	cause error
}

func (err *masterRouteAttemptError) Error() string {
	return err.cause.Error()
}

func (err *masterRouteAttemptError) Unwrap() error {
	return err.cause
}

func (active *activeRouteInput) setAttemptSession(session Session) {
	active.stateMu.Lock()
	defer active.stateMu.Unlock()
	cloned := CloneSession(session)
	active.state.session = &cloned
}

func (active *activeRouteInput) setAttemptMaterialization(materialized RouteContextMaterialization) {
	active.stateMu.Lock()
	defer active.stateMu.Unlock()
	cloned := cloneRouteContextMaterializationForAttempt(materialized)
	active.state.materialized = &cloned
}

func (active *activeRouteInput) setAttemptCall(call RouteCallResult) {
	active.stateMu.Lock()
	defer active.stateMu.Unlock()
	cloned := cloneRouteCallResultForAttempt(call)
	active.state.call = &cloned
}

func (active *activeRouteInput) snapshotAttemptState() masterRouteAttemptState {
	active.stateMu.Lock()
	defer active.stateMu.Unlock()
	return cloneMasterRouteAttemptState(active.state)
}

func cloneMasterRouteAttemptState(state masterRouteAttemptState) masterRouteAttemptState {
	cloned := masterRouteAttemptState{}
	if state.session != nil {
		session := CloneSession(*state.session)
		cloned.session = &session
	}
	if state.materialized != nil {
		materialized := cloneRouteContextMaterializationForAttempt(*state.materialized)
		cloned.materialized = &materialized
	}
	if state.call != nil {
		call := cloneRouteCallResultForAttempt(*state.call)
		cloned.call = &call
	}
	return cloned
}

func cloneRouteContextMaterializationForAttempt(value RouteContextMaterialization) RouteContextMaterialization {
	cloned := value
	cloned.Audit = cloneRouteContextAudit(value.Audit)
	cloned.Input = append([]byte{}, value.Input...)
	return cloned
}

func cloneRouteCallResultForAttempt(value RouteCallResult) RouteCallResult {
	value.Session = CloneSession(value.Session)
	value.StructuredOutput = append([]byte{}, value.StructuredOutput...)
	value.Decision = cloneRouteDecision(value.Decision)
	return value
}

func successfulMasterRouteAttempt(
	work InputRoutingWork,
	materialized RouteContextMaterialization,
	call RouteCallResult,
	invocation RouteInvocationAudit,
) RouteInvocationAttempt {
	sessionID := call.Session.ID
	contextAudit := cloneRouteContextAudit(materialized.Audit)
	configuration := cloneRouteModelConfigurationAudit(invocation.Configuration)
	requestID := call.RequestID
	threadID := call.ProviderThreadID
	turnID := call.ProviderTurnID
	decisionKind := call.Decision.Kind
	return RouteInvocationAttempt{
		ID:                call.RequestID,
		CallKind:          RouteInvocationCallRoute,
		MasterSessionID:   &sessionID,
		InputID:           work.Input.Input.ID,
		RoutingAttempt:    work.RoutingAttempt,
		Context:           &contextAudit,
		Configuration:     &configuration,
		ProviderRequestID: &requestID,
		ProviderThreadID:  &threadID,
		ProviderTurnID:    &turnID,
		InputBytes:        call.InputBytes,
		OutputBytes:       call.OutputBytes,
		StartedAt:         call.StartedAt,
		EndedAt:           call.EndedAt,
		DecisionKind:      &decisionKind,
		ValidationResult:  RouteInvocationValidationPassed,
		CommitDecision:    RouteInvocationCommitOutput,
		Outcome:           RouteInvocationOutcomeCompleted,
	}
}

func failedMasterRouteAttempt(
	work InputRoutingWork,
	cause error,
	failure RouteFailure,
	failedAt string,
) (RouteInvocationAttempt, error) {
	state := masterRouteAttemptState{}
	var attemptError *masterRouteAttemptError
	if errors.As(cause, &attemptError) {
		state = attemptError.state
	}
	attempt, err := terminalMasterRouteAttempt(work, state, failedAt)
	if err != nil {
		return RouteInvocationAttempt{}, err
	}
	attempt.Outcome = RouteInvocationOutcomeFailed
	attempt.CommitDecision = RouteInvocationCommitFailure
	attempt.Failure = &failure
	if err := attempt.Validate(); err != nil {
		return RouteInvocationAttempt{}, fmt.Errorf("build failed master route invocation attempt: %w", err)
	}
	return attempt, nil
}

func cancelledMasterRouteAttempt(
	work InputRoutingWork,
	state masterRouteAttemptState,
	cancelledAt string,
) (RouteInvocationAttempt, error) {
	attempt, err := terminalMasterRouteAttempt(work, state, cancelledAt)
	if err != nil {
		return RouteInvocationAttempt{}, err
	}
	attempt.Outcome = RouteInvocationOutcomeCancelled
	attempt.CommitDecision = RouteInvocationCommitCancel
	if err := attempt.Validate(); err != nil {
		return RouteInvocationAttempt{}, fmt.Errorf("build cancelled master route invocation attempt: %w", err)
	}
	return attempt, nil
}

func terminalMasterRouteAttempt(
	work InputRoutingWork,
	state masterRouteAttemptState,
	endedAt string,
) (RouteInvocationAttempt, error) {
	call := terminalMasterRouteCall(state.call)
	startedAt, err := terminalMasterRouteStartedAt(work.RoutingStartedAt, call.StartedAt, endedAt)
	if err != nil {
		return RouteInvocationAttempt{}, err
	}
	attempt := RouteInvocationAttempt{
		ID:               terminalMasterRouteAttemptID(work, call),
		CallKind:         RouteInvocationCallRoute,
		InputID:          work.Input.Input.ID,
		RoutingAttempt:   work.RoutingAttempt,
		InputBytes:       call.InputBytes,
		OutputBytes:      call.OutputBytes,
		StartedAt:        startedAt,
		EndedAt:          endedAt,
		ValidationResult: masterRouteAttemptValidation(call),
	}
	applyMasterRouteAttemptMaterialization(&attempt, state.materialized)
	if err := applyMasterRouteAttemptConfiguration(&attempt, state.session, call); err != nil {
		return RouteInvocationAttempt{}, err
	}
	applyMasterRouteAttemptResult(&attempt, call)
	return attempt, nil
}

func terminalMasterRouteCall(call *RouteCallResult) RouteCallResult {
	if call == nil {
		return RouteCallResult{}
	}
	return *call
}

func terminalMasterRouteAttemptID(work InputRoutingWork, call RouteCallResult) string {
	if call.RequestID != "" {
		return call.RequestID
	}
	return fmt.Sprintf("master-route-attempt:%s:%d", work.Input.Input.ID, work.RoutingAttempt)
}

func terminalMasterRouteStartedAt(
	fallback string,
	callStartedAt string,
	endedAt string,
) (string, error) {
	if callStartedAt == "" {
		return fallback, nil
	}
	callStarted, parseErr := time.Parse(time.RFC3339Nano, callStartedAt)
	ended, endErr := time.Parse(time.RFC3339Nano, endedAt)
	if parseErr != nil || endErr != nil {
		return "", errors.Join(parseErr, endErr)
	}
	if callStarted.After(ended) {
		return fallback, nil
	}
	return callStartedAt, nil
}

func applyMasterRouteAttemptMaterialization(
	attempt *RouteInvocationAttempt,
	materialized *RouteContextMaterialization,
) {
	if materialized == nil {
		return
	}
	contextAudit := cloneRouteContextAudit(materialized.Audit)
	attempt.Context = &contextAudit
	attempt.InputBytes = len(materialized.Input)
	sessionID := materialized.Bundle.SessionID
	attempt.MasterSessionID = &sessionID
}

func applyMasterRouteAttemptConfiguration(
	attempt *RouteInvocationAttempt,
	session *Session,
	call RouteCallResult,
) error {
	configurationSession := session
	if call.Session.ID != "" {
		configurationSession = &call.Session
	}
	if configurationSession == nil {
		return nil
	}
	configuration, err := NewRouteModelConfigurationAudit(configurationSession.Configuration)
	if err != nil {
		return err
	}
	attempt.Configuration = &configuration
	applyMasterRouteAttemptSession(attempt, *configurationSession)
	return nil
}

func applyMasterRouteAttemptSession(attempt *RouteInvocationAttempt, session Session) {
	if attempt.MasterSessionID == nil {
		sessionID := session.ID
		attempt.MasterSessionID = &sessionID
	}
	if session.ProviderThreadID != nil {
		attempt.ProviderThreadID = cloneString(session.ProviderThreadID)
	}
}

func applyMasterRouteAttemptResult(attempt *RouteInvocationAttempt, call RouteCallResult) {
	if call.RequestID != "" {
		attempt.ProviderRequestID = stringPointer(call.RequestID)
	}
	if call.ProviderThreadID != "" {
		attempt.ProviderThreadID = stringPointer(call.ProviderThreadID)
	}
	if call.ProviderTurnID != "" {
		attempt.ProviderTurnID = stringPointer(call.ProviderTurnID)
	}
	if call.Decision.Kind != "" {
		decisionKind := call.Decision.Kind
		attempt.DecisionKind = &decisionKind
	}
}

func masterRouteAttemptValidation(call RouteCallResult) RouteInvocationValidationResult {
	if call.Decision.Kind != "" {
		return RouteInvocationValidationPassed
	}
	if len(call.StructuredOutput) > 0 {
		return RouteInvocationValidationFailed
	}
	return RouteInvocationValidationNotRun
}

func stringPointer(value string) *string {
	return &value
}
