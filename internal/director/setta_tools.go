package director

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/jsonio"
)

// The `setta` meta-tool namespace: the Director's authority over the app.
//
// The Director is a normal Codex conversation. It answers, explains, and asks
// questions in prose, and it changes Setta only by calling a tool here. That
// split is the whole design: prose is never treated as proof that app state
// changed, and every state change is a typed call trusted code authorized
// against the durable registry before it ran.
//
// Each handler follows the same three steps, in this order:
//
//  1. materialize the trusted decision context from the registry, at call time
//     rather than at turn start, because the Director may act on what an
//     earlier tool call in the same turn just changed;
//  2. authorize the arguments against that context, so a workstream the
//     Director cannot currently see cannot be targeted and a folder can only be
//     named by an id the app offered;
//  3. carry the action out through the same executor the user's own direct
//     commands run through.
//
// A tool commits a durable Director decision only when the action it takes has
// no durable record of its own. Creating, selecting, sending, steering, and
// recovering do: the decision is what the graph explains that work with.
// Stopping a run, retitling a workstream, and retiring one do not, because the
// conversation already commits the interruption and the changed record, and a
// second Director account of the same event could only disagree with it. Every
// call is durable either way — the Director conversation keeps the call and the
// receipt it was given.
//
// A receipt says what happened in the app's vocabulary — the action, the ids it
// touched, and what the user can now see. It is deliberately not an
// implementation dump: the Director explains the receipt to the user, so
// anything in it is something the user may be told.

// SettaToolNamespace is the tool namespace the Director controls Setta through.
const SettaToolNamespace = "setta"

const settaToolNamespaceDescription = "Setta app-control tools. Call these to see and change what Setta is doing: " +
	"listing workspaces, workstreams, and current activity; creating, selecting, renaming, and archiving a " +
	"workstream; sending, steering, and stopping work; answering an approval; attaching a folder work is " +
	"waiting for; and recovering failed work. Answer in prose only when the user wants conversation, " +
	"explanation, or planning; anything that changes the app happens through these tools."

// SettaToolNamespaceDescription is what the namespace is for. The provider
// shows it beside the tool list, so it states the boundary rather than the
// catalog: prose for conversation, tools for anything that changes the app.
func SettaToolNamespaceDescription() string {
	return settaToolNamespaceDescription
}

// MaxSettaToolListedWorkstreams bounds how many workstreams one listing tool
// reports. The registry already bounds the routing window; this makes the bound
// explicit at the tool boundary so a receipt can never grow with the app.
const MaxSettaToolListedWorkstreams = MaxDecisionWorkstreamTargets

// SettaToolHandler runs one tool call and reports what it did.
type SettaToolHandler func(context.Context, json.RawMessage) (SettaToolReceipt, error)

// SettaTool is one Setta meta-tool, named inside the `setta` namespace.
type SettaTool struct {
	Name        string
	Description string
	InputSchema json.RawMessage
	Handler     SettaToolHandler
}

// SettaWorkstreamSummary is one workstream as the Director sees it. It carries
// the workstream's own identity and run state and nothing about panes,
// conversations, provider threads, or filesystem paths.
type SettaWorkstreamSummary struct {
	WorkstreamID        string                       `json:"workstreamId"`
	Title               string                       `json:"title"`
	Status              WorkstreamStatus             `json:"status"`
	Selected            bool                         `json:"selected"`
	HasActiveRun        bool                         `json:"hasActiveRun"`
	QueuedRunCount      int                          `json:"queuedRunCount"`
	RecoverableFailures []DecisionRecoverableFailure `json:"recoverableFailures"`
	// WorkspaceID is the folder the workstream is scoped to, null when it is a
	// folderless workstream waiting for one.
	WorkspaceID *string `json:"workspaceId"`
}

// SettaToolReceipt is what one tool call reports back to the Director. Only the
// fields the tool actually produced are populated, so a receipt cannot imply an
// effect the call did not have.
type SettaToolReceipt struct {
	Tool    string `json:"tool"`
	Summary string `json:"summary"`
	// WorkstreamID is the workstream the call acted on or created.
	WorkstreamID *string `json:"workstreamId,omitempty"`
	// SelectedWorkstreamID is the app-wide selection after the call.
	SelectedWorkstreamID *string `json:"selectedWorkstreamId,omitempty"`
	// ResourceRequestID names the durable request work is waiting on when the
	// workstream could not start it yet.
	ResourceRequestID *string                   `json:"resourceRequestId,omitempty"`
	Workspaces        []DecisionWorkspaceOption `json:"workspaces,omitempty"`
	Workstreams       []SettaWorkstreamSummary  `json:"workstreams,omitempty"`
	// Approvals and ResourceRequests are what the app is currently waiting on
	// somebody to answer or supply.
	Approvals        []SettaApprovalSummary        `json:"approvals,omitempty"`
	ResourceRequests []SettaResourceRequestSummary `json:"resourceRequests,omitempty"`
	// Aggregates are the app-wide counts, which only the activity tool reports.
	Aggregates *DirectorAggregates `json:"aggregates,omitempty"`
}

// SettaToolbox builds the tool catalog one Director turn is given. It holds the
// registry the calls are authorized against and the executor they run through,
// and no provider identity at all: what a tool call is worth is a product
// question, not a Codex one.
type SettaToolbox struct {
	registry *Registry
	executor *DecisionExecutor
}

// NewSettaToolbox builds the catalog over trusted state and the execution port.
func NewSettaToolbox(registry *Registry, executor *DecisionExecutor) (*SettaToolbox, error) {
	if registry == nil || executor == nil {
		return nil, errors.New("setta toolbox requires the registry and the decision executor")
	}
	return &SettaToolbox{registry: registry, executor: executor}, nil
}

// Tools returns the catalog bound to one submitted intent. The intent is what
// the durable decision each call commits is recorded against, so the Director's
// tool calls stay attributable to the request that produced them.
func (box *SettaToolbox) Tools(intent SubmittedIntent) ([]SettaTool, error) {
	if box == nil || box.registry == nil || box.executor == nil {
		return nil, ErrDirectorUnavailable
	}
	if err := validateSubmittedIntent(intent); err != nil {
		return nil, err
	}
	return []SettaTool{
		{
			Name: "list_workspaces",
			Description: "List the local workspaces this Setta profile can currently open work in. " +
				"Workspaces are named by id; never invent a filesystem path.",
			InputSchema: settaToolSchema(nil, nil),
			Handler:     box.listWorkspaces(intent),
		},
		{
			Name: "list_workstreams",
			Description: "List the workstreams the app is currently tracking, with their run state and " +
				"which one is selected, including any durable failures that can be recovered.",
			InputSchema: settaToolSchema(nil, nil),
			Handler:     box.listWorkstreams(intent),
		},
		{
			Name: "read_activity",
			Description: "Report what Setta is doing right now: the app-wide counts, every tracked workstream, " +
				"the approvals waiting for an answer, and the folders work is waiting for. Call this to answer " +
				"\"what is happening?\" instead of guessing, and to get the ids resolve_approval and " +
				"resolve_resource_request need.",
			InputSchema: settaToolSchema(nil, nil),
			Handler:     box.readActivity(intent),
		},
		{
			Name: "create_workstream",
			Description: "Create a new workstream and select it. Supply workspaceId from list_workspaces to " +
				"scope it to a folder, or set it to null for a folderless workstream that will ask the user for one. " +
				"Supply initialInput to start work immediately, or set it to null to create the workstream idle.",
			InputSchema: settaToolSchema(map[string]any{
				"title":        settaToolString("A short human title for the new workstream.", MaxDecisionTitleBytes),
				"workspaceId":  settaToolNullableString("The workspace id from list_workspaces, or null for a folderless workstream.", MaxDecisionReferenceBytes),
				"initialInput": settaToolNullableString("The first instruction to run in the new workstream, or null to create it idle.", MaxDecisionAuthoredInputBytes),
			}, []string{"title", "workspaceId", "initialInput"}),
			Handler: box.createWorkstream(intent),
		},
		{
			Name:        "select_workstream",
			Description: "Make an existing workstream the one the user is looking at.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId": settaToolString("The workstream id from list_workstreams.", MaxDecisionReferenceBytes),
			}, []string{"workstreamId"}),
			Handler: box.selectWorkstream(intent),
		},
		{
			Name:        "rename_workstream",
			Description: "Give an existing workstream a new title.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId": settaToolString("The workstream id from list_workstreams.", MaxDecisionReferenceBytes),
				"title":        settaToolString("The new human title for that workstream.", MaxDecisionTitleBytes),
			}, []string{"workstreamId", "title"}),
			Handler: box.renameWorkstream(intent),
		},
		{
			Name: "archive_workstream",
			Description: "Retire a workstream the user is finished with, so it stops appearing as active work. " +
				"Its history is kept. Only a workstream with nothing outstanding can be archived: stop its run, " +
				"answer its approvals, and settle its resource requests first.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId": settaToolString("The workstream id from list_workstreams.", MaxDecisionReferenceBytes),
			}, []string{"workstreamId"}),
			Handler: box.archiveWorkstream(intent),
		},
		{
			Name: "submit_work",
			Description: "Send an instruction to an existing workstream. Setta starts it immediately when the " +
				"workstream is idle and queues it behind the active run when it is busy.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId": settaToolString("The workstream id from list_workstreams.", MaxDecisionReferenceBytes),
				"input":        settaToolString("The instruction to run in that workstream.", MaxDecisionAuthoredInputBytes),
			}, []string{"workstreamId", "input"}),
			Handler: box.submitWork(intent),
		},
		{
			Name: "steer_work",
			Description: "Change what the active run in a workstream is doing, without waiting for it to finish. " +
				"Only valid while that workstream has a run in flight.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId": settaToolString("The workstream id whose active run should change course.", MaxDecisionReferenceBytes),
				"input":        settaToolString("The new instruction for the run in flight.", MaxDecisionAuthoredInputBytes),
			}, []string{"workstreamId", "input"}),
			Handler: box.steerWork(intent),
		},
		{
			Name: "cancel_run",
			Description: "Stop the run a workstream is carrying now. Work queued behind it stays queued, so the " +
				"workstream starts the next item rather than going idle.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId": settaToolString("The workstream whose run should stop.", MaxDecisionReferenceBytes),
			}, []string{"workstreamId"}),
			Handler: box.cancelRun(intent),
		},
		{
			Name: "resolve_approval",
			Description: "Answer an approval a run is waiting on, using an approvalId from read_activity. " +
				"Supply answers only for the \"answered\" decision, one entry per question the approval asks. " +
				"An approval marked secret is the user's to answer: tell them it is waiting instead of calling this.",
			InputSchema: settaToolSchema(map[string]any{
				"approvalId": settaToolString("The approval id from read_activity.", MaxDecisionReferenceBytes),
				"decision": settaToolEnum(
					"What to answer the approval with.",
					approvalDecisionValues(),
				),
				"answers": settaToolApprovalAnswers(
					"The structured answers for an \"answered\" decision, or null for every other decision.",
				),
			}, []string{"approvalId", "decision", "answers"}),
			Handler: box.resolveApproval(),
		},
		{
			Name: "resolve_resource_request",
			Description: "Attach a folder to the workstream one open request is waiting for, using a requestId " +
				"from read_activity and a workspaceId from list_workspaces. The work that could not start is not " +
				"queued, so send it again with submit_work afterwards.",
			InputSchema: settaToolSchema(map[string]any{
				"requestId":   settaToolString("The resource request id from read_activity.", MaxDecisionReferenceBytes),
				"workspaceId": settaToolString("The workspace id from list_workspaces.", MaxDecisionReferenceBytes),
			}, []string{"requestId", "workspaceId"}),
			Handler: box.resolveResourceRequest(intent),
		},
		{
			Name: "recover_run",
			Description: "Restart work that a durable failure interrupted. failureEventId must be one the " +
				"workstream currently reports as recoverable.",
			InputSchema: settaToolSchema(map[string]any{
				"workstreamId":   settaToolString("The workstream that failed.", MaxDecisionReferenceBytes),
				"failureEventId": settaToolString("The recoverable failure event id reported for that workstream.", MaxDecisionReferenceBytes),
			}, []string{"workstreamId", "failureEventId"}),
			Handler: box.recoverRun(intent),
		},
	}, nil
}

type settaCreateWorkstreamArguments struct {
	Title        string  `json:"title"`
	WorkspaceID  *string `json:"workspaceId"`
	InitialInput *string `json:"initialInput"`
}

type settaWorkstreamArguments struct {
	WorkstreamID string `json:"workstreamId"`
}

type settaWorkArguments struct {
	WorkstreamID string `json:"workstreamId"`
	Input        string `json:"input"`
}

type settaRenameArguments struct {
	WorkstreamID string `json:"workstreamId"`
	Title        string `json:"title"`
}

type settaRecoverArguments struct {
	WorkstreamID   string `json:"workstreamId"`
	FailureEventID string `json:"failureEventId"`
}

// offeredTarget resolves one workstream the Director may currently act on.
// Trusted state is materialized at call time, so an id that has since been
// archived, or was never offered at all, is refused before any effect rather
// than resolved by the execution port.
func (box *SettaToolbox) offeredTarget(
	intent SubmittedIntent,
	workstreamID string,
) (WorkstreamDecisionTarget, error) {
	decisionContext, err := box.registry.DecisionContext(intent)
	if err != nil {
		return WorkstreamDecisionTarget{}, err
	}
	target, offered := decisionContext.Target(workstreamID)
	if !offered {
		return WorkstreamDecisionTarget{}, fmt.Errorf(
			"%w: workstream %s is not one the Director can currently act on",
			ErrDirectorIntentRejected,
			workstreamID,
		)
	}
	return target, nil
}

func (box *SettaToolbox) listWorkspaces(intent SubmittedIntent) SettaToolHandler {
	return func(_ context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		if err := decodeSettaToolArguments(arguments, &struct{}{}); err != nil {
			return SettaToolReceipt{}, err
		}
		decisionContext, err := box.registry.DecisionContext(intent)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		return SettaToolReceipt{
			Tool:       "list_workspaces",
			Summary:    fmt.Sprintf("%d workspace(s) are open.", len(decisionContext.Workspaces)),
			Workspaces: append([]DecisionWorkspaceOption{}, decisionContext.Workspaces...),
		}, nil
	}
}

func (box *SettaToolbox) listWorkstreams(intent SubmittedIntent) SettaToolHandler {
	return func(_ context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		if err := decodeSettaToolArguments(arguments, &struct{}{}); err != nil {
			return SettaToolReceipt{}, err
		}
		decisionContext, err := box.registry.DecisionContext(intent)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		summaries := settaWorkstreamSummaries(decisionContext)
		return SettaToolReceipt{
			Tool:                 "list_workstreams",
			Summary:              fmt.Sprintf("%d workstream(s) are being tracked.", len(summaries)),
			SelectedWorkstreamID: copyOptionalString(decisionContext.SelectedID),
			Workstreams:          summaries,
		}, nil
	}
}

func settaWorkstreamSummaries(decisionContext DirectorDecisionContext) []SettaWorkstreamSummary {
	summaries := make([]SettaWorkstreamSummary, 0, len(decisionContext.Workstreams))
	for _, target := range decisionContext.Workstreams {
		if len(summaries) == MaxSettaToolListedWorkstreams {
			break
		}
		selected := decisionContext.SelectedID != nil && *decisionContext.SelectedID == target.WorkstreamID
		summary := SettaWorkstreamSummary{
			WorkstreamID:   target.WorkstreamID,
			Title:          target.Title,
			Status:         target.Status,
			Selected:       selected,
			HasActiveRun:   target.ActiveRunID != nil,
			QueuedRunCount: target.QueuedRunCount,
			RecoverableFailures: append(
				[]DecisionRecoverableFailure{},
				target.RecoverableFailures...,
			),
		}
		if target.ResourceScope.Kind == WorkstreamResourceScopeFolder {
			workspaceID := target.ResourceScope.Folder.WorkspaceID
			summary.WorkspaceID = &workspaceID
		}
		summaries = append(summaries, summary)
	}
	return summaries
}

func (box *SettaToolbox) createWorkstream(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaCreateWorkstreamArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		scope := DecisionResourceScope{Kind: WorkstreamResourceScopeFolderless}
		if payload.WorkspaceID != nil {
			scope = DecisionResourceScope{
				Kind:   WorkstreamResourceScopeFolder,
				Folder: &DecisionFolderResource{WorkspaceID: *payload.WorkspaceID},
			}
		}
		decision := DirectorDecision{
			Kind: DirectorDecisionCreateWorkstream,
			CreateWorkstream: &CreateWorkstreamDecision{
				Origin: WorkstreamCreationOrigin{
					Kind: WorkstreamCreationRoot,
					Root: &RootWorkstreamOrigin{ResourceScope: scope},
				},
				InitialInput:  optionalSettaText(payload.InitialInput),
				ProposedTitle: payload.Title,
			},
		}
		return box.execute(ctx, intent, "create_workstream", decision)
	}
}

func (box *SettaToolbox) selectWorkstream(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaWorkstreamArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		return box.execute(ctx, intent, "select_workstream", DirectorDecision{
			Kind:             DirectorDecisionSelectWorkstream,
			SelectWorkstream: &SelectWorkstreamDecision{WorkstreamID: payload.WorkstreamID},
		})
	}
}

// submitWork chooses between starting work now and queueing it behind the run
// already in flight. That is a product rule rather than a judgement call: the
// workstream's own run state decides, so the Director cannot accidentally
// discard an active run by asking for the wrong one.
func (box *SettaToolbox) submitWork(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaWorkArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		decisionContext, err := box.registry.DecisionContext(intent)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		target, offered := decisionContext.Target(payload.WorkstreamID)
		if !offered {
			return SettaToolReceipt{}, fmt.Errorf(
				"%w: workstream %s is not one the Director can currently act on",
				ErrDirectorIntentRejected,
				payload.WorkstreamID,
			)
		}
		decision := DirectorDecision{
			Kind:             DirectorDecisionSendToWorkstream,
			SendToWorkstream: &SendToWorkstreamDecision{WorkstreamID: payload.WorkstreamID, AuthoredInput: payload.Input},
		}
		if target.ActiveRunID != nil {
			decision = DirectorDecision{
				Kind:           DirectorDecisionQueueBehindRun,
				QueueBehindRun: &QueueBehindRunDecision{WorkstreamID: payload.WorkstreamID, AuthoredInput: payload.Input},
			}
		}
		return box.executeWithContext(ctx, intent, decisionContext, "submit_work", decision)
	}
}

func (box *SettaToolbox) steerWork(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaWorkArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		return box.execute(ctx, intent, "steer_work", DirectorDecision{
			Kind:     DirectorDecisionSteerRun,
			SteerRun: &SteerRunDecision{WorkstreamID: payload.WorkstreamID, AuthoredInput: payload.Input},
		})
	}
}

// cancelRun stops whatever the workstream is carrying now. The Director names
// the workstream rather than the run, because it is not looking at a rendered
// frame: what it means is "stop what that work is doing", and the run that
// answers to is trusted state resolved at the moment of the call.
func (box *SettaToolbox) cancelRun(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaWorkstreamArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		target, err := box.offeredTarget(intent, payload.WorkstreamID)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		if target.ActiveRunID == nil {
			return SettaToolReceipt{}, fmt.Errorf(
				"%w: workstream %s has no run in flight to stop",
				ErrDirectorIntentRejected,
				payload.WorkstreamID,
			)
		}
		if err := box.executor.CancelRun(ctx, DirectorCancelRunIntent{
			WorkstreamID: payload.WorkstreamID,
			RunID:        *target.ActiveRunID,
		}); err != nil {
			return SettaToolReceipt{}, err
		}
		workstreamID := payload.WorkstreamID
		return SettaToolReceipt{
			Tool:         "cancel_run",
			Summary:      fmt.Sprintf("Stopped the run in %q.", target.Title),
			WorkstreamID: &workstreamID,
		}, nil
	}
}

func (box *SettaToolbox) renameWorkstream(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaRenameArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		if err := validateDecisionText("workstream title", payload.Title, MaxDecisionTitleBytes); err != nil {
			return SettaToolReceipt{}, err
		}
		target, err := box.offeredTarget(intent, payload.WorkstreamID)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		if err := box.executor.RenameWorkstream(ctx, payload.WorkstreamID, payload.Title); err != nil {
			return SettaToolReceipt{}, err
		}
		workstreamID := payload.WorkstreamID
		return SettaToolReceipt{
			Tool:         "rename_workstream",
			Summary:      fmt.Sprintf("Renamed %q to %q.", target.Title, payload.Title),
			WorkstreamID: &workstreamID,
		}, nil
	}
}

func (box *SettaToolbox) archiveWorkstream(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaWorkstreamArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		target, err := box.offeredTarget(intent, payload.WorkstreamID)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		if err := box.executor.ArchiveWorkstream(ctx, payload.WorkstreamID); err != nil {
			return SettaToolReceipt{}, err
		}
		workstreamID := payload.WorkstreamID
		return SettaToolReceipt{
			Tool:         "archive_workstream",
			Summary:      fmt.Sprintf("Archived %q, so it is no longer active work.", target.Title),
			WorkstreamID: &workstreamID,
		}, nil
	}
}

func (box *SettaToolbox) recoverRun(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaRecoverArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		return box.execute(ctx, intent, "recover_run", DirectorDecision{
			Kind: DirectorDecisionRecoverPath,
			RecoverPath: &RecoverPathDecision{
				WorkstreamID:   payload.WorkstreamID,
				FailureEventID: payload.FailureEventID,
			},
		})
	}
}

func (box *SettaToolbox) execute(
	ctx context.Context,
	intent SubmittedIntent,
	tool string,
	decision DirectorDecision,
) (SettaToolReceipt, error) {
	decisionContext, err := box.registry.DecisionContext(intent)
	if err != nil {
		return SettaToolReceipt{}, err
	}
	return box.executeWithContext(ctx, intent, decisionContext, tool, decision)
}

// executeWithContext authorizes the arguments and carries the decision out. The
// decision's own shape is checked first so a malformed argument is reported as
// the argument it came from, and authority is checked second so a well-formed
// call to something trusted state does not offer is refused before any effect.
func (box *SettaToolbox) executeWithContext(
	ctx context.Context,
	intent SubmittedIntent,
	decisionContext DirectorDecisionContext,
	tool string,
	decision DirectorDecision,
) (SettaToolReceipt, error) {
	if err := decision.Validate(); err != nil {
		return SettaToolReceipt{}, err
	}
	if err := ValidateDecisionAuthority(decisionContext, decision); err != nil {
		return SettaToolReceipt{}, err
	}
	executed, err := box.executor.Execute(ctx, AuthorizedDecision{
		Intent:   intent,
		Context:  decisionContext,
		Decision: decision,
	})
	if err != nil {
		return SettaToolReceipt{}, err
	}
	return SettaToolReceipt{
		Tool:                 tool,
		Summary:              executed.Summary,
		WorkstreamID:         copyOptionalString(executed.WorkstreamID),
		SelectedWorkstreamID: copyOptionalString(executed.SelectedWorkstreamID),
		ResourceRequestID:    copyOptionalString(executed.ResourceRequestID),
	}, nil
}

// decodeSettaToolArguments rejects anything the tool's schema did not declare.
// A silently ignored field would let the Director believe it constrained a call
// the app never saw the constraint for.
func decodeSettaToolArguments(arguments json.RawMessage, target any) error {
	if len(arguments) == 0 {
		arguments = json.RawMessage("{}")
	}
	if err := jsonio.DecodeSingle(bytes.NewReader(arguments), target); err != nil {
		return fmt.Errorf("%w: decode setta tool arguments: %w", ErrDirectorIntentRejected, err)
	}
	return nil
}

func optionalSettaText(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func settaToolSchema(properties map[string]any, required []string) json.RawMessage {
	if properties == nil {
		properties = map[string]any{}
	}
	if required == nil {
		required = []string{}
	}
	raw, err := json.Marshal(map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	})
	if err != nil {
		// The schema is built from literals owned here, so a failure would mean
		// this file cannot describe its own tools.
		panic("encode setta tool schema: " + err.Error())
	}
	return raw
}

func settaToolString(description string, maximum int) map[string]any {
	return map[string]any{
		"type":        "string",
		"description": description,
		"minLength":   1,
		"maxLength":   maximum,
	}
}

func settaToolNullableString(description string, maximum int) map[string]any {
	return map[string]any{
		"type":        []string{"string", "null"},
		"description": description,
		"minLength":   1,
		"maxLength":   maximum,
	}
}
