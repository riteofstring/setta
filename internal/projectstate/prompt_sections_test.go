package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"setta/internal/prompttemplates"
)

func TestRuntimePromptSectionMutationsUpdateEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": promptSectionMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetPromptTemplate(context.Background(), "project-alpha", "prompt-section", "Hello {{ name }}"); err != nil {
		t.Fatalf("SetPromptTemplate returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload prompt-section after template update: %v", err)
	}
	if got := payloadRawStringField(payload, "renderedText"); got != "" {
		t.Fatalf("expected empty renderedText while inputs are missing, got %q", got)
	}
	if got := payloadStringArrayField(payload, "missingVariables"); !reflect.DeepEqual(got, []string{"name"}) {
		t.Fatalf("expected missingVariables [name], got %#v", got)
	}
	if got := payloadRawStringField(payload, "renderError"); got != "Missing variables: name" {
		t.Fatalf("expected Missing variables error, got %q", got)
	}

	if _, err := runtime.SetPromptInputs(context.Background(), "project-alpha", "prompt-section", map[string]string{"name": ""}); err != nil {
		t.Fatalf("SetPromptInputs returned error: %v", err)
	}
	if _, err := runtime.SetPromptFormat(context.Background(), "project-alpha", "prompt-section", prompttemplates.FormatJinja); err != nil {
		t.Fatalf("SetPromptFormat returned error: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err = effectiveSectionPayload(project, "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload prompt-section after successful render: %v", err)
	}
	if got := payloadRawStringField(payload, "template"); got != "Hello {{ name }}" {
		t.Fatalf("expected template Hello {{ name }}, got %q", got)
	}
	if got := payloadRawStringField(payload, "format"); got != string(prompttemplates.FormatJinja) {
		t.Fatalf("expected format %q, got %q", prompttemplates.FormatJinja, got)
	}
	inputs, ok := payload["inputs"].(map[string]any)
	if !ok || inputs["name"] != "" {
		t.Fatalf("expected inputs to preserve blank string values, got %#v", payload["inputs"])
	}
	if got := payloadRawStringField(payload, "renderedText"); got != "Hello " {
		t.Fatalf("expected renderedText Hello<space>, got %q", got)
	}
	if got := payloadStringArrayField(payload, "missingVariables"); len(got) != 0 {
		t.Fatalf("expected missingVariables to be empty, got %#v", got)
	}
	if value, ok := payload["renderError"]; !ok || value != nil {
		t.Fatalf("expected renderError to be null after success, got %#v", payload["renderError"])
	}
}

func TestRuntimePromptSectionMutationsLinkPromptTemplatesAndClearLinksOnLocalEdits(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": promptSectionMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetPromptTemplateLink(
		context.Background(),
		"project-alpha",
		"prompt-section",
		stringPointer("template-alpha"),
		"Linked {{ name }}",
		prompttemplates.FormatJinja,
	); err != nil {
		t.Fatalf("SetPromptTemplateLink returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload prompt-section after link: %v", err)
	}
	if got := payloadRawStringField(payload, "promptTemplateId"); got != "template-alpha" {
		t.Fatalf("expected promptTemplateId template-alpha, got %q", got)
	}
	if got := payloadRawStringField(payload, "template"); got != "Linked {{ name }}" {
		t.Fatalf("expected linked template text, got %q", got)
	}

	if _, err := runtime.SetPromptTemplate(context.Background(), "project-alpha", "prompt-section", "Local copy"); err != nil {
		t.Fatalf("SetPromptTemplate returned error: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err = effectiveSectionPayload(project, "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload prompt-section after unlinking local edit: %v", err)
	}
	if value, ok := payload["promptTemplateId"]; !ok || value != nil {
		t.Fatalf("expected promptTemplateId to clear on local edit, got %#v", payload["promptTemplateId"])
	}
	if got := payloadRawStringField(payload, "template"); got != "Local copy" {
		t.Fatalf("expected local template text, got %q", got)
	}
}

func TestRuntimePromptSectionMutationsReportSyntaxErrors(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": promptSectionMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetPromptTemplate(context.Background(), "project-alpha", "prompt-section", "Hello {{ name "); err != nil {
		t.Fatalf("SetPromptTemplate returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "prompt-section", "prompt-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload prompt-section: %v", err)
	}
	if got := payloadRawStringField(payload, "renderedText"); got != "" {
		t.Fatalf("expected empty renderedText on syntax error, got %q", got)
	}
	if got := payloadStringArrayField(payload, "missingVariables"); len(got) != 0 {
		t.Fatalf("expected no missing variables for syntax error, got %#v", got)
	}
	if got := payloadRawStringField(payload, "renderError"); got == "" {
		t.Fatal("expected syntax error message to be stored")
	}
}

func TestRuntimePromptSectionMutationsRejectInvalidTargetsAndFormats(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": promptSectionMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetPromptTemplate(context.Background(), "project-alpha", "plain-section", "Hello"); !errors.Is(err, ErrPromptSectionRequired) {
		t.Fatalf("expected ErrPromptSectionRequired from SetPromptTemplate, got %v", err)
	}
	if _, err := runtime.SetPromptTemplateLink(
		context.Background(),
		"project-alpha",
		"plain-section",
		stringPointer("template-alpha"),
		"Hello {{ name }}",
		prompttemplates.FormatJinja,
	); !errors.Is(err, ErrPromptSectionRequired) {
		t.Fatalf("expected ErrPromptSectionRequired from SetPromptTemplateLink, got %v", err)
	}
	if _, err := runtime.SetPromptInputs(context.Background(), "project-alpha", "plain-section", map[string]string{"name": "Ada"}); !errors.Is(err, ErrPromptSectionRequired) {
		t.Fatalf("expected ErrPromptSectionRequired from SetPromptInputs, got %v", err)
	}
	if _, err := runtime.SetPromptFormat(context.Background(), "project-alpha", "prompt-section", prompttemplates.Format("Liquid")); !errors.Is(err, ErrPromptFormatInvalid) {
		t.Fatalf("expected ErrPromptFormatInvalid from SetPromptFormat, got %v", err)
	}
}

func promptSectionMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"prompt-section": "prompt-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]Section{
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"prompt-impl": {
				ID:   "prompt-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":               "prompt-impl",
					"type":             "Prompt",
					"template":         "",
					"inputs":           map[string]string{},
					"format":           string(prompttemplates.FormatJinja),
					"renderedText":     "",
					"missingVariables": []string{},
					"renderError":      nil,
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "plain-impl",
					"type": "TextBlock",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize prompt mutation project: %v", err)
	}
	return project
}
