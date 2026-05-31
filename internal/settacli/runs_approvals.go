package settacli

import (
	"encoding/json"
	"fmt"

	"setta/internal/chat"
	"setta/internal/httpapi"
)

func runWatchSpec() CommandSpec {
	return CommandSpec{
		Path:              []string{"run", "watch"},
		Summary:           "Watch backend events for a run as newline-delimited JSON.",
		Usage:             "setta run watch --workspace WORKSPACE_ID --conversation CONVERSATION_ID --run RUN_ID --ndjson",
		RequiresBackend:   true,
		SupportsNDJSON:    true,
		OutputSchemaName:  "ChatRunUpdatedEvent",
		RelatedOperations: []string{"EventStream"},
		RequiredFlags:     []string{"--workspace", "--conversation", "--run", "--ndjson"},
		Examples:          []string{"setta run watch --workspace WORKSPACE_ID --conversation CONVERSATION_ID --run RUN_ID --ndjson"},
		handler:           handleRunWatch,
	}
}

func handleRunActive(context *Context, args []string) error {
	flags := workspaceConversationFlags("run active")
	if err := flags.parse(args); err != nil {
		return err
	}
	return callAndWrite(context, []string{"run", "active"}, "GetActiveRun", httpapi.GetActiveRunRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID})
}

func handleRunList(context *Context, args []string) error {
	flags := workspaceConversationFlags("run list")
	if err := flags.parse(args); err != nil {
		return err
	}
	return callAndWrite(context, []string{"run", "list"}, "ListRuns", httpapi.ListRunsRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID})
}

func handleRunActivity(context *Context, args []string) error {
	flags := newFlagSet("run activity")
	workspaceID := flags.String("workspace", "", "workspace ID")
	runID := flags.String("run", "", "run ID")
	limit := flags.Int("limit", 200, "activity limit")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("run activity does not accept positional arguments")
	}
	if *workspaceID == "" || *runID == "" {
		return invalidError("run activity requires --workspace and --run")
	}
	return callAndWrite(context, []string{"run", "activity"}, "GetRunActivity", httpapi.GetRunActivityRequest{WorkspaceID: *workspaceID, RunID: *runID, Limit: *limit})
}

func handleRunItemOutput(context *Context, args []string) error {
	flags := newFlagSet("run item-output")
	workspaceID := flags.String("workspace", "", "workspace ID")
	runID := flags.String("run", "", "run ID")
	itemID := flags.String("item", "", "run item ID")
	after := flags.Int("after", 0, "after ordinal")
	limit := flags.Int("limit", 200, "output limit")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("run item-output does not accept positional arguments")
	}
	if *workspaceID == "" || *runID == "" || *itemID == "" {
		return invalidError("run item-output requires --workspace, --run, and --item")
	}
	return callAndWrite(context, []string{"run", "item-output"}, "GetRunItemOutputPage", httpapi.GetRunItemOutputRequest{
		AfterOrdinal: *after,
		Limit:        *limit,
		RunID:        *runID,
		RunItemID:    *itemID,
		WorkspaceID:  *workspaceID,
	})
}

func handleRunWatch(context *Context, args []string) error {
	flags := newFlagSet("run watch")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	runID := flags.String("run", "", "run ID")
	ndjson := flags.Bool("ndjson", false, "write newline-delimited JSON")
	cursor := flags.String("cursor", "", "last event ID")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("run watch does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *runID == "" {
		return invalidError("run watch requires --workspace, --conversation, and --run")
	}
	if !*ndjson {
		return invalidError("run watch requires --ndjson")
	}
	return watchRunFromCursor(context, *workspaceID, *conversationID, *runID, *cursor)
}

func handleRunCancel(context *Context, args []string) error {
	flags := newFlagSet("run cancel")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	confirm := flags.Bool("confirm", false, "confirm cancellation")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("run cancel does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" {
		return invalidError("run cancel requires --workspace and --conversation")
	}
	if !*confirm {
		return invalidError("run cancel requires --confirm")
	}
	return callAndWrite(context, []string{"run", "cancel"}, "CancelRun", httpapi.CancelRunRequest{WorkspaceID: *workspaceID, ConversationID: *conversationID})
}

func handleApprovalList(context *Context, args []string) error {
	flags := workspaceConversationFlags("approval list")
	if err := flags.parse(args); err != nil {
		return err
	}
	return callAndWrite(context, []string{"approval", "list"}, "ListApprovals", httpapi.ListApprovalsRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID})
}

func handleApprovalSubmit(context *Context, args []string) error {
	flags := newFlagSet("approval submit")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	approvalID := flags.String("approval", "", "approval ID")
	approve := flags.Bool("approve", false, "approve")
	deny := flags.Bool("deny", false, "deny")
	response := flags.String("response", "", "approval response text")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("approval submit does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *approvalID == "" {
		return invalidError("approval submit requires --workspace, --conversation, and --approval")
	}
	if *approve == *deny {
		return invalidError("approval submit requires exactly one of --approve or --deny")
	}
	if *deny && *response == "" {
		return invalidError("approval submit --deny requires --response")
	}
	return callAndWrite(context, []string{"approval", "submit"}, "SubmitApproval", httpapi.SubmitApprovalRequest{
		ApprovalID:     *approvalID,
		Approved:       *approve,
		ConversationID: *conversationID,
		Response:       *response,
		WorkspaceID:    *workspaceID,
	})
}

func handleApprovalAnswer(context *Context, args []string) error {
	flags := newFlagSet("approval answer")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	approvalID := flags.String("approval", "", "approval ID")
	answersFile := flags.String("answers-file", "", "answers JSON file")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("approval answer does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *approvalID == "" || *answersFile == "" {
		return invalidError("approval answer requires --workspace, --conversation, --approval, and --answers-file")
	}
	var answers []chat.ApprovalAnswer
	if err := readJSONFile(context, *answersFile, &answers); err != nil {
		return err
	}
	return callAndWrite(context, []string{"approval", "answer"}, "SubmitApproval", httpapi.SubmitApprovalRequest{
		Answers:        answers,
		ApprovalID:     *approvalID,
		ConversationID: *conversationID,
		WorkspaceID:    *workspaceID,
	})
}

func handleApprovalCancel(context *Context, args []string) error {
	flags := newFlagSet("approval cancel")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	approvalID := flags.String("approval", "", "approval ID")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("approval cancel does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *approvalID == "" {
		return invalidError("approval cancel requires --workspace, --conversation, and --approval")
	}
	return callAndWrite(context, []string{"approval", "cancel"}, "SubmitApproval", httpapi.SubmitApprovalRequest{
		ApprovalID:     *approvalID,
		Cancelled:      true,
		ConversationID: *conversationID,
		WorkspaceID:    *workspaceID,
	})
}

func writeNDJSONEvent(context *Context, event chat.Event) error {
	encoded, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event %s: %w", event.EventID, err)
	}
	_, err = fmt.Fprintf(context.Stdout, "%s\n", encoded)
	return err
}
