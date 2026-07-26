package director

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/conversation"
)

// What the app is waiting on, and answering it.
//
// Three of the `setta` tools are about the things that stop being work and
// start being questions: what is happening right now, an approval a run cannot
// continue without, and a folder work has nowhere to run inside. They share a
// shape the other tools do not. Their ids come from the activity report rather
// than from the workstream listing, and their receipts describe state the user
// is being asked about rather than an effect on one workstream.
//
// The one refusal that matters here is the secret approval. Its answer is a
// credential that reaches the provider which asked for it and never becomes
// durable, so a model authoring one would be inventing the user's secret rather
// than relaying it.

// SettaApprovalQuestion is one question an approval is waiting on. The question
// itself is public; only the answer to a secret one is not.
type SettaApprovalQuestion struct {
	QuestionID  string   `json:"questionId"`
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	AllowsOther bool     `json:"allowsOther"`
}

// SettaApprovalSummary is one approval a run is waiting on. Secret marks the
// ones the Director must not answer: the answer is a credential the user
// supplies in the app, not something a model may author for them.
type SettaApprovalSummary struct {
	ApprovalID   string                  `json:"approvalId"`
	WorkstreamID string                  `json:"workstreamId"`
	Summary      string                  `json:"summary"`
	Questions    []SettaApprovalQuestion `json:"questions"`
	Secret       bool                    `json:"secret"`
}

// SettaResourceRequestSummary is one resource a workstream needs before its
// work can run.
type SettaResourceRequestSummary struct {
	RequestID    string                 `json:"requestId"`
	WorkstreamID string                 `json:"workstreamId"`
	Kind         WorkstreamResourceKind `json:"kind"`
	Summary      string                 `json:"summary"`
}

type settaApprovalArguments struct {
	ApprovalID string                                  `json:"approvalId"`
	Decision   conversation.TrajectoryApprovalDecision `json:"decision"`
	// Answers is null for every decision but an answered one, so the absent
	// case is decoded rather than rejected.
	Answers []conversation.ConversationApprovalAnswer `json:"answers"`
}

type settaResourceArguments struct {
	RequestID   string `json:"requestId"`
	WorkspaceID string `json:"workspaceId"`
}

// readActivity answers "what is happening?" from durable state. It is the only
// tool that reports the app-wide counts, and it is where the ids for answering
// an approval or supplying a folder come from, so the Director never has to
// invent one to act on a blocker.
func (box *SettaToolbox) readActivity(intent SubmittedIntent) SettaToolHandler {
	return func(_ context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		if err := decodeSettaToolArguments(arguments, &struct{}{}); err != nil {
			return SettaToolReceipt{}, err
		}
		decisionContext, err := box.registry.DecisionContext(intent)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		activity, err := box.registry.Activity()
		if err != nil {
			return SettaToolReceipt{}, err
		}
		aggregates := activity.Aggregates
		return SettaToolReceipt{
			Tool:                 "read_activity",
			Summary:              settaActivitySummary(aggregates),
			SelectedWorkstreamID: copyOptionalString(decisionContext.SelectedID),
			Workstreams:          settaWorkstreamSummaries(decisionContext),
			Approvals:            settaApprovalSummaries(activity.PendingApprovals),
			ResourceRequests:     settaResourceRequestSummaries(activity.OpenResourceRequests),
			Aggregates:           &aggregates,
		}, nil
	}
}

func settaActivitySummary(aggregates DirectorAggregates) string {
	return fmt.Sprintf(
		"%s tracked: %d running, %d queued, %d waiting for an answer, %d waiting for a folder, %d failed.",
		pluralCount(aggregates.WorkstreamCount, "workstream"),
		aggregates.RunningCount,
		aggregates.QueuedCount,
		aggregates.AwaitingApprovalCount,
		aggregates.AwaitingResourceCount,
		aggregates.FailedCount,
	)
}

// settaApprovalSummaries reports what each approval is asking without the
// provider text behind it. The registry already bounds how many it returns, so
// this maps rather than truncates.
func settaApprovalSummaries(approvals []ApprovalRequest) []SettaApprovalSummary {
	summaries := make([]SettaApprovalSummary, 0, len(approvals))
	for _, approval := range approvals {
		questions := make([]SettaApprovalQuestion, 0, len(approval.Questions))
		for _, question := range approval.Questions {
			questions = append(questions, SettaApprovalQuestion{
				QuestionID:  question.ID,
				Question:    boundDecisionExcerpt(question.Question),
				Options:     append([]string{}, question.Options...),
				AllowsOther: question.AllowsOther,
			})
		}
		summaries = append(summaries, SettaApprovalSummary{
			ApprovalID:   approval.ID,
			WorkstreamID: approval.WorkstreamID,
			Summary:      boundDecisionExcerpt(approval.PublicSummary),
			Questions:    questions,
			Secret:       approval.Secret,
		})
	}
	return summaries
}

func settaResourceRequestSummaries(requests []ResourceRequest) []SettaResourceRequestSummary {
	summaries := make([]SettaResourceRequestSummary, 0, len(requests))
	for _, request := range requests {
		summaries = append(summaries, SettaResourceRequestSummary{
			RequestID:    request.ID,
			WorkstreamID: request.WorkstreamID,
			Kind:         request.Kind,
			Summary:      boundDecisionExcerpt(request.PublicSummary),
		})
	}
	return summaries
}

// resolveApproval answers one approval on the user's behalf, and refuses to
// answer the ones that are not the Director's to answer. A secret answer is a
// credential: it reaches the provider that asked for it and never becomes
// durable, so a model authoring one would be inventing the user's secret.
func (box *SettaToolbox) resolveApproval() SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaApprovalArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		approval, err := box.registry.PendingApproval(payload.ApprovalID)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		if approval.Secret {
			return SettaToolReceipt{}, fmt.Errorf(
				"%w: approval %s asks for a secret only the user can supply, so ask them to answer it in the app",
				ErrDirectorIntentRejected,
				payload.ApprovalID,
			)
		}
		answers := payload.Answers
		if answers == nil {
			answers = []conversation.ConversationApprovalAnswer{}
		}
		// The conversation owns what an approval answer may carry, so its own
		// rule is what the arguments are checked against rather than a second
		// copy of it here.
		response := conversation.ConversationApprovalResponse{
			ApprovalID: payload.ApprovalID,
			Decision:   payload.Decision,
			Answers:    answers,
		}
		if err := response.Validate(); err != nil {
			return SettaToolReceipt{}, fmt.Errorf("%w: %w", ErrDirectorIntentRejected, err)
		}
		if err := box.executor.ResolveApproval(ctx, DirectorResolveApprovalIntent{
			ApprovalID: response.ApprovalID,
			Decision:   response.Decision,
			Answers:    response.Answers,
		}); err != nil {
			return SettaToolReceipt{}, err
		}
		workstreamID := approval.WorkstreamID
		return SettaToolReceipt{
			Tool:         "resolve_approval",
			Summary:      fmt.Sprintf("Answered %q with %q.", approval.PublicSummary, response.Decision),
			WorkstreamID: &workstreamID,
		}, nil
	}
}

// resolveResourceRequest attaches the folder a blocked workstream is waiting
// for. Binding the folder is all it does: the work that could not start was
// never accepted, so the receipt says to send it again rather than implying the
// app resumed something on its own.
func (box *SettaToolbox) resolveResourceRequest(intent SubmittedIntent) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload settaResourceArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return SettaToolReceipt{}, err
		}
		decisionContext, err := box.registry.DecisionContext(intent)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		workspace, offered := offeredWorkspace(decisionContext, payload.WorkspaceID)
		if !offered {
			return SettaToolReceipt{}, fmt.Errorf(
				"%w: workspace %s is not a folder the app is offering",
				ErrDirectorIntentRejected,
				payload.WorkspaceID,
			)
		}
		request, err := box.registry.OpenResourceRequestTarget(payload.RequestID)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		if err := box.executor.ResolveResourceRequest(ctx, DirectorResolveResourceRequestIntent{
			RequestID:   payload.RequestID,
			WorkspaceID: payload.WorkspaceID,
		}); err != nil {
			return SettaToolReceipt{}, err
		}
		workstreamID := request.WorkstreamID
		return SettaToolReceipt{
			Tool: "resolve_resource_request",
			Summary: fmt.Sprintf(
				"Attached the %q folder to %q. The work it was waiting for did not start, so send it again.",
				workspace.WorkspaceName,
				settaTargetTitle(decisionContext, workstreamID),
			),
			WorkstreamID: &workstreamID,
		}, nil
	}
}

func settaToolEnum(description string, values []string) map[string]any {
	return map[string]any{
		"type":        "string",
		"description": description,
		"enum":        values,
	}
}

// approvalDecisionValues is the conversation's own answer catalog. The tool
// offers exactly what the durable write accepts, so the Director cannot be
// shown a choice its call would then be refused for making.
func approvalDecisionValues() []string {
	decisions := conversation.ConversationApprovalDecisions()
	values := make([]string, 0, len(decisions))
	for _, decision := range decisions {
		values = append(values, string(decision))
	}
	return values
}

// settaToolApprovalAnswers describes the structured answers an approval asks
// for. It is nullable because most approvals ask nothing: an approve or a deny
// carries no answers at all, and the conversation refuses one that does.
func settaToolApprovalAnswers(description string) map[string]any {
	return map[string]any{
		"type":        []string{"array", "null"},
		"description": description,
		"items": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"questionId": settaToolString(
					"The question id the approval asked, from read_activity.",
					MaxDecisionReferenceBytes,
				),
				"answers": map[string]any{
					"type":        "array",
					"description": "The chosen values for that question.",
					"minItems":    1,
					"items": map[string]any{
						"type":      "string",
						"minLength": 1,
						"maxLength": MaxDecisionExcerptBytes,
					},
				},
			},
			"required":             []string{"questionId", "answers"},
			"additionalProperties": false,
		},
	}
}

// settaTargetTitle names a workstream the way the user sees it, and falls back
// to its id when trusted context is no longer offering it. A receipt is a
// report rather than authority, so it never fails for want of a title.
func settaTargetTitle(decisionContext DirectorDecisionContext, workstreamID string) string {
	if target, offered := decisionContext.Target(workstreamID); offered {
		return target.Title
	}
	return workstreamID
}
