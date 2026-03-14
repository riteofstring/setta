package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeTextBlockMutationsUpdateEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": textBlockMutationTestProject(t),
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

	if _, err := runtime.SetTextBlockDisplayMode(context.Background(), "project-alpha", "text-section", TextBlockDisplayModeEdit); err != nil {
		t.Fatalf("SetTextBlockDisplayMode returned error: %v", err)
	}
	if _, err := runtime.SetTextBlockFormat(context.Background(), "project-alpha", "text-section", TextBlockFormatMarkdown); err != nil {
		t.Fatalf("SetTextBlockFormat returned error: %v", err)
	}
	if _, err := runtime.SetTextBlockHeadingAsSectionName(context.Background(), "project-alpha", "text-section", true); err != nil {
		t.Fatalf("SetTextBlockHeadingAsSectionName returned error: %v", err)
	}
	if _, err := runtime.SetTextBlockText(context.Background(), "project-alpha", "text-section", "# Updated Heading\n\nBody"); err != nil {
		t.Fatalf("SetTextBlockText returned error: %v", err)
	}
	if _, err := runtime.SetTextBlockMetaControlStyle(context.Background(), "project-alpha", "text-section", true); err != nil {
		t.Fatalf("SetTextBlockMetaControlStyle returned error: %v", err)
	}
	if _, err := runtime.SetTextBlockMasterFontSize(context.Background(), "project-alpha", "text-section", 64); err != nil {
		t.Fatalf("SetTextBlockMasterFontSize returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if got := project.Sections["text-section"].Name; got != "Updated Heading" {
		t.Fatalf("expected section name Updated Heading, got %q", got)
	}

	payload, err := effectiveSectionPayload(project, "text-section", "text-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload text-section: %v", err)
	}
	if got := payloadRawStringField(payload, "textDisplayMode"); got != string(TextBlockDisplayModeEdit) {
		t.Fatalf("expected textDisplayMode %q, got %q", TextBlockDisplayModeEdit, got)
	}
	if got := payloadRawStringField(payload, "format"); got != string(TextBlockFormatMarkdown) {
		t.Fatalf("expected format %q, got %q", TextBlockFormatMarkdown, got)
	}
	if got := payloadRawStringField(payload, "text"); got != "# Updated Heading\n\nBody" {
		t.Fatalf("expected updated text, got %q", got)
	}
	if !payloadBoolField(payload, "headingAsSectionName") {
		t.Fatal("expected headingAsSectionName=true")
	}
	if !payloadBoolField(payload, "metaControlStyle") {
		t.Fatal("expected metaControlStyle=true")
	}
	if got, ok := payload["masterFontSizePx"].(float64); !ok || got != 48 {
		t.Fatalf("expected clamped masterFontSizePx 48, got %#v", payload["masterFontSizePx"])
	}
}

func TestRuntimeTextBlockMutationsIgnoreInvalidDerivedSectionName(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": textBlockMutationTestProject(t),
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

	if _, err := runtime.SetTextBlockHeadingAsSectionName(context.Background(), "project-alpha", "text-section", true); err != nil {
		t.Fatalf("SetTextBlockHeadingAsSectionName returned error: %v", err)
	}
	if _, err := runtime.SetTextBlockText(context.Background(), "project-alpha", "text-section", "# Taken Name\n\nBody"); err != nil {
		t.Fatalf("SetTextBlockText returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if got := project.Sections["text-section"].Name; got != "Seed Heading" {
		t.Fatalf("expected section name to remain Seed Heading, got %q", got)
	}
	payload, err := effectiveSectionPayload(project, "text-section", "text-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload text-section: %v", err)
	}
	if got := payloadRawStringField(payload, "text"); got != "# Taken Name\n\nBody" {
		t.Fatalf("expected text update to persist, got %q", got)
	}
}

func TestRuntimeTextBlockMutationsRejectInvalidTargetsAndValues(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": textBlockMutationTestProject(t),
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

	if _, err := runtime.SetTextBlockText(context.Background(), "project-alpha", "plain-section", "hello"); !errors.Is(err, ErrTextBlockSectionRequired) {
		t.Fatalf("expected ErrTextBlockSectionRequired from SetTextBlockText, got %v", err)
	}
	if _, err := runtime.SetTextBlockHeadingAsSectionName(context.Background(), "project-alpha", "plain-section", true); !errors.Is(err, ErrTextBlockSectionRequired) {
		t.Fatalf("expected ErrTextBlockSectionRequired from SetTextBlockHeadingAsSectionName, got %v", err)
	}
	if _, err := runtime.SetTextBlockMetaControlStyle(context.Background(), "project-alpha", "plain-section", true); !errors.Is(err, ErrTextBlockSectionRequired) {
		t.Fatalf("expected ErrTextBlockSectionRequired from SetTextBlockMetaControlStyle, got %v", err)
	}
	if _, err := runtime.SetTextBlockMasterFontSize(context.Background(), "project-alpha", "plain-section", 12); !errors.Is(err, ErrTextBlockSectionRequired) {
		t.Fatalf("expected ErrTextBlockSectionRequired from SetTextBlockMasterFontSize, got %v", err)
	}
	if _, err := runtime.SetTextBlockDisplayMode(context.Background(), "project-alpha", "text-section", TextBlockDisplayMode("Preview")); !errors.Is(err, ErrTextBlockDisplayModeInvalid) {
		t.Fatalf("expected ErrTextBlockDisplayModeInvalid, got %v", err)
	}
	if _, err := runtime.SetTextBlockFormat(context.Background(), "project-alpha", "text-section", TextBlockFormat("HTML")); !errors.Is(err, ErrTextBlockFormatInvalid) {
		t.Fatalf("expected ErrTextBlockFormatInvalid, got %v", err)
	}
}

func textBlockMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"text-section":  "text-variant",
			"plain-section": "plain-variant",
			"taken-section": "taken-variant",
		},
		Sections: map[string]Section{
			"text-section": {
				ID:               "text-section",
				Name:             "Seed Section",
				VariantIDs:       []string{"text-variant"},
				DefaultVariantID: "text-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
			"taken-section": {
				ID:               "taken-section",
				Name:             "Taken Name",
				VariantIDs:       []string{"taken-variant"},
				DefaultVariantID: "taken-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"text-variant": {
				ID:     "text-variant",
				ImplID: "text-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
			"taken-variant": {
				ID:     "taken-variant",
				ImplID: "taken-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"text-impl": {
				ID:   "text-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                   "text-impl",
					"type":                 "TextBlock",
					"text":                 "# Seed Heading\n\nBody",
					"format":               "Plaintext",
					"masterFontSizePx":     14.0,
					"headingAsSectionName": false,
					"metaControlStyle":     false,
					"textDisplayMode":      "Render",
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "plain-impl",
					"type": "Chat",
				}),
			},
			"taken-impl": {
				ID:   "taken-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "taken-impl",
					"type": "TextBlock",
					"text": "# Already Taken",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize text block mutation project: %v", err)
	}
	return project
}
