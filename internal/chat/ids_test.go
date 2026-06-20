package chat

import (
	"strings"
	"testing"
)

func TestServiceRejectsUnsafeConversationIDBeforeRecordingDiagnostics(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))

	_, err := service.LoadMessagePage("workspace_api", "../conversation_api", 0, 20)
	if err == nil {
		t.Fatal("load message page succeeded, want unsafe id error")
	}
	if !strings.Contains(err.Error(), "conversation id") {
		t.Fatalf("error = %q, want conversation id validation", err.Error())
	}
	diagnostics, err := service.store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	if len(diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none for rejected request id", diagnostics)
	}
}

func TestStoreRejectsUnsafeRunIDBeforePathRead(t *testing.T) {
	store := mustStore(t, t.TempDir())

	_, err := store.LoadRun("workspace_api", "../run_api")
	if err == nil {
		t.Fatal("load run succeeded, want unsafe id error")
	}
	if !strings.Contains(err.Error(), "run id") {
		t.Fatalf("error = %q, want run id validation", err.Error())
	}
}
