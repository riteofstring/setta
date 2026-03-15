package uisettings

import (
	"context"
	"encoding/json"
	"testing"

	"setta/internal/projectview"
	"setta/internal/realtime"
)

type stubRevealTransport struct {
	registry *realtime.Registry
	sendJSON func(context.Context, any, string) (bool, error)
}

func (s *stubRevealTransport) Registry() *realtime.Registry {
	return s.registry
}

func (s *stubRevealTransport) SendJSON(ctx context.Context, message any, connectionID string) (bool, error) {
	if s.sendJSON != nil {
		return s.sendJSON(ctx, message, connectionID)
	}
	return true, nil
}

func TestRevealServiceDispatchesToAffinitySelectedFrontendAndReturnsSuccess(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-token"),
	})
	connection, err := registry.Register(realtime.RegisterParams{
		ID:   "frontend-1",
		Type: realtime.ConnectionTypeFrontend,
	})
	if err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	token, ok := registry.FrontendAffinityToken(connection.ID)
	if !ok {
		t.Fatal("expected frontend affinity token")
	}

	results := realtime.NewUISettingRevealResultHub()
	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		if revealMessage.Content.ActiveSectionID == nil || *revealMessage.Content.ActiveSectionID != "callable-section" {
			t.Fatalf("expected explicit activeSectionId callable-section, got %#v", revealMessage.Content.ActiveSectionID)
		}
		if got := revealMessage.Content.Reveals[0].UIEditorTabName; got == nil || *got != "QuickInfoConfig" {
			t.Fatalf("expected QuickInfoConfig UI editor tab, got %#v", got)
		}
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-alpha",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID:    "core.project.show_param_display_names",
					Status:       "revealed",
					ErrorCode:    nil,
					ErrorMessage: nil,
				},
			},
		}, connectionID) {
			t.Fatal("expected reveal result resolution to succeed")
		}
		return true, nil
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       transport,
		Results:         results,
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID:       "project-alpha",
		ProjectView:           revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:              revealTestRegistry(t),
		SettingID:             "core.project.show_param_display_names",
		SectionIDToActivate:   "callable-section",
		FrontendAffinityToken: token,
		DurationMS:            1500,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if result.RequestID != "request-1" {
		t.Fatalf("expected request-1 request id, got %q", result.RequestID)
	}
	if result.EmittedRevealCount != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %d", result.EmittedRevealCount)
	}
	if len(result.Statuses) != 1 || result.Statuses[0].Status != "revealed" {
		t.Fatalf("expected single revealed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Target == nil || result.Statuses[0].Target.SettingID != "core.project.show_param_display_names" {
		t.Fatalf("expected reveal target in success status, got %#v", result.Statuses[0].Target)
	}
}

func TestRevealServiceRejectsMissingActiveSectionForRightPaneReveal(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	service, err := NewRevealService(RevealServiceOptions{
		Transport:       &stubRevealTransport{registry: registry},
		Results:         realtime.NewUISettingRevealResultHub(),
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID: "project-alpha",
		ProjectView:     revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:        revealTestRegistry(t),
		SettingID:       "core.project.show_param_display_names",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if result.EmittedRevealCount != 0 {
		t.Fatalf("expected emittedRevealCount=0, got %d", result.EmittedRevealCount)
	}
	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected single failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Right-pane reveal requires an active section. Pick a section and pass sectionIdToActivate." {
		t.Fatalf("unexpected missing active section message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceRejectsIncompatibleRightPaneTab(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	service, err := NewRevealService(RevealServiceOptions{
		Transport:       &stubRevealTransport{registry: registry},
		Results:         realtime.NewUISettingRevealResultHub(),
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID: "project-alpha",
		ProjectView:     revealTestProjectView(t, "code-section", "Code", []string{"code-section"}),
		Registry:        revealTestRegistry(t),
		SettingID:       "core.project.show_param_display_names",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Section type Code does not support tab QuickInfoConfig." {
		t.Fatalf("unexpected incompatible-tab message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceRejectsAmbiguousFrontendSelectionWithoutAffinity(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-a", "frontend-b"),
	})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-a", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register first frontend: %v", err)
	}
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-b", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register second frontend: %v", err)
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       &stubRevealTransport{registry: registry},
		Results:         realtime.NewUISettingRevealResultHub(),
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID: "project-alpha",
		ProjectView:     revealTestProjectView(t, "callable-section", "Callable", []string{"callable-section"}),
		Registry:        revealTestRegistry(t),
		SettingID:       "core.project.show_param_display_names",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Reveal routing is ambiguous because multiple frontends are connected and no frontendAffinityToken was provided." {
		t.Fatalf("unexpected ambiguity message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceScopesDeterministicSelectionToShareSessionWithoutAffinity(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-a", "frontend-b"),
	})
	if _, err := registry.Register(realtime.RegisterParams{
		ID:             "frontend-a",
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: "share-a",
	}); err != nil {
		t.Fatalf("register share-a frontend: %v", err)
	}
	if _, err := registry.Register(realtime.RegisterParams{
		ID:             "frontend-b",
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: "share-b",
	}); err != nil {
		t.Fatalf("register share-b frontend: %v", err)
	}

	results := realtime.NewUISettingRevealResultHub()
	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		if connectionID != "frontend-a" {
			t.Fatalf("expected reveal dispatch to share-a frontend, got %q", connectionID)
		}
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-alpha",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		}, connectionID) {
			t.Fatal("expected reveal result resolution to succeed")
		}
		return true, nil
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       transport,
		Results:         results,
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID: "project-alpha",
		ProjectView:     revealTestProjectView(t, "callable-section", "Callable", []string{"callable-section"}),
		Registry:        revealTestRegistry(t),
		SettingID:       "core.project.show_param_display_names",
		ShareSessionID:  "share-a",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if result.EmittedRevealCount != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %d", result.EmittedRevealCount)
	}
	if len(result.Statuses) != 1 || result.Statuses[0].Status != "revealed" {
		t.Fatalf("expected single revealed status, got %#v", result.Statuses)
	}
}

func TestRevealServiceRejectsAmbiguousFrontendSelectionWithinShareSession(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-a", "frontend-b", "frontend-c"),
	})
	for _, registration := range []realtime.RegisterParams{
		{ID: "frontend-a", Type: realtime.ConnectionTypeFrontend, ShareSessionID: "share-a"},
		{ID: "frontend-b", Type: realtime.ConnectionTypeFrontend, ShareSessionID: "share-a"},
		{ID: "frontend-c", Type: realtime.ConnectionTypeFrontend, ShareSessionID: "share-b"},
	} {
		if _, err := registry.Register(registration); err != nil {
			t.Fatalf("register frontend %s: %v", registration.ID, err)
		}
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       &stubRevealTransport{registry: registry},
		Results:         realtime.NewUISettingRevealResultHub(),
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID: "project-alpha",
		ProjectView:     revealTestProjectView(t, "callable-section", "Callable", []string{"callable-section"}),
		Registry:        revealTestRegistry(t),
		SettingID:       "core.project.show_param_display_names",
		ShareSessionID:  "share-a",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Reveal routing is ambiguous because multiple frontends are connected and no frontendAffinityToken was provided." {
		t.Fatalf("unexpected ambiguity message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceRejectsMissingFrontendWithinRequestedShareSession(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-a"),
	})
	if _, err := registry.Register(realtime.RegisterParams{
		ID:             "frontend-a",
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: "share-b",
	}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       &stubRevealTransport{registry: registry},
		Results:         realtime.NewUISettingRevealResultHub(),
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID: "project-alpha",
		ProjectView:     revealTestProjectView(t, "callable-section", "Callable", []string{"callable-section"}),
		Registry:        revealTestRegistry(t),
		SettingID:       "core.project.show_param_display_names",
		ShareSessionID:  "share-a",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "No connected frontend is available for UI setting reveal in the requested share session." {
		t.Fatalf("unexpected no-frontend message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceRejectsAffinityTokenFromDifferentShareSession(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-a", "frontend-b"),
	})
	if _, err := registry.Register(realtime.RegisterParams{
		ID:             "frontend-a",
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: "share-a",
	}); err != nil {
		t.Fatalf("register share-a frontend: %v", err)
	}
	connectionB, err := registry.Register(realtime.RegisterParams{
		ID:             "frontend-b",
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: "share-b",
	})
	if err != nil {
		t.Fatalf("register share-b frontend: %v", err)
	}
	tokenB, ok := registry.FrontendAffinityToken(connectionB.ID)
	if !ok {
		t.Fatal("expected frontend affinity token for share-b frontend")
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       &stubRevealTransport{registry: registry},
		Results:         realtime.NewUISettingRevealResultHub(),
		RequestIDSource: fixedRevealRequestIDSource("request-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID:       "project-alpha",
		ProjectView:           revealTestProjectView(t, "callable-section", "Callable", []string{"callable-section"}),
		Registry:              revealTestRegistry(t),
		SettingID:             "core.project.show_param_display_names",
		ShareSessionID:        "share-a",
		FrontendAffinityToken: tokenB,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Frontend affinity token is invalid or no longer available for reveal routing: frontend-b" {
		t.Fatalf("unexpected affinity error message: %q", result.Statuses[0].Error.Message)
	}
}

func revealTestRegistry(t *testing.T) *Registry {
	t.Helper()

	registry, err := New([]RuntimeEntry{
		{
			Metadata: Entry{
				SettingID:   "core.project.show_param_display_names",
				Title:       "Show Param Display Names",
				Description: "Toggle display names for parameters in the right pane.",
				Location: Location{
					Side:                     SideRight,
					UIEditorTabName:          "QuickInfoConfig",
					RequiresSectionSelection: true,
				},
				Highlight: Highlight{
					Strategy: HighlightStrategyDOMAnchor,
					AnchorID: "core.project.show_param_display_names",
				},
				Source:     SourceCore,
				Mutability: MutabilityWritable,
				ValueSchema: ValueSchema{
					Type: ValueTypeBoolean,
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new reveal test registry: %v", err)
	}
	return registry
}

func revealTestProjectView(t *testing.T, sectionID string, sectionType string, activeIDs []string) *projectview.SingleConfig {
	t.Helper()

	defaultVariantID := sectionID + "-variant"
	implID := sectionID + "-impl"

	return &projectview.SingleConfig{
		Sections: map[string]projectview.Core{
			sectionID: {
				ID:             sectionID,
				Name:           sectionID,
				DisplayName:    sectionID,
				Variants:       []string{defaultVariantID},
				DefaultVariant: &defaultVariantID,
			},
		},
		SectionImpls: map[string]json.RawMessage{
			implID: mustRevealRawJSON(t, map[string]any{
				"id":   implID,
				"type": sectionType,
			}),
		},
		SectionVariants: map[string]projectview.Variant{
			defaultVariantID: {
				ID:   defaultVariantID,
				Name: defaultVariantID,
				Impl: implID,
			},
		},
		ProjectConfig: projectview.ProjectConfig{
			ID:                "project-alpha",
			SectionVariantMap: map[string]string{sectionID: defaultVariantID},
			ActiveIDs:         append([]string(nil), activeIDs...),
		},
	}
}

func mustRevealRawJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal reveal raw json: %v", err)
	}
	return encoded
}

func fixedRevealRequestIDSource(requestID string) RevealRequestIDSource {
	return func() (string, error) {
		return requestID, nil
	}
}

func sequentialTokenSource(tokens ...string) func() (string, error) {
	index := 0
	return func() (string, error) {
		if index >= len(tokens) {
			return "", nil
		}
		token := tokens[index]
		index++
		return token, nil
	}
}
