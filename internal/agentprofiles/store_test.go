package agentprofiles

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestStoreListReturnsEmptyWhenFileMissing(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	profiles, err := store.List()
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected no profiles, got %#v", profiles)
	}
}

func TestStoreWriteListAndGetRoundTrip(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	engineConfigID := "engine-alpha"
	memoryScope := "project"
	if err := store.Write([]Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			EngineConfigID:              &engineConfigID,
			ToolAllowlist:               []string{"tool.a", "tool.b"},
			MemoryScope:                 &memoryScope,
		},
		{
			ID:           "profile-beta",
			Name:         "Beta",
			SystemPrompt: "You are beta.",
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	profiles, err := store.List()
	if err != nil {
		t.Fatalf("list profiles after write: %v", err)
	}

	expected := []Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			EngineConfigID:              &engineConfigID,
			ToolAllowlist:               []string{"tool.a", "tool.b"},
			MemoryScope:                 &memoryScope,
		},
		{
			ID:            "profile-beta",
			Name:          "Beta",
			Description:   "",
			SystemPrompt:  "You are beta.",
			ToolAllowlist: []string{},
		},
	}
	if !reflect.DeepEqual(profiles, expected) {
		t.Fatalf("unexpected profiles after round trip: %#v", profiles)
	}

	profile, err := store.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get stored profile: %v", err)
	}
	if !reflect.DeepEqual(profile, expected[0]) {
		t.Fatalf("unexpected fetched profile: %#v", profile)
	}

	content, err := os.ReadFile(filepath.Join(filepath.Dir(store.Path()), FileName))
	if err != nil {
		t.Fatalf("read stored file: %v", err)
	}
	if !strings.Contains(string(content), "\"toolAllowlist\": []") {
		t.Fatalf("expected empty toolAllowlist to persist as [], got %q", string(content))
	}
}

func TestStoreGetReturnsBoundedNotFoundError(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := store.Write([]Profile{{ID: "profile-alpha", Name: "Alpha"}}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	_, err = store.Get("missing-profile")
	if !errors.Is(err, ErrProfileNotFound) {
		t.Fatalf("expected ErrProfileNotFound, got %v", err)
	}
}

func TestStoreRejectsNonArrayPayload(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewStore(root)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, FileName), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write malformed store file: %v", err)
	}

	_, err = store.List()
	if err == nil {
		t.Fatal("expected malformed payload to fail")
	}
	if !strings.Contains(err.Error(), "JSON array") {
		t.Fatalf("expected JSON array error, got %v", err)
	}
}
