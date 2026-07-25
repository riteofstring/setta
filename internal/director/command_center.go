package director

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"setta/internal/conversation"
)

// The Director command center boundary.
//
// This is the one surface the shell talks to. It dispatches user intent and
// hands back the app-scoped snapshot and its pushed stream, and it exposes no
// pane, conversation, provider, or execution concept in either direction. The
// renderer therefore cannot know how routing, conversation execution,
// persistence, or presentation coordination work internally, which is the point:
// pane identity stopped owning conversational work, and nothing replaced it as a
// second application-level authority.
//
// The registry owns what is durably true. The command center owns what the user
// asked for.
//
// Submitting work is the front door: one text or voice request reaches the
// router, which resolves it into the single decision trusted state authorizes,
// and the executor carries that decision out. The shell supplies what the user
// said and how they said it; the intent's identity and the moment it was
// accepted are minted here, because an id a caller chose is an id product code
// did not.
//
// The other intents are direct. Cancelling a run, answering an approval, and
// supplying a folder are the user acting on something the command center is
// already showing them, so there is nothing for a model to decide — only trusted
// state to resolve and one execution-port operation to run.

// ErrDirectorUnavailable reports that the command center cannot serve a request
// because the app-scoped registry is not running, or because the Director could
// not be reached to decide what a request meant. It is a runtime condition
// rather than something the caller asked for wrongly.
var ErrDirectorUnavailable = errors.New("director command center is unavailable")

// ErrDirectorIntentRejected reports that trusted state does not hold what the
// intent named. The request is wrong, not the app's state, so the caller is told
// rather than the failure being repaired.
var ErrDirectorIntentRejected = errors.New("director intent rejected")

// DirectorIntentKind is the catalog of user intents the command center accepts.
type DirectorIntentKind string

const (
	// DirectorIntentSubmit hands one text or voice request to the Director.
	DirectorIntentSubmit DirectorIntentKind = "submit"
	// DirectorIntentSelectWorkstream moves app-wide selection to a named
	// workstream.
	DirectorIntentSelectWorkstream DirectorIntentKind = "select_workstream"
	// DirectorIntentMoveSelection moves app-wide selection one step through the
	// workstreams the command center is showing.
	DirectorIntentMoveSelection DirectorIntentKind = "move_selection"
	// DirectorIntentCancelRun stops the run a workstream is carrying now.
	DirectorIntentCancelRun DirectorIntentKind = "cancel_run"
	// DirectorIntentResolveApproval answers one approval a run is waiting on.
	DirectorIntentResolveApproval DirectorIntentKind = "resolve_approval"
	// DirectorIntentResolveResourceRequest supplies the resource one workstream
	// is waiting for.
	DirectorIntentResolveResourceRequest DirectorIntentKind = "resolve_resource_request"
)

var directorIntentKinds = []DirectorIntentKind{
	DirectorIntentSubmit,
	DirectorIntentSelectWorkstream,
	DirectorIntentMoveSelection,
	DirectorIntentCancelRun,
	DirectorIntentResolveApproval,
	DirectorIntentResolveResourceRequest,
}

// DirectorSelectionDirection is one step through the ordered workstreams.
type DirectorSelectionDirection string

const (
	DirectorSelectionPrevious DirectorSelectionDirection = "previous"
	DirectorSelectionNext     DirectorSelectionDirection = "next"
)

var directorSelectionDirections = []DirectorSelectionDirection{
	DirectorSelectionPrevious,
	DirectorSelectionNext,
}

// DirectorSubmitIntent is one request the user made. Text and modality are the
// whole of it: voice and typing reach the Director through the same intent, so
// the modality is provenance rather than a second path, and nothing about which
// workstream the request is for is supplied — deciding that is the Director's
// job.
type DirectorSubmitIntent struct {
	Text     string                 `json:"text"`
	Modality DecisionIntentModality `json:"modality"`
}

// DirectorSelectWorkstreamIntent names the workstream to select. It carries a
// workstream id and nothing else: there is no pane to open, focus, or resolve.
type DirectorSelectWorkstreamIntent struct {
	WorkstreamID string `json:"workstreamId"`
}

// DirectorMoveSelectionIntent moves selection relative to the current one. The
// app resolves which workstream that is, because the order is app state and the
// caller must not be able to select something the registry is not showing.
type DirectorMoveSelectionIntent struct {
	Direction DirectorSelectionDirection `json:"direction"`
}

// DirectorCancelRunIntent stops one named run. It carries the run the user was
// looking at rather than only its workstream: work can be queued behind a run,
// so between the frame the user saw and the dispatch they made, the run they
// meant to stop can have finished and its successor started. Naming the run is
// what keeps a cancel from stopping work the user never saw.
type DirectorCancelRunIntent struct {
	WorkstreamID string `json:"workstreamId"`
	RunID        string `json:"runId"`
}

// DirectorResolveApprovalIntent answers one approval. It carries structured
// answers because Setta's approval catalog includes questions a run cannot
// continue without: a boundary that could only approve or deny would leave every
// structured-input approval unanswerable through the command center.
//
// Secret answers travel here and reach the provider path that asked for them.
// They never become durable: the conversation service redacts them out of the
// trajectory, and the app-scoped approval record carries only that an answer was
// secret.
type DirectorResolveApprovalIntent struct {
	ApprovalID string                                    `json:"approvalId"`
	Decision   conversation.TrajectoryApprovalDecision   `json:"decision"`
	Answers    []conversation.ConversationApprovalAnswer `json:"answers"`
}

// DirectorResolveResourceRequestIntent supplies the resource one open request is
// waiting for. The user chooses a folder the app can currently reach by id;
// trusted code resolves it into the binding, exactly as it does for a Director
// decision, so no filesystem path crosses the boundary in either direction.
type DirectorResolveResourceRequestIntent struct {
	RequestID   string `json:"requestId"`
	WorkspaceID string `json:"workspaceId"`
}

// DirectorIntent is one dispatched user intent. Kind selects exactly one
// populated payload.
type DirectorIntent struct {
	Kind                   DirectorIntentKind                    `json:"kind"`
	Submit                 *DirectorSubmitIntent                 `json:"submit"`
	SelectWorkstream       *DirectorSelectWorkstreamIntent       `json:"selectWorkstream"`
	MoveSelection          *DirectorMoveSelectionIntent          `json:"moveSelection"`
	CancelRun              *DirectorCancelRunIntent              `json:"cancelRun"`
	ResolveApproval        *DirectorResolveApprovalIntent        `json:"resolveApproval"`
	ResolveResourceRequest *DirectorResolveResourceRequestIntent `json:"resolveResourceRequest"`
}

// DirectorReceipt is what a dispatch reports back. The durable change reaches
// the shell through the pushed stream like every other change, so the receipt
// says only what the app decided the intent meant: which workstream is selected
// now, or what carrying out a submitted request produced. A move with nowhere to
// go returns the selection it kept, and a direct command reports nothing at all,
// because the user already knew what they asked for and the stream carries what
// it changed.
//
// The receipt is not registered as a discriminated wire shape, because a
// selection receipt's workstream is legitimately null when the registry holds
// nothing to select. ValidateDirectorReceipt is what proves exactly one payload
// belongs to the dispatched kind.
type DirectorReceipt struct {
	Kind DirectorIntentKind `json:"kind"`
	// SelectedWorkstreamID is the app-wide selection after a selection dispatch.
	// It is null when the registry holds no workstream to select, and always null
	// for a submitted request, whose own selection change arrives on the pushed
	// stream.
	SelectedWorkstreamID *string `json:"selectedWorkstreamId"`
	// Submit is what the app did with a submitted request. It is populated
	// exactly for a submit dispatch.
	Submit *ExecutedDecision `json:"submit"`
}

// ValidateDirectorIntent rejects an intent before it reaches durable state.
func ValidateDirectorIntent(intent DirectorIntent) error {
	if err := validateIntentPayloadPresence(intent); err != nil {
		return err
	}
	switch intent.Kind {
	case DirectorIntentSubmit:
		return validateSubmitIntent(*intent.Submit)
	case DirectorIntentSelectWorkstream:
		return validateIdentifier("director select workstream id", intent.SelectWorkstream.WorkstreamID)
	case DirectorIntentMoveSelection:
		return validateSelectionDirection(intent.MoveSelection.Direction)
	case DirectorIntentCancelRun:
		return validateCancelRunIntent(*intent.CancelRun)
	case DirectorIntentResolveApproval:
		return validateResolveApprovalIntent(*intent.ResolveApproval)
	case DirectorIntentResolveResourceRequest:
		return validateResolveResourceRequestIntent(*intent.ResolveResourceRequest)
	default:
		return fmt.Errorf("unknown director intent kind %q", intent.Kind)
	}
}

// validateIntentPayloadPresence proves the dispatched kind carries exactly its
// own payload. One loop over the whole catalog is what keeps adding an intent
// from silently accepting a second populated payload beside it.
func validateIntentPayloadPresence(intent DirectorIntent) error {
	present := map[DirectorIntentKind]bool{
		DirectorIntentSubmit:                 intent.Submit != nil,
		DirectorIntentSelectWorkstream:       intent.SelectWorkstream != nil,
		DirectorIntentMoveSelection:          intent.MoveSelection != nil,
		DirectorIntentCancelRun:              intent.CancelRun != nil,
		DirectorIntentResolveApproval:        intent.ResolveApproval != nil,
		DirectorIntentResolveResourceRequest: intent.ResolveResourceRequest != nil,
	}
	if _, known := present[intent.Kind]; !known {
		return fmt.Errorf("unknown director intent kind %q", intent.Kind)
	}
	for kind, populated := range present {
		if populated != (kind == intent.Kind) {
			return fmt.Errorf("director intent %q requires exactly its own payload", intent.Kind)
		}
	}
	return nil
}

func validateSubmitIntent(submit DirectorSubmitIntent) error {
	if err := validateTrimmedText("director submitted text", submit.Text); err != nil {
		return err
	}
	if len(submit.Text) > MaxDecisionIntentTextBytes {
		return fmt.Errorf("director submitted text exceeds %d bytes", MaxDecisionIntentTextBytes)
	}
	if !isDecisionIntentModality(submit.Modality) {
		return fmt.Errorf("unknown director submitted modality %q", submit.Modality)
	}
	return nil
}

func validateSelectionDirection(direction DirectorSelectionDirection) error {
	if !slices.Contains(directorSelectionDirections, direction) {
		return fmt.Errorf("unknown director selection direction %q", direction)
	}
	return nil
}

func validateCancelRunIntent(cancel DirectorCancelRunIntent) error {
	if err := validateIdentifier("director cancel workstream id", cancel.WorkstreamID); err != nil {
		return err
	}
	return validateIdentifier("director cancel run id", cancel.RunID)
}

// validateResolveApprovalIntent checks the answer against the conversation's own
// approval rules rather than restating them. The conversation owns what a
// decision may carry, so a second copy of that rule here could disagree with the
// one the durable write enforces.
func validateResolveApprovalIntent(resolve DirectorResolveApprovalIntent) error {
	if err := validateIdentifier("director approval id", resolve.ApprovalID); err != nil {
		return err
	}
	return conversation.ConversationApprovalResponse{
		ApprovalID: resolve.ApprovalID,
		Decision:   resolve.Decision,
		Answers:    resolve.Answers,
	}.Validate()
}

func validateResolveResourceRequestIntent(resolve DirectorResolveResourceRequestIntent) error {
	if err := validateIdentifier("director resource request id", resolve.RequestID); err != nil {
		return err
	}
	return validateIdentifier("director resource request workspace id", resolve.WorkspaceID)
}

// ValidateDirectorReceipt proves a receipt names a real selection or a real
// outcome, and that it names only the one its dispatched kind produces.
func ValidateDirectorReceipt(receipt DirectorReceipt) error {
	switch receipt.Kind {
	case DirectorIntentSubmit:
		if receipt.Submit == nil || receipt.SelectedWorkstreamID != nil {
			return fmt.Errorf("director receipt %q requires exactly its own outcome", receipt.Kind)
		}
		return receipt.Submit.Validate()
	case DirectorIntentSelectWorkstream, DirectorIntentMoveSelection:
		if receipt.Submit != nil {
			return fmt.Errorf("director receipt %q must not carry a submitted outcome", receipt.Kind)
		}
		if receipt.SelectedWorkstreamID == nil {
			return nil
		}
		return validateIdentifier("director receipt selected workstream id", *receipt.SelectedWorkstreamID)
	case DirectorIntentCancelRun, DirectorIntentResolveApproval, DirectorIntentResolveResourceRequest:
		// A direct command has nothing to report. What it changed is durable, and
		// it reaches the shell on the pushed stream like every other change, so a
		// receipt that answered with app state here would be a second source of it.
		if receipt.Submit != nil || receipt.SelectedWorkstreamID != nil {
			return fmt.Errorf("director receipt %q reports an outcome the pushed stream owns", receipt.Kind)
		}
		return nil
	default:
		return fmt.Errorf("unknown director intent kind %q", receipt.Kind)
	}
}

// CommandCenter is the application boundary the shell dispatches through.
type CommandCenter struct {
	registry *Registry
	router   *DecisionRouter
	executor *DecisionExecutor
	now      func() time.Time
	newID    func(string) (string, error)
}

// CommandCenterOption configures the boundary.
type CommandCenterOption func(*CommandCenter) error

// WithCommandCenterClock replaces the clock a submitted intent is stamped with.
func WithCommandCenterClock(now func() time.Time) CommandCenterOption {
	return func(center *CommandCenter) error {
		if now == nil {
			return errors.New("director command center clock must not be nil")
		}
		center.now = now
		return nil
	}
}

// WithCommandCenterIdentity replaces the generator that mints intent ids.
func WithCommandCenterIdentity(newID func(string) (string, error)) CommandCenterOption {
	return func(center *CommandCenter) error {
		if newID == nil {
			return errors.New("director command center identity generator must not be nil")
		}
		center.newID = newID
		return nil
	}
}

// NewCommandCenter builds the boundary over the app-scoped registry, the router
// that decides what a request means, and the executor that carries the decision
// out. All three are required: a dispatch that accepted work it could not route
// or perform would be a stub in the product's front door.
func NewCommandCenter(
	registry *Registry,
	router *DecisionRouter,
	executor *DecisionExecutor,
	options ...CommandCenterOption,
) (*CommandCenter, error) {
	if registry == nil || router == nil || executor == nil {
		return nil, errors.New("director command center requires the registry, the decision router, and the executor")
	}
	center := &CommandCenter{
		registry: registry,
		router:   router,
		executor: executor,
		now:      time.Now,
		newID:    randomDirectorFactID,
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("director command center option must not be nil")
		}
		if err := option(center); err != nil {
			return nil, err
		}
	}
	return center, nil
}

func (center *CommandCenter) available() error {
	if center == nil || center.registry == nil || center.router == nil || center.executor == nil {
		return ErrDirectorUnavailable
	}
	return nil
}

// Snapshot returns the bounded app-scoped projection and the cursor its
// subscription must continue from.
func (center *CommandCenter) Snapshot() (DirectorSnapshot, error) {
	if err := center.available(); err != nil {
		return DirectorSnapshot{}, err
	}
	return center.registry.Snapshot()
}

// Subscribe continues the pushed app-scoped stream from a cursor.
func (center *CommandCenter) Subscribe(cursor DirectorEventCursor) (DirectorEventSubscription, error) {
	if err := center.available(); err != nil {
		return nil, err
	}
	return center.registry.Subscribe(cursor)
}

// Dispatch carries out one intent. Selection is durable app state, so a
// dispatch commits a fact and the resulting change reaches every subscriber
// through the same fold every other change does.
func (center *CommandCenter) Dispatch(ctx context.Context, intent DirectorIntent) (DirectorReceipt, error) {
	if err := center.available(); err != nil {
		return DirectorReceipt{}, err
	}
	if ctx == nil {
		return DirectorReceipt{}, errors.New("director dispatch context is required")
	}
	if err := ValidateDirectorIntent(intent); err != nil {
		return DirectorReceipt{}, fmt.Errorf("%w: %w", ErrDirectorIntentRejected, err)
	}
	receipt, err := center.carryOut(ctx, intent)
	if err != nil {
		return DirectorReceipt{}, err
	}
	if err := ValidateDirectorReceipt(receipt); err != nil {
		return DirectorReceipt{}, err
	}
	return receipt, nil
}

func (center *CommandCenter) carryOut(
	ctx context.Context,
	intent DirectorIntent,
) (DirectorReceipt, error) {
	receipt := DirectorReceipt{Kind: intent.Kind}
	switch intent.Kind {
	case DirectorIntentSubmit:
		executed, err := center.submit(ctx, *intent.Submit)
		if err != nil {
			return DirectorReceipt{}, err
		}
		receipt.Submit = &executed
		return receipt, nil
	case DirectorIntentSelectWorkstream:
		selected, err := center.registry.SelectWorkstream(ctx, intent.SelectWorkstream.WorkstreamID)
		if err != nil {
			return DirectorReceipt{}, err
		}
		receipt.SelectedWorkstreamID = selected
		return receipt, nil
	case DirectorIntentMoveSelection:
		selected, err := center.registry.MoveSelection(ctx, intent.MoveSelection.Direction)
		if err != nil {
			return DirectorReceipt{}, err
		}
		receipt.SelectedWorkstreamID = selected
		return receipt, nil
	default:
		if err := center.command(ctx, intent); err != nil {
			return DirectorReceipt{}, err
		}
		return receipt, nil
	}
}

// command carries out one direct command. It reports nothing, because what it
// changed is durable and arrives on the pushed stream; an unknown kind fails here
// rather than being accepted as a dispatch that did nothing.
func (center *CommandCenter) command(ctx context.Context, intent DirectorIntent) error {
	switch intent.Kind {
	case DirectorIntentCancelRun:
		return center.executor.CancelRun(ctx, *intent.CancelRun)
	case DirectorIntentResolveApproval:
		return center.executor.ResolveApproval(ctx, *intent.ResolveApproval)
	case DirectorIntentResolveResourceRequest:
		return center.executor.ResolveResourceRequest(ctx, *intent.ResolveResourceRequest)
	default:
		return fmt.Errorf("unknown director intent kind %q", intent.Kind)
	}
}

// submit carries one request from the user's words to the work they produce:
// accept the intent, route it against trusted state, and execute the decision
// that came back.
func (center *CommandCenter) submit(
	ctx context.Context,
	payload DirectorSubmitIntent,
) (ExecutedDecision, error) {
	intent, err := center.acceptIntent(payload)
	if err != nil {
		return ExecutedDecision{}, err
	}
	routed, err := center.route(ctx, intent)
	if err != nil {
		return ExecutedDecision{}, err
	}
	// Execution failures are returned as they are. A rejected target is the
	// caller's mistake and already typed; anything else is a durable-write or
	// provider condition the shell reports, and calling it an unavailable command
	// center would name the wrong thing.
	return center.executor.Execute(ctx, routed)
}

// acceptIntent mints the durable identity of one submitted request. The id and
// the accepted-at stamp are product state: a caller that could choose them could
// replay another request's identity.
func (center *CommandCenter) acceptIntent(payload DirectorSubmitIntent) (SubmittedIntent, error) {
	intentID, err := center.newID("director-intent")
	if err != nil {
		return SubmittedIntent{}, err
	}
	intent := SubmittedIntent{
		ID:          intentID,
		Text:        payload.Text,
		Modality:    payload.Modality,
		SubmittedAt: center.now().UTC().Format(time.RFC3339Nano),
	}
	if err := validateSubmittedIntent(intent); err != nil {
		return SubmittedIntent{}, fmt.Errorf("%w: %w", ErrDirectorIntentRejected, err)
	}
	return intent, nil
}

// route resolves what the request meant. Invalid model output never reaches
// here, because the recovery ladder inside the router resolves it; what can
// reach here is a Director the app could not reach at all, which is a runtime
// condition rather than the caller's mistake.
func (center *CommandCenter) route(
	ctx context.Context,
	intent SubmittedIntent,
) (RoutedIntent, error) {
	routed, err := center.router.Route(ctx, intent)
	if err == nil {
		return routed, nil
	}
	if errors.Is(err, ErrDirectorIntentRejected) || errors.Is(err, ErrDirectorUnavailable) {
		return RoutedIntent{}, err
	}
	return RoutedIntent{}, fmt.Errorf("%w: %w", ErrDirectorUnavailable, err)
}
