package narration

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/conversation"
)

type FailureKind string

const (
	FailureKindProviderUnavailable   FailureKind = "provider_unavailable"
	FailureKindProviderOutputInvalid FailureKind = "provider_output_invalid"
	FailureKindConfigurationInvalid  FailureKind = "configuration_invalid"
	FailureKindContextBudgetExceeded FailureKind = "context_budget_exceeded"
	FailureKindStateUnavailable      FailureKind = "state_unavailable"
	FailureKindStateCorrupt          FailureKind = "state_corrupt"
	FailureKindInternal              FailureKind = "internal_error"

	initialRetryDelay = time.Second
	secondRetryDelay  = 5 * time.Second
	finalRetryDelay   = 30 * time.Second
)

// AttemptFailure assigns failure semantics at the boundary that observed the
// failure. Consumers match this type or other typed repository errors; they do
// not inspect error text to guess whether an operation is recoverable.
type AttemptFailure struct {
	Kind FailureKind
	Err  error
}

func NewAttemptFailure(kind FailureKind, err error) *AttemptFailure {
	return &AttemptFailure{Kind: kind, Err: err}
}

func (failure *AttemptFailure) Error() string {
	if failure == nil {
		return "narrator attempt failed"
	}
	if failure.Err == nil {
		return fmt.Sprintf("narrator attempt failed: %s", failure.Kind)
	}
	return fmt.Sprintf("narrator attempt failed: %s: %v", failure.Kind, failure.Err)
}

func (failure *AttemptFailure) Unwrap() error {
	if failure == nil {
		return nil
	}
	return failure.Err
}

func (failure *AttemptFailure) Validate() error {
	if failure == nil {
		return errors.New("narrator attempt failure is required")
	}
	if _, ok := failureSpecForKind(failure.Kind); !ok {
		return fmt.Errorf("unsupported narrator failure kind %q", failure.Kind)
	}
	if failure.Err == nil {
		return errors.New("narrator attempt failure cause is required")
	}
	return nil
}

type failureSpec struct {
	code      string
	message   string
	retryable bool
}

func failureSpecForKind(kind FailureKind) (failureSpec, bool) {
	switch kind {
	case FailureKindProviderUnavailable:
		return failureSpec{
			code:      string(FailureKindProviderUnavailable),
			message:   "Narration is temporarily unavailable.",
			retryable: true,
		}, true
	case FailureKindProviderOutputInvalid:
		return failureSpec{
			code:      string(FailureKindProviderOutputInvalid),
			message:   "Narration returned an invalid response and is temporarily unavailable.",
			retryable: true,
		}, true
	case FailureKindConfigurationInvalid:
		return failureSpec{
			code:    string(FailureKindConfigurationInvalid),
			message: "Narration is unavailable because its model configuration is invalid.",
		}, true
	case FailureKindContextBudgetExceeded:
		return failureSpec{
			code:    string(FailureKindContextBudgetExceeded),
			message: "Narration is unavailable because its required context exceeds the configured budget.",
		}, true
	case FailureKindStateUnavailable:
		return failureSpec{
			code:      string(FailureKindStateUnavailable),
			message:   "Narration state is temporarily unavailable.",
			retryable: true,
		}, true
	case FailureKindStateCorrupt:
		return failureSpec{
			code:    string(FailureKindStateCorrupt),
			message: "Narration is unavailable because its durable state is invalid.",
		}, true
	case FailureKindInternal:
		return failureSpec{
			code:    string(FailureKindInternal),
			message: "Narration is unavailable because an internal narrator contract failed.",
		}, true
	default:
		return failureSpec{}, false
	}
}

// RetryPolicy is a finite sequence of delays. RetryAttempt on the request
// indexes this sequence, making exhaustion explicit and preventing tight or
// unbounded retry loops.
type RetryPolicy struct {
	Delays []time.Duration
}

func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{Delays: []time.Duration{
		initialRetryDelay,
		secondRetryDelay,
		finalRetryDelay,
	}}
}

func (policy RetryPolicy) Validate() error {
	if policy.Delays == nil {
		return errors.New("narrator retry delays must be an array, not nil")
	}
	for index, delay := range policy.Delays {
		if delay <= 0 {
			return fmt.Errorf("narrator retry delay %d must be positive: %s", index, delay)
		}
	}
	return nil
}

type NarratorFailureStore interface {
	ReadNarratorState(context.Context, string) (conversation.NarratorState, error)
	CommitNarratorDegradation(
		context.Context,
		conversation.NarratorDegradationCommit,
	) (conversation.NarratorState, error)
}

var _ NarratorFailureStore = (*conversation.Store)(nil)

type FailureHandlerOption func(*failureHandlerConfig) error

type failureHandlerConfig struct {
	newID       func(string) (string, error)
	now         func() time.Time
	retryPolicy RetryPolicy
}

func WithFailureHandlerIDGenerator(generator func(string) (string, error)) FailureHandlerOption {
	return func(config *failureHandlerConfig) error {
		if generator == nil {
			return errors.New("narrator failure id generator is required")
		}
		config.newID = generator
		return nil
	}
}

func WithFailureHandlerClock(now func() time.Time) FailureHandlerOption {
	return func(config *failureHandlerConfig) error {
		if now == nil {
			return errors.New("narrator failure clock is required")
		}
		config.now = now
		return nil
	}
}

func WithFailureRetryPolicy(policy RetryPolicy) FailureHandlerOption {
	return func(config *failureHandlerConfig) error {
		if err := policy.Validate(); err != nil {
			return err
		}
		config.retryPolicy = RetryPolicy{Delays: append([]time.Duration{}, policy.Delays...)}
		return nil
	}
}

type FailureHandler struct {
	store       NarratorFailureStore
	newID       func(string) (string, error)
	now         func() time.Time
	retryPolicy RetryPolicy
}

func NewFailureHandler(
	store NarratorFailureStore,
	options ...FailureHandlerOption,
) (*FailureHandler, error) {
	if store == nil {
		return nil, errors.New("narrator failure store is required")
	}
	config := failureHandlerConfig{
		newID:       randomOutputID,
		now:         time.Now,
		retryPolicy: DefaultRetryPolicy(),
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("narrator failure handler option must not be nil")
		}
		if err := option(&config); err != nil {
			return nil, err
		}
	}
	return &FailureHandler{
		store:       store,
		newID:       config.newID,
		now:         config.now,
		retryPolicy: config.retryPolicy,
	}, nil
}

// DegradedError is returned to the submitting boundary only after the typed
// degraded state commits. The cause remains available for diagnostics while
// callers can present the safe degradation message and reference.
type DegradedError struct {
	RequestID   string
	Generation  uint64
	Degradation conversation.NarratorDegradation
	Cause       error
}

func (err *DegradedError) Error() string {
	if err == nil {
		return "narration is unavailable"
	}
	return fmt.Sprintf(
		"%s (diagnostic %s)",
		err.Degradation.Message,
		err.Degradation.DiagnosticReference,
	)
}

func (err *DegradedError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Cause
}

// Prepare converts one explicitly classified attempt failure into a bounded
// degradation commit and optional actor retry. It performs only a durable
// state read while preparing; the returned commit owns the write.
func (handler *FailureHandler) Prepare(
	ctx context.Context,
	invocation Invocation,
	cause error,
) (PreparedWork, error) {
	if err := validateFailurePreparation(handler, ctx, invocation, cause); err != nil {
		return PreparedWork{}, err
	}
	kind, err := classifyFailure(cause)
	if err != nil {
		return PreparedWork{}, err
	}
	spec, _ := failureSpecForKind(kind)
	state, err := handler.store.ReadNarratorState(ctx, invocation.Request.ConversationID)
	if err != nil {
		return PreparedWork{}, fmt.Errorf("read narrator state before degradation: %w", err)
	}
	degradedAt, err := failureTimestamp(state.UpdatedAt, handler.now())
	if err != nil {
		return PreparedWork{}, err
	}
	diagnosticID, err := handler.newID("narrator_diagnostic")
	if err != nil {
		return PreparedWork{}, err
	}
	eventID, err := handler.newID("conversation_event")
	if err != nil {
		return PreparedWork{}, err
	}
	degradation := conversation.NarratorDegradation{
		Code:                spec.code,
		Message:             spec.message,
		Retryable:           spec.retryable,
		DiagnosticReference: diagnosticID,
		DegradedAt:          degradedAt,
	}
	commit := conversation.NarratorDegradationCommit{
		ConversationID:   invocation.Request.ConversationID,
		Expected:         narratorStateExpectation(narratorCursor(state)),
		Degradation:      degradation,
		CommittedEventID: eventID,
		CommittedAt:      degradedAt,
	}
	if err := commit.Validate(); err != nil {
		return PreparedWork{}, err
	}
	retry, err := handler.retryDirective(invocation.Request, degradation)
	if err != nil {
		return PreparedWork{}, err
	}
	return PreparedWork{
		Commit: func(ctx context.Context) error {
			_, err := handler.store.CommitNarratorDegradation(ctx, commit)
			return err
		},
		CompletionError: &DegradedError{
			RequestID:   invocation.Request.ID,
			Generation:  invocation.Generation,
			Degradation: degradation,
			Cause:       cause,
		},
		Retry: retry,
	}, nil
}

func validateFailurePreparation(
	handler *FailureHandler,
	ctx context.Context,
	invocation Invocation,
	cause error,
) error {
	if handler == nil || handler.store == nil || handler.newID == nil || handler.now == nil {
		return errors.New("narrator failure handler is required")
	}
	if ctx == nil {
		return errors.New("narrator failure context is required")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := invocation.Request.Validate(); err != nil {
		return err
	}
	if invocation.Generation == 0 {
		return errors.New("narrator failure generation must be positive")
	}
	if cause == nil {
		return errors.New("narrator failure cause is required")
	}
	return nil
}

func classifyFailure(err error) (FailureKind, error) {
	kind, classified, classificationErr := classifyTypedFailure(err)
	if classificationErr != nil {
		return "", classificationErr
	}
	if classified {
		return kind, nil
	}
	return FailureKindInternal, nil
}

// classifyTypedFailure recognizes only explicit stage assignments and
// repository-owned error types. Callers that own a more specific stage may use
// the boolean to apply that stage's fallback without inspecting error text.
func classifyTypedFailure(err error) (FailureKind, bool, error) {
	var attempt *AttemptFailure
	if errors.As(err, &attempt) {
		if validationErr := attempt.Validate(); validationErr != nil {
			return "", false, validationErr
		}
		return attempt.Kind, true, nil
	}
	var budget *ContextBudgetError
	if errors.As(err, &budget) {
		return FailureKindContextBudgetExceeded, true, nil
	}
	if conversation.IsCorruptStateError(err) {
		return FailureKindStateCorrupt, true, nil
	}
	if conversation.IsPersistenceError(err) ||
		errors.Is(err, conversation.ErrStoreClosed) ||
		conversation.IsStateConflict(err) ||
		conversation.IsWriteOutcome(err, conversation.WriteOutcomeSaturated) ||
		conversation.IsWriteOutcome(err, conversation.WriteOutcomeStoreClosed) {
		return FailureKindStateUnavailable, true, nil
	}
	return "", false, nil
}

func failureTimestamp(previous string, candidate time.Time) (string, error) {
	previousTime, err := canonicalNarratorTime("narrator failure previous updatedAt", previous)
	if err != nil {
		return "", err
	}
	candidate = candidate.UTC()
	if !candidate.After(previousTime) {
		candidate = previousTime.Add(time.Nanosecond)
	}
	return candidate.Format(time.RFC3339Nano), nil
}

func (handler *FailureHandler) retryDirective(
	request Request,
	degradation conversation.NarratorDegradation,
) (*RetryDirective, error) {
	if !degradation.Retryable || request.Kind == RequestKindStatus ||
		request.RetryAttempt >= len(handler.retryPolicy.Delays) {
		return nil, nil
	}
	retryID, err := handler.newID("narrator_retry")
	if err != nil {
		return nil, err
	}
	retry := request
	retry.ID = retryID
	retry.RecoverableRetry = true
	retry.RetryAttempt++
	return &RetryDirective{
		Request: retry,
		After:   handler.retryPolicy.Delays[request.RetryAttempt],
	}, nil
}

// AttemptWorker performs the provider/context/output attempt and returns only
// the bounded success commit. ResilientWorker owns all degradation behavior so
// individual attempt implementations cannot drift into ad hoc retry rules.
type AttemptWorker interface {
	PrepareAttempt(context.Context, Invocation) (PreparedCommit, error)
}

type ResilientWorker struct {
	attempts AttemptWorker
	failures *FailureHandler
}

func NewResilientWorker(attempts AttemptWorker, failures *FailureHandler) (*ResilientWorker, error) {
	if attempts == nil || failures == nil {
		return nil, errors.New("resilient narrator worker requires attempt worker and failure handler")
	}
	return &ResilientWorker{attempts: attempts, failures: failures}, nil
}

func (worker *ResilientWorker) Prepare(
	ctx context.Context,
	invocation Invocation,
) (PreparedWork, error) {
	if worker == nil || worker.attempts == nil || worker.failures == nil {
		return PreparedWork{}, errors.New("resilient narrator worker is required")
	}
	commit, err := worker.attempts.PrepareAttempt(ctx, invocation)
	if err == nil {
		if commit == nil {
			return PreparedWork{}, errors.New("narrator attempt worker returned no commit")
		}
		return PreparedWork{Commit: commit}, nil
	}
	if ctx != nil && ctx.Err() != nil {
		return PreparedWork{}, ctx.Err()
	}
	if errors.Is(err, context.Canceled) {
		return PreparedWork{}, err
	}
	return worker.failures.Prepare(ctx, invocation, err)
}
