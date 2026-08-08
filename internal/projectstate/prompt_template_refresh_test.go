package projectstate

import (
	"testing"

	"setta/internal/prompttemplates"
)

func TestDocumentRefreshLinkedPromptSectionsForTemplateUpdatesLinkedCaches(t *testing.T) {
	t.Parallel()

	projectAlpha := promptSectionMutationTestProject(t)
	if err := projectAlpha.SetPromptTemplateLink("prompt-section", stringPointer("template-alpha"), "Old {{ name }}", prompttemplates.FormatJinja); err != nil {
		t.Fatalf("SetPromptTemplateLink alpha returned error: %v", err)
	}
	if err := projectAlpha.SetPromptInputs("prompt-section", map[string]string{"name": "Ada"}); err != nil {
		t.Fatalf("SetPromptInputs alpha returned error: %v", err)
	}

	projectBeta := promptSectionMutationTestProject(t)
	projectBeta.ID = "project-beta"
	projectBeta.Name = "Beta"
	if err := projectBeta.SetPromptTemplateLink("prompt-section", stringPointer("template-other"), "Other {{ name }}", prompttemplates.FormatJinja); err != nil {
		t.Fatalf("SetPromptTemplateLink beta returned error: %v", err)
	}
	if err := projectBeta.SetPromptInputs("prompt-section", map[string]string{"name": "Byron"}); err != nil {
		t.Fatalf("SetPromptInputs beta returned error: %v", err)
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": projectAlpha,
			"project-beta":  projectBeta,
		},
	}

	updated, err := document.RefreshLinkedPromptSectionsForTemplate("template-alpha", "Hello {{ name }}", prompttemplates.FormatJinja)
	if err != nil {
		t.Fatalf("RefreshLinkedPromptSectionsForTemplate returned error: %v", err)
	}
	if !updated {
		t.Fatal("expected linked prompt refresh to report updated=true")
	}

	alphaPayload, err := effectiveSectionPayload(document.Projects["project-alpha"], "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload alpha: %v", err)
	}
	if got := payloadRawStringField(alphaPayload, "template"); got != "Hello {{ name }}" {
		t.Fatalf("expected refreshed template, got %q", got)
	}
	if got := payloadRawStringField(alphaPayload, "renderedText"); got != "Hello Ada" {
		t.Fatalf("expected refreshed renderedText Hello Ada, got %q", got)
	}
	if value, ok := alphaPayload["renderError"]; !ok || value != nil {
		t.Fatalf("expected renderError to clear after refresh, got %#v", alphaPayload["renderError"])
	}

	betaPayload, err := effectiveSectionPayload(document.Projects["project-beta"], "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload beta: %v", err)
	}
	if got := payloadRawStringField(betaPayload, "template"); got != "Other {{ name }}" {
		t.Fatalf("expected unrelated template to stay unchanged, got %q", got)
	}

	updated, err = document.RefreshLinkedPromptSectionsForTemplate("template-alpha", "Hello {{ name }}", prompttemplates.FormatJinja)
	if err != nil {
		t.Fatalf("second RefreshLinkedPromptSectionsForTemplate returned error: %v", err)
	}
	if updated {
		t.Fatal("expected second linked prompt refresh to report updated=false")
	}
}
