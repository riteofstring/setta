package workflowaudit

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/orchestrator"
	"setta/internal/runtimeauth"
)

func TestStoreRecordsWorkflowCommandAudit(t *testing.T) {
	store := newTestStore(t)
	saved := false
	validation := orchestrator.WorkflowValidationResult{
		Valid: false,
		Diagnostics: []orchestrator.WorkflowValidationDiagnostic{{
			Code:     "end_node_required",
			Message:  "workflow must include an end node",
			Severity: orchestrator.ValidationSeverityError,
		}},
	}

	record, err := store.Record(context.Background(), RecordInput{
		AuthenticatedDeviceSession: testDeviceSession(),
		CommandName:                CommandWorkflowDefinitionsSave,
		Outcome:                    OutcomeWorkflowDefinitionUnsaved,
		WorkspaceID:                "workspace_audit",
		DefinitionID:               "workflow_definition_audit",
		SaveOperation:              orchestrator.WorkflowDefinitionSaveCreate,
		Saved:                      &saved,
		Validation:                 &validation,
	})
	if err != nil {
		t.Fatalf("record workflow audit: %v", err)
	}
	if record.ID != "workflow_audit_test" || record.RecordedAt != "2026-07-06T12:34:56Z" {
		t.Fatalf("record identity = %+v, want deterministic id and timestamp", record)
	}
	if record.AuthenticatedDeviceSession.ID != "device_audit" || record.AuthenticatedDeviceSession.DisplayName != "Setta CLI workflow definitions save" {
		t.Fatalf("authenticated device = %+v, want CLI session", record.AuthenticatedDeviceSession)
	}
	if record.Validation == nil || record.Validation.Valid {
		t.Fatalf("record validation = %+v, want invalid validation result", record.Validation)
	}
	if record.Saved == nil || *record.Saved {
		t.Fatalf("record saved = %+v, want false", record.Saved)
	}

	records, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list workflow audit: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("records = %+v, want one record", records)
	}
	if records[0].ID != record.ID || records[0].Validation == nil || len(records[0].Validation.Diagnostics) != 1 {
		t.Fatalf("persisted record = %+v, want saved validation diagnostics", records[0])
	}
}

func TestStoreListsMissingAuditFileAsEmpty(t *testing.T) {
	store := newTestStore(t)
	records, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list missing workflow audit: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("records = %+v, want empty", records)
	}
}

func TestStoreReportsCorruptAuditRecord(t *testing.T) {
	store := newTestStore(t)
	if err := os.MkdirAll(filepath.Dir(store.Path()), 0o755); err != nil {
		t.Fatalf("create audit dir: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte(`{"schemaVersion":999}`+"\n"), 0o600); err != nil {
		t.Fatalf("write corrupt audit record: %v", err)
	}

	_, err := store.List(context.Background())
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state error", err, err)
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	store, err := NewStore(
		t.TempDir(),
		WithIDGenerator(func(prefix string) (string, error) {
			return prefix + "_test", nil
		}),
		WithClock(func() time.Time {
			return time.Date(2026, 7, 6, 12, 34, 56, 0, time.UTC)
		}),
	)
	if err != nil {
		t.Fatalf("new workflow audit store: %v", err)
	}
	return store
}

func testDeviceSession() runtimeauth.DeviceSession {
	return runtimeauth.DeviceSession{
		ID:          "device_audit",
		Scope:       runtimeauth.DeviceScopeFull,
		DisplayName: "Setta CLI workflow definitions save",
		CreatedAt:   "2026-07-06T12:00:00Z",
		LastSeenAt:  "2026-07-06T12:00:00Z",
	}
}
