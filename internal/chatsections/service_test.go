package chatsections

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
)

func TestServiceGetChatIDReturnsExistingManagedAndExternalChats(t *testing.T) {
	t.Parallel()

	projectRuntime, runStore := newChatSectionServiceTestRuntime(t)
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         runStore,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	for _, testCase := range []struct {
		name    string
		chatID  string
		runType string
	}{
		{
			name:    "managed",
			chatID:  "chat-managed",
			runType: managedchat.RunTypeManagedChat,
		},
		{
			name:    "external",
			chatID:  "chat-external",
			runType: externalagents.RunTypeExternalAgent,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", &testCase.chatID); err != nil {
				t.Fatalf("seed chat id: %v", err)
			}
			if err := runStore.Save(agentruns.NewRun(nil, map[string]any{
				"runType":         testCase.runType,
				"chatId":          testCase.chatID,
				"projectConfigId": "project-alpha",
			}, time.Unix(100, 0).UTC())); err != nil {
				t.Fatalf("save run: %v", err)
			}

			resolved, err := service.GetChatID(context.Background(), "project-alpha", "chat-section")
			if err != nil {
				t.Fatalf("GetChatID returned error: %v", err)
			}
			if resolved == nil || *resolved != testCase.chatID {
				t.Fatalf("expected chat id %q, got %#v", testCase.chatID, resolved)
			}
		})
	}
}

func TestServiceGetChatIDClearsMissingChat(t *testing.T) {
	t.Parallel()

	projectRuntime, runStore := newChatSectionServiceTestRuntime(t)
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         runStore,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	missingChatID := "missing-chat"
	if _, err := projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", &missingChatID); err != nil {
		t.Fatalf("seed missing chat id: %v", err)
	}

	resolved, err := service.GetChatID(context.Background(), "project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("GetChatID returned error: %v", err)
	}
	if resolved != nil {
		t.Fatalf("expected nil chat id for missing run, got %#v", resolved)
	}

	stored, err := projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("ChatSectionChatID returned error: %v", err)
	}
	if stored != nil {
		t.Fatalf("expected stored chat id to be cleared, got %#v", stored)
	}
}

func newChatSectionServiceTestRuntime(t *testing.T) (*projectstate.Runtime, *agentruns.RunStore) {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": chatSectionServiceTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	runStore, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}

	return projectRuntime, runStore
}

func chatSectionServiceTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chat-section":  "chat-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat Section",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"chat-variant": {
				ID:     "chat-variant",
				ImplID: "chat-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalChatSectionServiceProjectObject(t, map[string]any{
					"id":   "chat-impl",
					"type": "Chat",
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalChatSectionServiceProjectObject(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}
	return project
}

func mustMarshalChatSectionServiceProjectObject(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()

	content, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw project object: %v", err)
	}
	return content
}
