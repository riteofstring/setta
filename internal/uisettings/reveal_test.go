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

func TestRevealServiceLeavesRightPaneActivationToFrontend(t *testing.T) {
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
	projectView := revealTestProjectView(t, "callable-section", "Callable", nil)
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
		if got := projectView.ProjectConfig.ActiveIDs; len(got) != 0 {
			t.Fatalf("expected backend reveal flow not to mutate active ids before frontend ack, got %#v", got)
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
		RequestIDSource: fixedRevealRequestIDSource("request-frontend-owned"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID:       "project-alpha",
		ProjectView:           projectView,
		Registry:              revealTestRegistry(t),
		SettingID:             "core.project.show_param_display_names",
		SectionIDToActivate:   "callable-section",
		FrontendAffinityToken: token,
		DurationMS:            1500,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if got := projectView.ProjectConfig.ActiveIDs; len(got) != 0 {
		t.Fatalf("expected reveal service to leave active ids frontend-owned after reveal, got %#v", got)
	}
	if result.EmittedRevealCount != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %d", result.EmittedRevealCount)
	}
	if len(result.Statuses) != 1 || result.Statuses[0].Status != "revealed" {
		t.Fatalf("expected single revealed status, got %#v", result.Statuses)
	}
}

// Structured reveal dispatch must preserve the frontend-facing target payload,
// including strategy, activation steps, and request correlation.
func TestRevealServiceDispatchesStructuredWebsocketPayloadWithActivationSteps(t *testing.T) {
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

	revealRegistry, err := New([]RuntimeEntry{
		{
			Metadata: Entry{
				SettingID:   "core.project.activation_steps",
				Title:       "Activation Steps",
				Description: "Reveal target with activation steps.",
				Location: Location{
					Side:                     SideRight,
					UIEditorTabName:          "QuickInfoConfig",
					RequiresSectionSelection: true,
				},
				Highlight: Highlight{
					Strategy: HighlightStrategyDOMAnchor,
					AnchorID: "core.project.activation_steps",
				},
				RevealActivationSteps: []RevealActivationStep{
					{
						Type:      RevealActivationRunInstructions,
						ItemValue: "python",
					},
					{
						Type:      RevealActivationProjectAIAccordion,
						ItemValue: "skills",
					},
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
		t.Fatalf("new reveal registry: %v", err)
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
		if revealMessage.MessageType != realtime.MessageTypeUISettingReveal {
			t.Fatalf("expected message type %q, got %q", realtime.MessageTypeUISettingReveal, revealMessage.MessageType)
		}
		if revealMessage.Content.RequestID != "request-steps-1" {
			t.Fatalf("expected requestId request-steps-1, got %q", revealMessage.Content.RequestID)
		}
		if len(revealMessage.Content.Reveals) != 1 {
			t.Fatalf("expected one reveal target, got %#v", revealMessage.Content.Reveals)
		}
		target := revealMessage.Content.Reveals[0]
		if target.SettingID != "core.project.activation_steps" {
			t.Fatalf("expected activation-steps setting id, got %#v", target.SettingID)
		}
		if target.Strategy != string(HighlightStrategyDOMAnchor) {
			t.Fatalf("expected strategy %q, got %q", HighlightStrategyDOMAnchor, target.Strategy)
		}
		if target.AnchorID == nil || *target.AnchorID != "core.project.activation_steps" {
			t.Fatalf("expected anchor id core.project.activation_steps, got %#v", target.AnchorID)
		}
		if len(target.RevealActivationSteps) != 2 {
			t.Fatalf("expected two activation steps, got %#v", target.RevealActivationSteps)
		}
		if target.RevealActivationSteps[0].Type != string(RevealActivationRunInstructions) || target.RevealActivationSteps[0].ItemValue != "python" {
			t.Fatalf("unexpected first activation step %#v", target.RevealActivationSteps[0])
		}
		if target.RevealActivationSteps[1].Type != string(RevealActivationProjectAIAccordion) || target.RevealActivationSteps[1].ItemValue != "skills" {
			t.Fatalf("unexpected second activation step %#v", target.RevealActivationSteps[1])
		}
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-alpha",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID:    "core.project.activation_steps",
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
		RequestIDSource: fixedRevealRequestIDSource("request-steps-1"),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	result, err := service.Reveal(context.Background(), RevealInput{
		ProjectConfigID:       "project-alpha",
		ProjectView:           revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:              revealRegistry,
		SettingID:             "core.project.activation_steps",
		SectionIDToActivate:   "callable-section",
		FrontendAffinityToken: token,
		DurationMS:            1500,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if result.RequestID != "request-steps-1" {
		t.Fatalf("expected request-steps-1 request id, got %q", result.RequestID)
	}
	if result.EmittedRevealCount != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %d", result.EmittedRevealCount)
	}
	if len(result.Statuses) != 1 || result.Statuses[0].Status != "revealed" {
		t.Fatalf("expected single revealed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Target == nil || len(result.Statuses[0].Target.RevealActivationSteps) != 2 {
		t.Fatalf("expected success status target with activation steps, got %#v", result.Statuses[0].Target)
	}
}

func TestRevealServicePrefersExplicitRightPaneSectionOverContextAndActiveSelection(t *testing.T) {
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
		ProjectConfigID:       "project-alpha",
		ProjectView:           revealTestProjectViewWithSections(t, map[string]string{"callable-section": "Callable", "code-section": "Code"}, []string{"code-section"}),
		Registry:              revealTestRegistry(t),
		SettingID:             "core.project.show_param_display_names",
		SectionIDToActivate:   "callable-section",
		ContextSectionID:      "code-section",
		FrontendAffinityToken: token,
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

func TestRevealServiceRejectsMissingFrontendWithoutShareSession(t *testing.T) {
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
		ProjectConfigID:     "project-alpha",
		ProjectView:         revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:            revealTestRegistry(t),
		SettingID:           "core.project.show_param_display_names",
		SectionIDToActivate: "callable-section",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "No connected frontend is available for UI setting reveal." {
		t.Fatalf("unexpected no-frontend message: %q", result.Statuses[0].Error.Message)
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

func TestRevealServiceRejectsUnavailableAffinityTokenAfterFrontendDisconnect(t *testing.T) {
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
	if removed := registry.Unregister(connection.ID); !removed {
		t.Fatalf("expected unregister for %q", connection.ID)
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
		FrontendAffinityToken: token,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Frontend affinity token is invalid or no longer available for reveal routing: frontend-token" {
		t.Fatalf("unexpected disconnected-affinity error message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceFailsWhenSelectedFrontendBecomesUndeliverableBeforeDispatch(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}

	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, _ any, connectionID string) (bool, error) {
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		return false, nil
	}

	service, err := NewRevealService(RevealServiceOptions{
		Transport:       transport,
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
	if result.Statuses[0].Error.Message != "Selected frontend websocket became unavailable before reveal dispatch: frontend-1" {
		t.Fatalf("unexpected undeliverable-dispatch message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceFailsClosedOnFrontendTimeout(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
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
		ProjectConfigID:     "project-alpha",
		ProjectView:         revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:            revealTestRegistry(t),
		SettingID:           "core.project.show_param_display_names",
		SectionIDToActivate: "callable-section",
		DurationMS:          250,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Timed out waiting for frontend reveal confirmation for core.project.show_param_display_names." {
		t.Fatalf("unexpected timeout message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceFailsClosedWhenFrontendStatusMissing(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}

	results := realtime.NewUISettingRevealResultHub()
	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-alpha",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID: "core.watch_code.enabled",
					Status:    "revealed",
				},
			},
		}, connectionID) {
			t.Fatal("expected mismatch result to be consumed")
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
		ProjectConfigID:     "project-alpha",
		ProjectView:         revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:            revealTestRegistry(t),
		SettingID:           "core.project.show_param_display_names",
		SectionIDToActivate: "callable-section",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	expectedMessage := "frontend reveal response contract mismatch for request request-1 from websocket frontend-1: frontend reveal response setting id mismatch: expected [core.project.show_param_display_names] but received [core.watch_code.enabled]"
	if result.Statuses[0].Error.Message != expectedMessage {
		t.Fatalf("unexpected missing-status message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceFailsClosedWhenFrontendReportsFailedStatus(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}

	results := realtime.NewUISettingRevealResultHub()
	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		errorCode := "mutation_failed"
		errorMessage := "Quick Info anchor not found."
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-alpha",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID:    "core.project.show_param_display_names",
					Status:       "failed",
					ErrorCode:    &errorCode,
					ErrorMessage: &errorMessage,
				},
			},
		}, connectionID) {
			t.Fatal("expected failed status result to resolve")
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
		ProjectConfigID:     "project-alpha",
		ProjectView:         revealTestProjectView(t, "callable-section", "Callable", nil),
		Registry:            revealTestRegistry(t),
		SettingID:           "core.project.show_param_display_names",
		SectionIDToActivate: "callable-section",
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	if result.Statuses[0].Error.Message != "Quick Info anchor not found." {
		t.Fatalf("unexpected frontend-failed-status message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceFailsClosedOnFrontendAckProjectMismatch(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}

	results := realtime.NewUISettingRevealResultHub()
	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-beta",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		}, connectionID) {
			t.Fatal("expected mismatch result to be consumed")
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
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	expectedMessage := "frontend reveal response contract mismatch for request request-1 from websocket frontend-1: frontend reveal response project mismatch: expected project-alpha but received project-beta"
	if result.Statuses[0].Error.Message != expectedMessage {
		t.Fatalf("unexpected project-mismatch message: %q", result.Statuses[0].Error.Message)
	}
}

func TestRevealServiceFailsClosedOnFrontendAckWebsocketMismatch(t *testing.T) {
	t.Parallel()

	registry := realtime.NewRegistry(realtime.RegistryOptions{
		FrontendAffinityTokenSource: sequentialTokenSource("frontend-token-1", "frontend-token-2"),
	})
	connection, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend})
	if err != nil {
		t.Fatalf("register expected frontend: %v", err)
	}
	token, ok := registry.FrontendAffinityToken(connection.ID)
	if !ok {
		t.Fatal("expected frontend affinity token")
	}
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-2", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register mismatched frontend: %v", err)
	}

	results := realtime.NewUISettingRevealResultHub()
	transport := &stubRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
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
		}, "frontend-2") {
			t.Fatal("expected mismatch result to be consumed")
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
		ProjectView:           revealTestProjectView(t, "callable-section", "Callable", []string{"callable-section"}),
		Registry:              revealTestRegistry(t),
		SettingID:             "core.project.show_param_display_names",
		FrontendAffinityToken: token,
	})
	if err != nil {
		t.Fatalf("reveal: %v", err)
	}

	if len(result.Statuses) != 1 || result.Statuses[0].Error == nil {
		t.Fatalf("expected failed status, got %#v", result.Statuses)
	}
	expectedMessage := "frontend reveal response contract mismatch for request request-1 from websocket frontend-2: frontend reveal response websocket mismatch: expected frontend-1 but received frontend-2"
	if result.Statuses[0].Error.Message != expectedMessage {
		t.Fatalf("unexpected websocket-mismatch message: %q", result.Statuses[0].Error.Message)
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
	return revealTestProjectViewWithSections(t, map[string]string{sectionID: sectionType}, activeIDs)
}

func revealTestProjectViewWithSections(t *testing.T, sectionTypes map[string]string, activeIDs []string) *projectview.SingleConfig {
	t.Helper()

	sections := make(map[string]projectview.Core, len(sectionTypes))
	sectionImpls := make(map[string]json.RawMessage, len(sectionTypes))
	sectionVariants := make(map[string]projectview.Variant, len(sectionTypes))
	sectionVariantMap := make(map[string]string, len(sectionTypes))

	for sectionID, sectionType := range sectionTypes {
		defaultVariantID := sectionID + "-variant"
		implID := sectionID + "-impl"
		sections[sectionID] = projectview.Core{
			ID:             sectionID,
			Name:           sectionID,
			DisplayName:    sectionID,
			Variants:       []string{defaultVariantID},
			DefaultVariant: &defaultVariantID,
		}
		sectionImpls[implID] = mustRevealRawJSON(t, map[string]any{
			"id":   implID,
			"type": sectionType,
		})
		sectionVariants[defaultVariantID] = projectview.Variant{
			ID:   defaultVariantID,
			Name: defaultVariantID,
			Impl: implID,
		}
		sectionVariantMap[sectionID] = defaultVariantID
	}

	return &projectview.SingleConfig{
		Sections:        sections,
		SectionImpls:    sectionImpls,
		SectionVariants: sectionVariants,
		ProjectConfig: projectview.ProjectConfig{
			ID:                "project-alpha",
			SectionVariantMap: sectionVariantMap,
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
