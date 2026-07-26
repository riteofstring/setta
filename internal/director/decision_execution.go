package director

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Carrying out one authorized Director decision.
//
// A Setta tool call is authorized against the registry and then arrives here.
// This turns it into the work it describes, and it is the only place in the
// Director that both writes durable facts and calls the execution port.
//
// Two orderings are load-bearing:
//
//   - The decision is committed before the work it authorizes. It is the fact
//     the graph explains that work with, and a create decision names a
//     workstream that does not exist until execution starts it. Work that then
//     fails to start leaves a decision the app truthfully made and an error the
//     caller receives, rather than a silent gap.
//   - Work that declared it needs the user's own files, on a workstream with no
//     folder, becomes a durable resource request instead of an error. A
//     folderless workstream is a first-class workstream: it exists, it is
//     selectable, and it runs everything that does not need the user's files.
//     Only the work that does is what waits, and that is the affordance the pane
//     world could only derive from a routing failure code.
//
// The Director's reply is not a decision. It is durable once, in the Director
// conversation, because prose is what the user was told and never proof that
// app state changed.

// resourceRequestSummaries are the public sentences a blocked-on-resource
// workstream shows. They are keyed by the typed resource kind rather than
// written from an execution error, so no provider or filesystem text reaches
// the user.
var resourceRequestSummaries = map[WorkstreamResourceKind]string{
	WorkstreamResourceKindFolder: "Waiting for a project folder before this work can start.",
}

// AuthorizedDecision is one Setta tool call the registry authorized. The
// context it was authorized against travels with it, because the durable fact
// the executor commits is derived from the same trusted state that allowed the
// call rather than from the call's own arguments.
type AuthorizedDecision struct {
	Intent   SubmittedIntent
	Context  DirectorDecisionContext
	Decision DirectorDecision
}

// ExecutedDecision is what carrying out one authorized decision produced. It is
// a receipt, not state: every durable change reaches the shell through the same
// pushed stream as every other change.
type ExecutedDecision struct {
	IntentID string               `json:"intentId"`
	Decision DirectorDecisionKind `json:"decision"`
	// Summary is the public sentence the durable decision committed. It is
	// derived from trusted state, so it is safe to show the user and safe to
	// hand back to the Director as the receipt for its own call.
	Summary string `json:"summary"`
	// WorkstreamID is the workstream the call acted on or created.
	WorkstreamID *string `json:"workstreamId"`
	// SelectedWorkstreamID is the app-wide selection after the call, populated
	// exactly when the call moved it.
	SelectedWorkstreamID *string `json:"selectedWorkstreamId"`
	// ResourceRequestID names the durable request the work is waiting on, when
	// the workstream could not start it yet.
	ResourceRequestID *string `json:"resourceRequestId"`
	// WorkspaceRequirement is what the delivered work declared it needs from the
	// user's files, populated exactly when the call delivered work.
	WorkspaceRequirement *WorkspaceRequirement `json:"workspaceRequirement"`
}

// Validate proves the receipt describes something the app could actually have
// done.
func (executed ExecutedDecision) Validate() error {
	if err := validateIdentifier("executed decision intent id", executed.IntentID); err != nil {
		return err
	}
	if !isDirectorDecisionKind(executed.Decision) {
		return fmt.Errorf("unknown director decision kind %q", executed.Decision)
	}
	if err := validateTrimmedText("executed decision summary", executed.Summary); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("executed decision workstream id", executed.WorkstreamID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier(
		"executed decision selected workstream id",
		executed.SelectedWorkstreamID,
	); err != nil {
		return err
	}
	if executed.WorkspaceRequirement != nil && !isWorkspaceRequirement(*executed.WorkspaceRequirement) {
		return fmt.Errorf(
			"executed decision declares unknown workspace requirement %q",
			*executed.WorkspaceRequirement,
		)
	}
	return validateOptionalIdentifier(
		"executed decision resource request id",
		executed.ResourceRequestID,
	)
}

// DecisionExecutor carries out authorized Setta tool actions and the commands
// the user dispatches directly.
type DecisionExecutor struct {
	registry      *Registry
	execution     WorkstreamExecution
	now           func() time.Time
	newID         func(string) (string, error)
	resourceMutex sync.Mutex
}

// DecisionExecutorOption configures an executor.
type DecisionExecutorOption func(*DecisionExecutor) error

// WithExecutorClock replaces the clock durable facts are stamped with.
func WithExecutorClock(now func() time.Time) DecisionExecutorOption {
	return func(executor *DecisionExecutor) error {
		if now == nil {
			return errors.New("director decision executor clock must not be nil")
		}
		executor.now = now
		return nil
	}
}

// WithExecutorIdentity replaces the identifier generator for the ids trusted
// code mints.
func WithExecutorIdentity(newID func(string) (string, error)) DecisionExecutorOption {
	return func(executor *DecisionExecutor) error {
		if newID == nil {
			return errors.New("director decision executor identity generator must not be nil")
		}
		executor.newID = newID
		return nil
	}
}

// NewDecisionExecutor builds an executor over the app-scoped registry and the
// execution port.
func NewDecisionExecutor(
	registry *Registry,
	execution WorkstreamExecution,
	options ...DecisionExecutorOption,
) (*DecisionExecutor, error) {
	if registry == nil || execution == nil {
		return nil, errors.New("director decision executor requires the registry and an execution port")
	}
	executor := &DecisionExecutor{
		registry:  registry,
		execution: execution,
		now:       time.Now,
		newID:     randomDirectorFactID,
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("director decision executor option must not be nil")
		}
		if err := option(executor); err != nil {
			return nil, err
		}
	}
	return executor, nil
}

// available reports whether the executor can reach the state and the port it
// needs. It is checked before every effect, tool-driven or dispatched, so a
// half-assembled executor is a runtime condition rather than a nil dereference.
func (executor *DecisionExecutor) available(ctx context.Context) error {
	if executor == nil || executor.registry == nil || executor.execution == nil {
		return ErrDirectorUnavailable
	}
	if ctx == nil {
		return errors.New("director command execution context is required")
	}
	return executor.registry.requireAvailable()
}

// Execute carries out one authorized decision.
func (executor *DecisionExecutor) Execute(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	if err := executor.available(ctx); err != nil {
		return ExecutedDecision{}, err
	}
	if err := validateAuthorizedDecision(authorized); err != nil {
		return ExecutedDecision{}, err
	}
	return executor.carryOut(ctx, authorized)
}

// carryOut dispatches one validated decision to the effect it names. It is
// total over the catalog, so a decision kind with no effect here fails loudly
// instead of being silently accepted as authorized.
func (executor *DecisionExecutor) carryOut(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	switch authorized.Decision.Kind {
	case DirectorDecisionCreateWorkstream:
		return executor.createWorkstream(ctx, authorized)
	case DirectorDecisionSendToWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun:
		return executor.deliverWork(ctx, authorized)
	case DirectorDecisionForkWorkstream:
		return executor.forkWorkstream(ctx, authorized)
	case DirectorDecisionSelectWorkstream:
		return executor.selectWorkstream(ctx, authorized)
	case DirectorDecisionRecoverPath:
		return executor.recoverPath(ctx, authorized)
	default:
		return ExecutedDecision{}, fmt.Errorf("unknown director decision kind %q", authorized.Decision.Kind)
	}
}

func validateAuthorizedDecision(authorized AuthorizedDecision) error {
	if err := validateSubmittedIntent(authorized.Intent); err != nil {
		return err
	}
	if err := authorized.Context.Validate(); err != nil {
		return fmt.Errorf("authorized decision %s carries invalid context: %w", authorized.Intent.ID, err)
	}
	if authorized.Context.Intent != authorized.Intent {
		return fmt.Errorf("authorized decision %s does not match its context", authorized.Intent.ID)
	}
	return ValidateDecisionAuthority(authorized.Context, authorized.Decision)
}

// createWorkstream mints the new workstream, records the decision that created
// it, creates its durable substrate, and selects it. Selection is part of
// creating: the user asked for a new workstream, so the one they get is the one
// they are then looking at. Initial input is optional, because an idle
// workstream the user can start work in later is a real product outcome.
func (executor *DecisionExecutor) createWorkstream(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	payload := *authorized.Decision.CreateWorkstream
	conversationID, err := executor.newID("conversation")
	if err != nil {
		return ExecutedDecision{}, err
	}
	workstreamID, err := WorkstreamIDForConversation(conversationID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	start, err := executor.startRequest(authorized, conversationID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	// The decision is committed in the Director's own lane. It was made before
	// the workstream it creates existed, and the Director is where the user
	// asked for it.
	committed, err := executor.commitDecision(ctx, authorized, nil, &workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	if err := executor.execution.StartWorkstream(ctx, start); err != nil {
		return ExecutedDecision{}, err
	}
	if err := executor.registry.awaitWorkstream(ctx, workstreamID); err != nil {
		return ExecutedDecision{}, err
	}
	selected, err := executor.registry.SelectWorkstream(ctx, workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	executed := ExecutedDecision{
		IntentID:             authorized.Intent.ID,
		Decision:             authorized.Decision.Kind,
		Summary:              committed.PublicSummary,
		WorkstreamID:         &workstreamID,
		SelectedWorkstreamID: selected,
		WorkspaceRequirement: committed.WorkspaceRequirement,
	}
	if payload.InitialInput == "" {
		return executed, nil
	}
	runID, err := executor.newID("turn")
	if err != nil {
		return ExecutedDecision{}, err
	}
	return executor.finishWork(ctx, executed, workstreamID, func() error {
		workspaceID, err := deliveryWorkspace(committed.WorkspaceRequirement, start.WorkspaceID)
		if err != nil {
			return err
		}
		return executor.execution.SendWork(ctx, WorkDeliveryRequest{
			ConversationID: conversationID,
			WorkspaceID:    workspaceID,
			RunID:          runID,
			Text:           payload.InitialInput,
		})
	})
}

// startRequest resolves the authorized scope into the durable substrate the new
// workstream is created from. The scope comes from the authorized workspace
// enum, so a folder the app is not currently offering cannot be started in.
func (executor *DecisionExecutor) startRequest(
	authorized AuthorizedDecision,
	conversationID string,
) (WorkstreamStartRequest, error) {
	payload := *authorized.Decision.CreateWorkstream
	start := WorkstreamStartRequest{
		ConversationID: conversationID,
		Title:          payload.ProposedTitle,
	}
	if payload.ResourceScope.Kind != WorkstreamResourceScopeFolder {
		return start, nil
	}
	workspaceID := payload.ResourceScope.Folder.WorkspaceID
	if _, offered := offeredWorkspace(authorized.Context, workspaceID); !offered {
		return WorkstreamStartRequest{}, fmt.Errorf(
			"%w: workspace %s is not an authorized scope",
			ErrDirectorIntentRejected,
			workspaceID,
		)
	}
	start.WorkspaceID = &workspaceID
	return start, nil
}

// offeredWorkspace resolves one folder trusted context is currently offering.
// It is the only way a workspace id reaches an effect, so a folder the app is
// not offering cannot be scoped to or bound.
func offeredWorkspace(
	decisionContext DirectorDecisionContext,
	workspaceID string,
) (DecisionWorkspaceOption, bool) {
	for _, option := range decisionContext.Workspaces {
		if option.WorkspaceID == workspaceID {
			return option, true
		}
	}
	return DecisionWorkspaceOption{}, false
}

// deliverWork sends, queues, or steers on a workstream that already exists.
func (executor *DecisionExecutor) deliverWork(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	decision := authorized.Decision
	workstreamID := *DecisionTargetWorkstreamID(decision)
	target, err := executor.registry.ExecutionTarget(workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	if decision.Kind == DirectorDecisionSteerRun {
		expected, offered := authorized.Context.Target(workstreamID)
		if !offered || expected.ActiveRunID == nil {
			return ExecutedDecision{}, fmt.Errorf(
				"%w: workstream %s has no authorized run to steer",
				ErrDirectorIntentRejected,
				workstreamID,
			)
		}
		if target.ActiveRunID == nil || *target.ActiveRunID != *expected.ActiveRunID {
			return ExecutedDecision{}, fmt.Errorf(
				"%w: run %s is no longer active on workstream %s",
				ErrDirectorIntentRejected,
				*expected.ActiveRunID,
				workstreamID,
			)
		}
	}
	committed, err := executor.commitDecision(ctx, authorized, &workstreamID, nil)
	if err != nil {
		return ExecutedDecision{}, err
	}
	runID, err := executor.newID("turn")
	if err != nil {
		return ExecutedDecision{}, err
	}
	return executor.finishWork(ctx, ExecutedDecision{
		IntentID:             authorized.Intent.ID,
		Decision:             decision.Kind,
		Summary:              committed.PublicSummary,
		WorkstreamID:         &workstreamID,
		WorkspaceRequirement: committed.WorkspaceRequirement,
	}, workstreamID, func() error {
		return executor.callWorkPort(ctx, decision, target, runID, committed)
	})
}

func (executor *DecisionExecutor) callWorkPort(
	ctx context.Context,
	decision DirectorDecision,
	target WorkstreamExecutionTarget,
	runID string,
	committed committedDecision,
) error {
	workspaceID, err := deliveryWorkspace(committed.WorkspaceRequirement, target.WorkspaceID)
	if err != nil {
		return err
	}
	switch decision.Kind {
	case DirectorDecisionSendToWorkstream:
		return executor.execution.SendWork(ctx, WorkDeliveryRequest{
			ConversationID: target.ConversationID,
			WorkspaceID:    workspaceID,
			RunID:          runID,
			Text:           decision.SendToWorkstream.AuthoredInput,
		})
	case DirectorDecisionQueueBehindRun:
		return executor.execution.QueueWork(ctx, WorkDeliveryRequest{
			ConversationID: target.ConversationID,
			WorkspaceID:    workspaceID,
			RunID:          runID,
			Text:           decision.QueueBehindRun.AuthoredInput,
		})
	case DirectorDecisionSteerRun:
		return executor.execution.SteerRun(ctx, SteerRunRequest{
			ConversationID: target.ConversationID,
			WorkspaceID:    workspaceID,
			TargetRunID:    *target.ActiveRunID,
			Text:           decision.SteerRun.AuthoredInput,
			DecisionID:     committed.FactID,
		})
	default:
		return fmt.Errorf("director decision %q does not deliver work", decision.Kind)
	}
}

// selectWorkstream moves app-wide selection. Selection is the one decision that
// changes what the user is looking at rather than what the app is doing, so the
// registry writes it and the decision records that the Director chose it.
// forkWorkstream branches an existing workstream into a new one that inherits
// its history through the parent's latest completed run.
//
// It mirrors creating: the child is minted, the decision that made it is
// committed before the substrate exists, and the user is left looking at what
// they asked for. It differs in where the decision is drawn — a fork is
// something that happened to the parent, so the fact is committed in the
// parent's lane while its target is the child — and in delivering no work. A
// fork is a starting point, not an instruction; the different direction the
// user wants from it arrives as its own work afterwards.
func (executor *DecisionExecutor) forkWorkstream(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	payload := *authorized.Decision.ForkWorkstream
	parent, err := executor.registry.ExecutionTarget(payload.WorkstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	forkedAtRunID, err := executor.registry.ForkPoint(payload.WorkstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	conversationID, err := executor.newID("conversation")
	if err != nil {
		return ExecutedDecision{}, err
	}
	workstreamID, err := WorkstreamIDForConversation(conversationID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	committed, err := executor.commitDecision(ctx, authorized, &payload.WorkstreamID, &workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	if err := executor.execution.ForkWorkstream(ctx, WorkstreamForkRequest{
		ParentConversationID: parent.ConversationID,
		ConversationID:       conversationID,
		ForkedAtRunID:        forkedAtRunID,
		Title:                payload.ProposedTitle,
		WorkspaceID:          copyOptionalString(parent.WorkspaceID),
	}); err != nil {
		return ExecutedDecision{}, err
	}
	if err := executor.registry.awaitWorkstream(ctx, workstreamID); err != nil {
		return ExecutedDecision{}, err
	}
	selected, err := executor.registry.SelectWorkstream(ctx, workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	return ExecutedDecision{
		IntentID:             authorized.Intent.ID,
		Decision:             authorized.Decision.Kind,
		Summary:              committed.PublicSummary,
		WorkstreamID:         &workstreamID,
		SelectedWorkstreamID: selected,
	}, nil
}

func (executor *DecisionExecutor) selectWorkstream(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	workstreamID := authorized.Decision.SelectWorkstream.WorkstreamID
	committed, err := executor.commitDecision(ctx, authorized, &workstreamID, nil)
	if err != nil {
		return ExecutedDecision{}, err
	}
	selected, err := executor.registry.SelectWorkstream(ctx, workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	return ExecutedDecision{
		IntentID:             authorized.Intent.ID,
		Decision:             authorized.Decision.Kind,
		Summary:              committed.PublicSummary,
		WorkstreamID:         &workstreamID,
		SelectedWorkstreamID: selected,
	}, nil
}

// recoverPath restarts the work a durable failure interrupted. The recovery
// fact is what a recovered_by edge is derived from, so it is committed before
// the restarted run rather than inferred from the run that follows it.
func (executor *DecisionExecutor) recoverPath(
	ctx context.Context,
	authorized AuthorizedDecision,
) (ExecutedDecision, error) {
	payload := *authorized.Decision.RecoverPath
	target, err := executor.registry.ExecutionTarget(payload.WorkstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	failedRunID, err := executor.registry.RecoverableRun(payload.WorkstreamID, payload.FailureEventID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	committed, err := executor.commitDecision(ctx, authorized, &payload.WorkstreamID, nil)
	if err != nil {
		return ExecutedDecision{}, err
	}
	summary := committed.PublicSummary
	recoveryID, err := executor.newID("director-recovery")
	if err != nil {
		return ExecutedDecision{}, err
	}
	if _, err := executor.appendFact(ctx, DirectorFactEvent{
		Kind:         DirectorFactRecoveryAttempted,
		WorkstreamID: &payload.WorkstreamID,
		Actor:        SemanticActorDirector,
		RecoveryAttempted: &DirectorRecoveryAttempted{
			RecoveryID:     recoveryID,
			Status:         RecoveryStatusRetrying,
			FailureEventID: payload.FailureEventID,
			PublicSummary:  summary,
		},
	}); err != nil {
		return ExecutedDecision{}, err
	}
	runID, err := executor.newID("turn")
	if err != nil {
		return ExecutedDecision{}, err
	}
	return executor.finishWork(ctx, ExecutedDecision{
		IntentID:             authorized.Intent.ID,
		Decision:             authorized.Decision.Kind,
		Summary:              summary,
		WorkstreamID:         &payload.WorkstreamID,
		WorkspaceRequirement: committed.WorkspaceRequirement,
	}, payload.WorkstreamID, func() error {
		return executor.execution.RecoverRun(ctx, RecoverRunRequest{
			ConversationID: target.ConversationID,
			WorkspaceID:    copyOptionalString(target.WorkspaceID),
			FailedRunID:    failedRunID,
			RunID:          runID,
		})
	})
}

// finishWork runs the execution port and turns a missing resource into the
// durable request that says what the work is waiting for. Any other execution
// failure is returned: it is a runtime condition the caller decides about, not
// something to record as a product state the user can act on.
func (executor *DecisionExecutor) finishWork(
	ctx context.Context,
	executed ExecutedDecision,
	workstreamID string,
	run func() error,
) (ExecutedDecision, error) {
	err := run()
	if err == nil {
		return executed, nil
	}
	var required *WorkstreamResourceRequiredError
	if !errors.As(err, &required) {
		return ExecutedDecision{}, err
	}
	requestID, summary, err := executor.openResourceRequest(ctx, workstreamID, required.Kind)
	if err != nil {
		return ExecutedDecision{}, err
	}
	executed.ResourceRequestID = &requestID
	executed.Summary = summary
	return executed, nil
}

// deliveryWorkspace resolves the folder one delivery runs with. A workspace is
// optional context, so the only thing that can hold work up is the delivery
// having declared that it needs the user's own files and the workstream not
// having any: the caller turns that into the durable request that says so.
//
// Steering and recovery declare nothing, because neither is a new delivery: they
// change or restart work the workstream already carried under the scope it
// already has.
func deliveryWorkspace(
	requirement *WorkspaceRequirement,
	workspaceID *string,
) (*string, error) {
	if workspaceID == nil && requirement != nil && *requirement == WorkspaceRequired {
		return nil, &WorkstreamResourceRequiredError{Kind: WorkstreamResourceKindFolder}
	}
	return copyOptionalString(workspaceID), nil
}

func (executor *DecisionExecutor) openResourceRequest(
	ctx context.Context,
	workstreamID string,
	kind WorkstreamResourceKind,
) (string, string, error) {
	summary, known := resourceRequestSummaries[kind]
	if !known {
		return "", "", fmt.Errorf("no public summary for workstream resource kind %q", kind)
	}
	requestID, err := executor.newID("director-resource")
	if err != nil {
		return "", "", err
	}
	if _, err := executor.appendFact(ctx, DirectorFactEvent{
		Kind:         DirectorFactResourceRequestOpened,
		WorkstreamID: &workstreamID,
		Actor:        SemanticActorDirector,
		ResourceRequestOpened: &DirectorResourceRequestOpened{
			RequestID:     requestID,
			Kind:          kind,
			PublicSummary: summary,
		},
	}); err != nil {
		return "", "", err
	}
	return requestID, summary, nil
}

// committedDecision is the durable identity and public sentence one decision
// landed with. The work the decision authorizes is recorded against the fact
// id, and the receipt the Director explains to the user is the summary.
type committedDecision struct {
	FactID        string
	PublicSummary string
	// WorkspaceRequirement is what the durable fact recorded the delivered work
	// needs from the user's files, so the receipt reports what was committed
	// rather than what the call asked for.
	WorkspaceRequirement *WorkspaceRequirement
}

// commitDecision writes the durable decision.
func (executor *DecisionExecutor) commitDecision(
	ctx context.Context,
	authorized AuthorizedDecision,
	workstreamID *string,
	createdWorkstreamID *string,
) (committedDecision, error) {
	committed, err := NewCommittedDecision(authorized.Context, authorized.Decision, createdWorkstreamID)
	if err != nil {
		return committedDecision{}, err
	}
	factID, err := executor.appendFact(ctx, DirectorFactEvent{
		Kind:              DirectorFactDecisionCommitted,
		WorkstreamID:      copyOptionalString(workstreamID),
		Actor:             SemanticActorDirector,
		DecisionCommitted: &committed,
	})
	if err != nil {
		return committedDecision{}, err
	}
	return committedDecision{
		FactID:               factID,
		PublicSummary:        committed.PublicSummary,
		WorkspaceRequirement: committed.WorkspaceRequirement,
	}, nil
}

// appendFact stamps and commits one Director fact and reports the durable id it
// was committed under. The id and the timestamp are minted here rather than by
// the caller so every durable fact this executor writes is stamped by the same
// clock the registry folds it with.
func (executor *DecisionExecutor) appendFact(ctx context.Context, fact DirectorFactEvent) (string, error) {
	if err := executor.registry.requireAvailable(); err != nil {
		return "", err
	}
	factID, err := executor.newID("director-fact")
	if err != nil {
		return "", err
	}
	fact.ID = factID
	fact.EmittedAt = executor.now().UTC().Format(time.RFC3339Nano)
	committed, err := AppendDirectorFact(ctx, executor.registry.facts, fact)
	if err != nil {
		return "", err
	}
	if err := executor.registry.awaitCommit(ctx, committed.CommitSequence); err != nil {
		return "", err
	}
	return factID, nil
}
