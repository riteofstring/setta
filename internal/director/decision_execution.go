package director

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Carrying out one routed decision.
//
// The router turns a submitted intent into the decision trusted state
// authorized. This turns that decision into the work it describes, and it is
// the only place in the Director that both writes durable facts and calls the
// execution port.
//
// Two orderings are load-bearing:
//
//   - The decision is committed before the work it authorizes. It is the fact
//     the graph explains that work with, a create decision names a workstream
//     that does not exist until the work runs, and the ids it carries are the
//     ids the work is then addressed by — so replaying a decision after a crash
//     addresses the same run instead of minting a second one. Work that then
//     fails to start leaves a decision the app truthfully made and an error the
//     caller receives, rather than a silent gap.
//   - Work a workstream cannot start yet becomes a durable resource request
//     instead of an error. A folderless workstream is a first-class workstream:
//     it exists, it is selectable, and what it is missing is a folder. That is
//     the affordance the pane world could only derive from a routing failure
//     code.
//
// The Director's own replies — an answer and a clarification — are committed as
// app-scoped decisions that happen in no workstream, because they start no work
// anywhere. They are still durable: the answer is what the user was told, and
// the question is what their next request is answering.

// resourceRequestSummaries are the public sentences a blocked-on-resource
// workstream shows. They are keyed by the typed resource kind rather than
// written from an execution error, so no provider or filesystem text reaches
// the user.
var resourceRequestSummaries = map[WorkstreamResourceKind]string{
	WorkstreamResourceKindFolder: "Waiting for a project folder before this work can start.",
}

// ExecutedDecision is what carrying out one routed intent produced. It is a
// receipt, not state: every durable change reaches the shell through the same
// pushed stream as every other change.
type ExecutedDecision struct {
	IntentID   string
	Resolution DecisionResolution
	// Decision is the decision that was carried out. It is nil exactly for a
	// blocked resolution, which produced no decision to carry out.
	Decision *DirectorDecisionKind
	// WorkstreamID is the workstream the request ended up in, when it ended up
	// in one. An answer, a question, and a blocked request name none.
	WorkstreamID *string
	// PublicText is the Director's own words for the user: the answer, the
	// question, or why the request could not be routed. It is empty for a
	// decision that started work, because the work is the answer.
	PublicText string
	// ResourceRequestID names the durable request the work is waiting on, when
	// the workstream could not start it yet.
	ResourceRequestID *string
}

// DecisionExecutor carries out routed decisions.
type DecisionExecutor struct {
	registry  *Registry
	execution WorkstreamExecution
	now       func() time.Time
	newID     func(string) (string, error)
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

// Execute carries out one routed intent.
func (executor *DecisionExecutor) Execute(ctx context.Context, routed RoutedIntent) (ExecutedDecision, error) {
	if executor == nil || executor.registry == nil || executor.execution == nil {
		return ExecutedDecision{}, ErrDirectorUnavailable
	}
	if ctx == nil {
		return ExecutedDecision{}, errors.New("director decision execution context is required")
	}
	if err := validateRoutedIntent(routed); err != nil {
		return ExecutedDecision{}, err
	}
	if routed.Resolution == DecisionResolvedAsBlocked {
		return ExecutedDecision{
			IntentID:   routed.Intent.ID,
			Resolution: routed.Resolution,
			PublicText: routed.PublicSummary,
		}, nil
	}
	decision := *routed.Decision
	switch decision.Kind {
	case DirectorDecisionAnswerDirectly, DirectorDecisionAskClarification:
		return executor.reply(ctx, routed, decision)
	case DirectorDecisionCreateWorkstream:
		return executor.createWorkstream(ctx, routed, decision)
	case DirectorDecisionSendToWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun:
		return executor.deliverWork(ctx, routed, decision)
	case DirectorDecisionSelectWorkstream:
		return executor.selectWorkstream(ctx, routed, decision)
	case DirectorDecisionRecoverPath:
		return executor.recoverPath(ctx, routed, decision)
	default:
		return ExecutedDecision{}, fmt.Errorf("unknown director decision kind %q", decision.Kind)
	}
}

func validateRoutedIntent(routed RoutedIntent) error {
	if err := validateSubmittedIntent(routed.Intent); err != nil {
		return err
	}
	switch routed.Resolution {
	case DecisionResolvedByModel, DecisionResolvedByProductInvariant, DecisionResolvedByClarification:
		if routed.Decision == nil {
			return fmt.Errorf("routed intent %s resolved as %q without a decision", routed.Intent.ID, routed.Resolution)
		}
		return nil
	case DecisionResolvedAsBlocked:
		if routed.Decision != nil {
			return fmt.Errorf("blocked routed intent %s carries a decision", routed.Intent.ID)
		}
		return validateTrimmedText("blocked decision public summary", routed.PublicSummary)
	default:
		return fmt.Errorf("unknown director decision resolution %q", routed.Resolution)
	}
}

// reply commits what the Director told the user. The fact happens in no
// workstream because the reply started work in none, and it is durable because
// the answer is what the user was told and the question is what their next
// request is answering.
func (executor *DecisionExecutor) reply(
	ctx context.Context,
	routed RoutedIntent,
	decision DirectorDecision,
) (ExecutedDecision, error) {
	if _, err := executor.commitDecision(ctx, routed, decision, nil, nil); err != nil {
		return ExecutedDecision{}, err
	}
	text := ""
	if decision.Kind == DirectorDecisionAnswerDirectly {
		text = decision.AnswerDirectly.Text
	} else {
		text = decision.AskClarification.Question
	}
	return ExecutedDecision{
		IntentID:   routed.Intent.ID,
		Resolution: routed.Resolution,
		Decision:   &decision.Kind,
		PublicText: text,
	}, nil
}

// createWorkstream mints the new workstream's identity, records the decision
// that created it, and then creates the durable substrate it runs on. The
// workstream id is derived from the conversation id, so a replay of the log
// always addresses the same workstream.
func (executor *DecisionExecutor) createWorkstream(
	ctx context.Context,
	routed RoutedIntent,
	decision DirectorDecision,
) (ExecutedDecision, error) {
	payload := *decision.CreateWorkstream
	conversationID, err := executor.newID("conversation")
	if err != nil {
		return ExecutedDecision{}, err
	}
	workstreamID, err := WorkstreamIDForConversation(conversationID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	start, parent, err := executor.startRequest(routed.Context, decision, conversationID, workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	if _, err := executor.commitDecision(ctx, routed, decision, parent, &workstreamID); err != nil {
		return ExecutedDecision{}, err
	}
	if err := executor.execution.StartWorkstream(ctx, start); err != nil {
		return ExecutedDecision{}, err
	}
	runID, err := executor.newID("turn")
	if err != nil {
		return ExecutedDecision{}, err
	}
	return executor.finishWork(ctx, routed, decision, workstreamID, func() error {
		workspaceID, err := requireFolderResource(start.WorkspaceID)
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

// startRequest resolves the authorized origin into the durable substrate the
// new workstream is created from. A root workstream chooses its own scope from
// the authorized workspace enum; a child and a fork inherit their parent's, so
// the decision cannot rescope existing work.
func (executor *DecisionExecutor) startRequest(
	decisionContext DirectorDecisionContext,
	decision DirectorDecision,
	conversationID string,
	workstreamID string,
) (WorkstreamStartRequest, *string, error) {
	payload := *decision.CreateWorkstream
	start := WorkstreamStartRequest{
		ConversationID: conversationID,
		Title:          payload.ProposedTitle,
		Origin:         WorkstreamOrigin{Kind: payload.Origin.Kind},
	}
	if payload.Origin.Kind == WorkstreamCreationRoot {
		scope := payload.Origin.Root.ResourceScope
		if scope.Kind != WorkstreamResourceScopeFolder {
			return start, nil, nil
		}
		workspaceID := scope.Folder.WorkspaceID
		if !offersWorkspace(decisionContext, workspaceID) {
			return WorkstreamStartRequest{}, nil, fmt.Errorf(
				"%w: workspace %s is not an authorized scope",
				ErrDirectorIntentRejected,
				workspaceID,
			)
		}
		start.WorkspaceID = &workspaceID
		return start, nil, nil
	}
	parentID := *DecisionParentWorkstreamID(decision)
	if parentID == workstreamID {
		return WorkstreamStartRequest{}, nil, fmt.Errorf("workstream %s cannot be its own parent", workstreamID)
	}
	parent, err := executor.registry.ExecutionTarget(parentID)
	if err != nil {
		return WorkstreamStartRequest{}, nil, err
	}
	start.WorkspaceID = parent.WorkspaceID
	start.Origin.ParentConversationID = parent.ConversationID
	if payload.Origin.Kind == WorkstreamCreationFork {
		start.Origin.ForkedAtRunID = payload.Origin.Fork.ForkedAtRunID
	}
	return start, &parent.WorkstreamID, nil
}

func offersWorkspace(decisionContext DirectorDecisionContext, workspaceID string) bool {
	for _, option := range decisionContext.Workspaces {
		if option.WorkspaceID == workspaceID {
			return true
		}
	}
	return false
}

// deliverWork sends, queues, or steers on a workstream that already exists.
func (executor *DecisionExecutor) deliverWork(
	ctx context.Context,
	routed RoutedIntent,
	decision DirectorDecision,
) (ExecutedDecision, error) {
	workstreamID := *DecisionTargetWorkstreamID(decision)
	target, err := executor.registry.ExecutionTarget(workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	factID, err := executor.commitDecision(ctx, routed, decision, &workstreamID, nil)
	if err != nil {
		return ExecutedDecision{}, err
	}
	runID, err := executor.newID("turn")
	if err != nil {
		return ExecutedDecision{}, err
	}
	return executor.finishWork(ctx, routed, decision, workstreamID, func() error {
		return executor.callWorkPort(ctx, decision, target, runID, factID)
	})
}

func (executor *DecisionExecutor) callWorkPort(
	ctx context.Context,
	decision DirectorDecision,
	target WorkstreamExecutionTarget,
	runID string,
	decisionID string,
) error {
	workspaceID, err := requireFolderResource(target.WorkspaceID)
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
		if target.ActiveRunID == nil {
			return fmt.Errorf(
				"%w: workstream %s has no active run to steer",
				ErrDirectorIntentRejected,
				target.WorkstreamID,
			)
		}
		return executor.execution.SteerRun(ctx, SteerRunRequest{
			ConversationID: target.ConversationID,
			WorkspaceID:    workspaceID,
			TargetRunID:    *target.ActiveRunID,
			Text:           decision.SteerRun.AuthoredInput,
			DecisionID:     decisionID,
		})
	default:
		return fmt.Errorf("director decision %q does not deliver work", decision.Kind)
	}
}

// selectWorkstream moves app-wide selection. Selection is the one decision that
// changes what the user is looking at rather than what the app is doing, so the
// registry writes it and the decision records that the Director chose it.
func (executor *DecisionExecutor) selectWorkstream(
	ctx context.Context,
	routed RoutedIntent,
	decision DirectorDecision,
) (ExecutedDecision, error) {
	workstreamID := decision.SelectWorkstream.WorkstreamID
	if _, err := executor.commitDecision(ctx, routed, decision, &workstreamID, nil); err != nil {
		return ExecutedDecision{}, err
	}
	selected, err := executor.registry.SelectWorkstream(ctx, workstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	return ExecutedDecision{
		IntentID:     routed.Intent.ID,
		Resolution:   routed.Resolution,
		Decision:     &decision.Kind,
		WorkstreamID: selected,
	}, nil
}

// recoverPath restarts the work a durable failure interrupted. The recovery
// fact is what a recovered_by edge is derived from, so it is committed before
// the restarted run rather than inferred from the run that follows it.
func (executor *DecisionExecutor) recoverPath(
	ctx context.Context,
	routed RoutedIntent,
	decision DirectorDecision,
) (ExecutedDecision, error) {
	payload := *decision.RecoverPath
	target, err := executor.registry.ExecutionTarget(payload.WorkstreamID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	failedRunID, err := executor.registry.RecoverableRun(payload.WorkstreamID, payload.FailureEventID)
	if err != nil {
		return ExecutedDecision{}, err
	}
	summary, err := DecisionPublicSummary(routed.Context, decision)
	if err != nil {
		return ExecutedDecision{}, err
	}
	if _, err := executor.commitDecision(ctx, routed, decision, &payload.WorkstreamID, nil); err != nil {
		return ExecutedDecision{}, err
	}
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
	return executor.finishWork(ctx, routed, decision, payload.WorkstreamID, func() error {
		workspaceID, err := requireFolderResource(target.WorkspaceID)
		if err != nil {
			return err
		}
		return executor.execution.RecoverRun(ctx, RecoverRunRequest{
			ConversationID: target.ConversationID,
			WorkspaceID:    workspaceID,
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
	routed RoutedIntent,
	decision DirectorDecision,
	workstreamID string,
	run func() error,
) (ExecutedDecision, error) {
	executed := ExecutedDecision{
		IntentID:     routed.Intent.ID,
		Resolution:   routed.Resolution,
		Decision:     &decision.Kind,
		WorkstreamID: &workstreamID,
	}
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
	executed.PublicText = summary
	return executed, nil
}

// requireFolderResource reports the folder work runs inside. Setta runs work in
// a folder, so a folderless workstream is not broken: it is waiting for one, and
// the caller turns that into the durable request that says so.
func requireFolderResource(workspaceID *string) (string, error) {
	if workspaceID == nil {
		return "", &WorkstreamResourceRequiredError{Kind: WorkstreamResourceKindFolder}
	}
	return *workspaceID, nil
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

// commitDecision writes the durable decision and returns its fact id, which is
// the durable decision identity the work it authorizes is recorded against.
func (executor *DecisionExecutor) commitDecision(
	ctx context.Context,
	routed RoutedIntent,
	decision DirectorDecision,
	workstreamID *string,
	createdWorkstreamID *string,
) (string, error) {
	committed, err := NewCommittedDecision(routed.Context, decision, createdWorkstreamID)
	if err != nil {
		return "", err
	}
	return executor.appendFact(ctx, DirectorFactEvent{
		Kind:              DirectorFactDecisionCommitted,
		WorkstreamID:      copyOptionalString(workstreamID),
		Actor:             SemanticActorDirector,
		DecisionCommitted: &committed,
	})
}

// appendFact stamps and commits one Director fact and reports the durable id it
// was committed under. The id and the timestamp are minted here rather than by
// the caller so every durable fact this executor writes is stamped by the same
// clock the registry folds it with.
func (executor *DecisionExecutor) appendFact(ctx context.Context, fact DirectorFactEvent) (string, error) {
	factID, err := executor.newID("director-fact")
	if err != nil {
		return "", err
	}
	fact.ID = factID
	fact.EmittedAt = executor.now().UTC().Format(time.RFC3339Nano)
	if err := AppendDirectorFact(ctx, executor.registry.facts, fact); err != nil {
		return "", err
	}
	return factID, nil
}
