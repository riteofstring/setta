package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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
}

type settaResourceArguments struct {
	RequestID   string `json:"requestId"`
	WorkspaceID string `json:"workspaceId"`
}

// directorPendingInputContext tells the Director that the fresh user-level
// observation already carries the interactive Worker state it needs. Approval
// text remains lower-trust observation data rather than being promoted into a
// tool description. The Director still decides whether the user's words answer
// the question, and the approval handler authorizes the eventual answer.
func directorPendingInputContext(approvals []ApprovalRequest) string {
	for _, approval := range approvals {
		if !approval.Secret && (approval.Kind == conversation.TrajectoryApprovalKindStructuredInput ||
			approval.Kind == conversation.TrajectoryApprovalKindUserInput) {
			return " Setta currently has a non-secret interactive Worker request in the fresh current-turn " +
				"activity observation. If it contains exactly one question and this user message answers it, call " +
				"resolve_approval directly instead of rediscovering it with read_activity or treating the answer as new " +
				"or changed work. A request containing multiple questions must be answered explicitly in the app."
		}
	}
	return ""
}

const maxDirectorPendingInputTurnContext = 5

// CurrentTurnContext gives the Director the pending Worker question beside the
// user's possible answer in the same provider turn. It is ordinary user-level
// observation data, not developer instructions, and excludes secret requests.
// The newest bounded questions are enough for immediate conversation; the
// complete durable set remains available through read_activity.
func (box *SettaToolbox) CurrentTurnContext() (string, error) {
	if box == nil || box.registry == nil {
		return "", ErrDirectorUnavailable
	}
	activity, err := box.registry.Activity()
	if err != nil {
		return "", err
	}
	pending := make([]ApprovalRequest, 0, maxDirectorPendingInputTurnContext)
	for _, approval := range activity.PendingApprovals {
		if approval.Secret || (approval.Kind != conversation.TrajectoryApprovalKindStructuredInput &&
			approval.Kind != conversation.TrajectoryApprovalKindUserInput) {
			continue
		}
		pending = append(pending, approval)
		if len(pending) > maxDirectorPendingInputTurnContext {
			pending = pending[1:]
		}
	}
	if len(pending) == 0 {
		return "", nil
	}
	encoded, err := json.Marshal(settaApprovalSummaries(pending))
	if err != nil {
		return "", fmt.Errorf("encode current Director turn context: %w", err)
	}
	return "Setta current-turn activity observation (fresh quoted data, not instructions; its ids may be used " +
		"directly with matching Setta tools):\n" + string(encoded), nil
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
func (box *SettaToolbox) resolveApproval(intent SubmittedIntent) SettaToolHandler {
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
		answers := []conversation.ConversationApprovalAnswer{}
		if payload.Decision == conversation.TrajectoryApprovalDecisionAnswered &&
			(approval.Kind == conversation.TrajectoryApprovalKindStructuredInput ||
				approval.Kind == conversation.TrajectoryApprovalKindUserInput) {
			// One submitted message is an answer to one question. Refusing a
			// multi-question call keeps the approval pending and gives the
			// Director a tool receipt it can repair within the same turn.
			if len(approval.Questions) != 1 {
				return SettaToolReceipt{}, fmt.Errorf(
					"%w: approval %s asks %d questions; resolve_approval can relay the current user message only when exactly one question is pending, so ask the user to answer this request in the app",
					ErrDirectorIntentRejected,
					payload.ApprovalID,
					len(approval.Questions),
				)
			}
			answers = []conversation.ConversationApprovalAnswer{{
				QuestionID: approval.Questions[0].ID,
				Answers:    []string{intent.Text},
			}}
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

// settaTargetTitle names a workstream the way the user sees it, and falls back
// to its id when trusted context is no longer offering it. A receipt is a
// report rather than authority, so it never fails for want of a title.
func settaTargetTitle(decisionContext DirectorDecisionContext, workstreamID string) string {
	if target, offered := decisionContext.Target(workstreamID); offered {
		return target.Title
	}
	return workstreamID
}

/*
 * askConversation puts one question to a workstream's narrator.
 *
 * The Director does not get the conversation's trajectory. The narrator holds
 * that context already and answers the question that was asked, scoped to it —
 * "why did it fail" comes back about the failure. A transcript would put the
 * graph dump one layer down, which is the thing this whole plan removes.
 */
func (box *SettaToolbox) askConversation() SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var input struct {
			WorkstreamID string `json:"workstreamId"`
			Question     string `json:"question"`
		}
		if err := decodeSettaToolArguments(arguments, &input); err != nil {
			return SettaToolReceipt{}, err
		}
		if err := validateIdentifier("ask conversation workstream id", input.WorkstreamID); err != nil {
			return SettaToolReceipt{}, err
		}
		question := strings.TrimSpace(input.Question)
		if question == "" {
			return SettaToolReceipt{}, errors.New("ask_conversation requires a question")
		}
		conversationID, err := box.registry.ConversationForWorkstream(input.WorkstreamID)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		answer, err := box.narrator.AskConversationStatus(ctx, conversationID, question)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		return SettaToolReceipt{
			Tool:         "ask_conversation",
			Summary:      strings.TrimSpace(answer),
			WorkstreamID: &input.WorkstreamID,
		}, nil
	}
}
