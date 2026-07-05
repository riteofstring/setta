package chat

import (
	"encoding/json"
	"strings"
	"testing"
)

type flatFieldMutation struct {
	name   string
	mutate func(*RunItem)
	want   string
}

type typedDetailsFlatFieldGroup struct {
	name   string
	base   func() RunItem
	fields []flatFieldMutation
}

func TestRunItemTypedDetailsRejectLegacyFlatFields(t *testing.T) {
	groups := []typedDetailsFlatFieldGroup{
		{
			name:   "commandExecution",
			base:   validCommandExecutionRunItem,
			fields: append(commandFlatFieldMutations("commandExecution"), rawDetailsMutation("commandExecution")),
		},
		{
			name:   "commandStartFailure",
			base:   validCommandStartFailureRunItem,
			fields: append(commandFlatFieldMutations("commandStartFailure"), rawDetailsMutation("commandStartFailure")),
		},
		{
			name: "fileChange",
			base: validFileChangeRunItem,
			fields: []flatFieldMutation{
				flatSliceFieldMutation("fileChange", "filePaths", func(item *RunItem) { item.FilePaths = []string{"legacy.go"} }),
				flatStringFieldMutation("fileChange", "patchStatus", func(item *RunItem) { item.PatchStatus = "legacy_status" }),
				flatStringFieldMutation("fileChange", "diffSummary", func(item *RunItem) { item.DiffSummary = "legacy summary" }),
				rawDetailsMutation("fileChange"),
			},
		},
		{
			name: "diff",
			base: validDiffRunItem,
			fields: []flatFieldMutation{
				flatSliceFieldMutation("diff", "filePaths", func(item *RunItem) { item.FilePaths = []string{"legacy.go"} }),
				flatStringFieldMutation("diff", "patchStatus", func(item *RunItem) { item.PatchStatus = "legacy_status" }),
				flatStringFieldMutation("diff", "diffSummary", func(item *RunItem) { item.DiffSummary = "legacy summary" }),
				rawDetailsMutation("diff"),
			},
		},
		{
			name: "approval",
			base: validApprovalRequestRunItem,
			fields: append([]flatFieldMutation{
				flatStringFieldMutation("approval", "command", func(item *RunItem) { item.Command = "legacy command" }),
				flatStringFieldMutation("approval", "cwd", func(item *RunItem) { item.Cwd = "/legacy" }),
				flatSliceFieldMutation("approval", "filePaths", func(item *RunItem) { item.FilePaths = []string{"legacy.go"} }),
				flatStringFieldMutation("approval", "patchStatus", func(item *RunItem) { item.PatchStatus = "legacy_status" }),
				flatStringFieldMutation("approval", "serverName", func(item *RunItem) { item.ServerName = "legacy_server" }),
				flatStringFieldMutation("approval", "toolName", func(item *RunItem) { item.ToolName = "legacy_tool" }),
				flatStringFieldMutation("approval", "result", func(item *RunItem) { item.Result = "legacy result" }),
				flatStringFieldMutation("approval", "error", func(item *RunItem) { item.Error = "legacy error" }),
				flatStringFieldMutation("approval", "diffSummary", func(item *RunItem) { item.DiffSummary = "legacy summary" }),
				flatStringFieldMutation("approval", "namespace", func(item *RunItem) { item.Namespace = "legacy" }),
				flatStringFieldMutation("approval", "processId", func(item *RunItem) { item.ProcessID = "legacy-process" }),
				flatSourceFieldMutation("approval"),
				flatStringFieldMutation("approval", "requestId", func(item *RunItem) { item.RequestID = "legacy-request" }),
				flatStringFieldMutation("approval", "reviewId", func(item *RunItem) { item.ReviewID = "legacy-review" }),
			}, rawDetailsMutation("approval")),
		},
		{
			name: "providerStreamLifecycle",
			base: validProviderStreamLifecycleRunItem,
			fields: append([]flatFieldMutation{
				flatZeroFieldMutation("providerStreamLifecycle", "exitCode", func(item *RunItem) { item.ExitCode = 7 }),
				flatZeroFieldMutation("providerStreamLifecycle", "durationMs", func(item *RunItem) { item.DurationMs = 42 }),
				flatSliceFieldMutation("providerStreamLifecycle", "filePaths", func(item *RunItem) { item.FilePaths = []string{"legacy.go"} }),
				flatSourceFieldMutation("providerStreamLifecycle"),
				flatStringFieldMutation("providerStreamLifecycle", "command", func(item *RunItem) { item.Command = "legacy command" }),
				flatStringFieldMutation("providerStreamLifecycle", "cwd", func(item *RunItem) { item.Cwd = "/legacy" }),
				flatStringFieldMutation("providerStreamLifecycle", "patchStatus", func(item *RunItem) { item.PatchStatus = "legacy_status" }),
				flatStringFieldMutation("providerStreamLifecycle", "serverName", func(item *RunItem) { item.ServerName = "legacy_server" }),
				flatStringFieldMutation("providerStreamLifecycle", "toolName", func(item *RunItem) { item.ToolName = "legacy_tool" }),
				flatStringFieldMutation("providerStreamLifecycle", "progress", func(item *RunItem) { item.Progress = "legacy progress" }),
				flatStringFieldMutation("providerStreamLifecycle", "result", func(item *RunItem) { item.Result = "legacy result" }),
				flatStringFieldMutation("providerStreamLifecycle", "error", func(item *RunItem) { item.Error = "legacy error" }),
				flatStringFieldMutation("providerStreamLifecycle", "noticeKind", func(item *RunItem) { item.NoticeKind = "legacy_notice" }),
				flatStringFieldMutation("providerStreamLifecycle", "noticeMessage", func(item *RunItem) { item.NoticeMessage = "legacy notice" }),
				flatStringFieldMutation("providerStreamLifecycle", "diffSummary", func(item *RunItem) { item.DiffSummary = "legacy summary" }),
				flatStringFieldMutation("providerStreamLifecycle", "namespace", func(item *RunItem) { item.Namespace = "legacy" }),
				flatStringFieldMutation("providerStreamLifecycle", "processId", func(item *RunItem) { item.ProcessID = "legacy-process" }),
				flatStringFieldMutation("providerStreamLifecycle", "requestId", func(item *RunItem) { item.RequestID = "legacy-request" }),
				flatStringFieldMutation("providerStreamLifecycle", "reviewId", func(item *RunItem) { item.ReviewID = "legacy-review" }),
			}, rawDetailsMutation("providerStreamLifecycle")),
		},
	}

	for _, group := range groups {
		group := group
		t.Run(group.name, func(t *testing.T) {
			for _, field := range group.fields {
				field := field
				t.Run(field.name, func(t *testing.T) {
					item := group.base()
					if err := validateRunItemDetails(item); err != nil {
						t.Fatalf("base item is invalid: %v", err)
					}

					field.mutate(&item)
					err := validateRunItemDetails(item)
					if err == nil {
						t.Fatal("validation succeeded, want legacy flat-field rejection")
					}
					if !strings.Contains(err.Error(), field.want) {
						t.Fatalf("error = %q, want %q", err, field.want)
					}
				})
			}
		})
	}
}

func commandFlatFieldMutations(branch string) []flatFieldMutation {
	return []flatFieldMutation{
		flatStringFieldMutation(branch, "command", func(item *RunItem) { item.Command = "legacy command" }),
		flatStringFieldMutation(branch, "cwd", func(item *RunItem) { item.Cwd = "/legacy" }),
		flatZeroFieldMutation(branch, "exitCode", func(item *RunItem) { item.ExitCode = 7 }),
		flatZeroFieldMutation(branch, "durationMs", func(item *RunItem) { item.DurationMs = 42 }),
		flatStringFieldMutation(branch, "result", func(item *RunItem) { item.Result = "legacy result" }),
		flatStringFieldMutation(branch, "error", func(item *RunItem) { item.Error = "legacy error" }),
		flatStringFieldMutation(branch, "processId", func(item *RunItem) { item.ProcessID = "legacy-process" }),
		flatSourceFieldMutation(branch),
	}
}

func flatStringFieldMutation(branch string, field string, mutate func(*RunItem)) flatFieldMutation {
	return flatFieldMutation{
		name:   field,
		mutate: mutate,
		want:   branch + " flat " + field + " must be empty",
	}
}

func flatSliceFieldMutation(branch string, field string, mutate func(*RunItem)) flatFieldMutation {
	return flatFieldMutation{
		name:   field,
		mutate: mutate,
		want:   branch + " flat " + field + " must be empty",
	}
}

func flatZeroFieldMutation(branch string, field string, mutate func(*RunItem)) flatFieldMutation {
	return flatFieldMutation{
		name:   field,
		mutate: mutate,
		want:   branch + " flat " + field + " must be zero",
	}
}

func flatSourceFieldMutation(branch string) flatFieldMutation {
	return flatFieldMutation{
		name: "source",
		mutate: func(item *RunItem) {
			source := RunItemCommandSourceAgent
			item.Source = &source
		},
		want: branch + " flat source must be empty",
	}
}

func rawDetailsMutation(branch string) flatFieldMutation {
	return flatFieldMutation{
		name:   "rawDetails",
		mutate: func(item *RunItem) { item.RawDetails = json.RawMessage(`{"legacy":true}`) },
		want:   branch + " rawDetails must be empty",
	}
}

func validCommandExecutionRunItem() RunItem {
	source := RunItemCommandSourceAgent
	return RunItem{
		ID:     "run_item_command_execution",
		Type:   RunItemTypeCommandExecution,
		Status: RunItemStatusCompleted,
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Command:    "go test ./...",
			Cwd:        "/workspace",
			ExitCode:   0,
			DurationMs: 25,
			Source:     &source,
			Result:     "ok",
		}),
	}
}

func validCommandStartFailureRunItem() RunItem {
	source := RunItemCommandSourceAgent
	return RunItem{
		ID:     "run_item_command_start_failure",
		Type:   RunItemTypeCommandStartFailure,
		Status: RunItemStatusFailed,
		Details: NewRunItemCommandStartFailureDetails(RunItemCommandStartFailureDetails{
			Command:         "printf scripted-start-failure",
			Cwd:             "/workspace",
			Source:          &source,
			FailureClass:    "resource_exhaustion",
			Message:         "Too many open files (os error 24)",
			OSError:         "os error 24",
			ProviderErrorID: "error_1",
			Sandbox:         "workspace-write",
			ApprovalPolicy:  "on-request",
		}),
	}
}

func validFileChangeRunItem() RunItem {
	operation := RunItemFileChangeOperationUpdate
	return RunItem{
		ID:      "run_item_file_change",
		Type:    RunItemTypeFileChange,
		Status:  RunItemStatusCompleted,
		Details: newRunItemFileChangeDetails("updated", []RunItemFileChangePath{newRunItemFileChangePath("main.go", &operation, "", "+updated\n")}),
	}
}

func validDiffRunItem() RunItem {
	return RunItem{
		ID:     "run_item_diff",
		Type:   RunItemTypeDiff,
		Status: RunItemStatusCompleted,
		Details: newRunItemDiffDetails(`--- a/main.go
+++ b/main.go
@@
+updated
`),
	}
}

func validApprovalRequestRunItem() RunItem {
	return RunItem{
		ID:     "run_item_approval",
		Type:   RunItemTypeApprovalRequest,
		Status: RunItemStatusPending,
		Details: NewRunItemApprovalDetails(RunItemApprovalDetails{
			ApprovalID:        "approval_1",
			ApprovalKind:      approvalKindPtr(ApprovalKindCommand),
			ApprovalStatus:    approvalStatusPtr(ApprovalStatusPending),
			ProviderRequestID: "request_1",
			Title:             "Command approval",
			Body:              "Approve command.",
			Command:           "go test ./...",
			Cwd:               "/workspace",
		}),
	}
}

func validProviderStreamLifecycleRunItem() RunItem {
	return RunItem{
		ID:     "run_item_provider_stream",
		Type:   RunItemTypeProviderStreamLifecycle,
		Status: RunItemStatusRunning,
		Details: NewRunItemProviderStreamLifecycleDetails(RunItemProviderStreamLifecycleDetails{
			Message:          "stream disconnected before completion",
			CodexErrorKind:   "stream_disconnected",
			WillRetry:        true,
			StreamFailure:    true,
			LivenessStatus:   RunLivenessReconciling,
			LivenessReason:   RunLivenessReasonStreamResync,
			ProviderThreadID: "thread_1",
			ProviderTurnID:   "turn_1",
		}),
	}
}
