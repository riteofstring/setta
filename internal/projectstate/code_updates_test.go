package projectstate

import (
	"testing"
)

func TestProjectSetCodeUpdatesInlineCodePayload(t *testing.T) {
	t.Parallel()

	project := codeUpdateTestProject(t, CodeFileAccessModeReadWrite)
	if err := project.SetCode("section-main", "print('updated')\n"); err != nil {
		t.Fatalf("set code: %v", err)
	}

	payload, err := effectiveSectionPayload(project, "section-main", "variant-main")
	if err != nil {
		t.Fatalf("effective section payload: %v", err)
	}
	if got := payloadRawStringField(payload, "code"); got != "print('updated')\n" {
		t.Fatalf("expected updated code payload, got %q", got)
	}
}

func TestProjectSetCodeRejectsReadOnlyBinding(t *testing.T) {
	t.Parallel()

	project := codeUpdateTestProject(t, CodeFileAccessModeReadOnly)
	err := project.SetCode("section-main", "print('blocked')\n")
	if err == nil {
		t.Fatal("expected read-only set code to fail")
	}
	if got, want := err.Error(), `code section is read-only: "section-main"`; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}

	payload, err := effectiveSectionPayload(project, "section-main", "variant-main")
	if err != nil {
		t.Fatalf("effective section payload: %v", err)
	}
	if got := payloadRawStringField(payload, "code"); got != "print('hello')\n" {
		t.Fatalf("expected original code to stay unchanged, got %q", got)
	}
}

func codeUpdateTestProject(t *testing.T, accessMode CodeFileAccessMode) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"section-main": "variant-main",
		},
		Sections: map[string]Section{
			"section-main": {
				ID:               "section-main",
				Name:             "Main",
				VariantIDs:       []string{"variant-main"},
				DefaultVariantID: "variant-main",
				UnsharedKeys:     []string{"code"},
			},
		},
		SectionVariants: map[string]SectionVariant{
			"variant-main": {
				ID:               "variant-main",
				ImplID:           "impl-main",
				NonPresetImplIDs: []string{"impl-main"},
			},
		},
		SectionImpls: map[string]SectionImpl{
			"impl-main": {
				ID:   "impl-main",
				Kind: SectionKindCode,
				Payload: RawJSON(`{
					"id":"impl-main",
					"type":"Code",
					"code":"print('hello')\n",
					"codeLanguage":"python",
					"children":[]
				}`),
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
					Binding: &CodeFileBinding{
						Path:       "pkg/bound.py",
						AccessMode: accessMode,
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code update test project: %v", err)
	}
	return project
}
