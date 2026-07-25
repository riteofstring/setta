package director

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
//  3. carry the decision out through the same executor the user's own direct
//     commands run through.
//
// A receipt says what happened in the app's vocabulary — the action, the ids it
// touched, and what the user can now see. It is deliberately not an
// implementation dump: the Director explains the receipt to the user, so
// anything in it is something the user may be told.

// SettaToolNamespace is the tool namespace the Director controls Setta through.
const SettaToolNamespace = "setta"

const settaToolNamespaceDescription = "Setta app-control tools. Call these to change what Setta is doing: " +
	"listing workspaces and workstreams, creating and selecting a workstream, sending or steering work, " +
	"and recovering failed work. Answer in prose only when the user wants conversation, explanation, or " +
	"planning; anything that changes the app happens through these tools."

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
	WorkstreamID   string           `json:"workstreamId"`
	Title          string           `json:"title"`
	Status         WorkstreamStatus `json:"status"`
	Selected       bool             `json:"selected"`
	HasActiveRun   bool             `json:"hasActiveRun"`
	QueuedRunCount int              `json:"queuedRunCount"`
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
				"which one is selected.",
			InputSchema: settaToolSchema(nil, nil),
			Handler:     box.listWorkstreams(intent),
		},
		{
			Name: "create_workstream",
			Description: "Create a new workstream and select it. Supply workspaceId from list_workspaces to " +
				"scope it to a folder, or omit it for a folderless workstream that will ask the user for one. " +
				"Supply initialInput to start work immediately.",
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

type settaRecoverArguments struct {
	WorkstreamID   string `json:"workstreamId"`
	FailureEventID string `json:"failureEventId"`
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
	decoder := json.NewDecoder(bytes.NewReader(arguments))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
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
