package projectstate

import (
	"errors"
	"testing"
)

func TestDocumentSetProjectNameTrimsWhitespaceAndUpdatesProject(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}

	if err := document.SetProjectName("project-alpha", "  Renamed Project  "); err != nil {
		t.Fatalf("set project name: %v", err)
	}

	if got := document.Projects["project-alpha"].Name; got != "Renamed Project" {
		t.Fatalf("expected trimmed renamed project, got %q", got)
	}
}

func TestDocumentSetProjectNameRejectsReservedName(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
	}{
		{
			name:  "home",
			input: "home",
		},
		{
			name:  "settings",
			input: "Settings",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			document := Document{
				SchemaVersion:    CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]Project{
					"project-alpha": {
						ID:   "project-alpha",
						Name: "Alpha",
					},
				},
			}

			err := document.SetProjectName("project-alpha", testCase.input)
			if err == nil {
				t.Fatal("expected reserved-name error")
			}
			if !IsInvalidProjectNameError(err) {
				t.Fatalf("expected invalid project name error, got %v", err)
			}
		})
	}
}

func TestDocumentSetProjectNameRejectsDocumentedFormatFailures(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
	}{
		{
			name:  "path_separator",
			input: "bad/name",
		},
		{
			name:  "dotdot_segment",
			input: "bad..name",
		},
		{
			name:  "control_character",
			input: "bad\nname",
		},
		{
			name:  "invalid_character",
			input: "bad@name",
		},
		{
			name:  "empty_after_trim",
			input: "   ",
		},
		{
			name:  "invalid_after_sanitization",
			input: "__",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			document := Document{
				SchemaVersion:    CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]Project{
					"project-alpha": {
						ID:   "project-alpha",
						Name: "Alpha",
					},
				},
			}

			err := document.SetProjectName("project-alpha", testCase.input)
			if err == nil {
				t.Fatal("expected invalid format error")
			}
			if !IsInvalidProjectNameError(err) {
				t.Fatalf("expected invalid project name error, got %v", err)
			}
			if got := document.Projects["project-alpha"].Name; got != "Alpha" {
				t.Fatalf("expected rejected rename to keep Alpha, got %q", got)
			}
		})
	}
}

func TestDocumentSetProjectNameRejectsSlugCollision(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		existing    string
		replacement string
	}{
		{
			name:        "sanitized_collision",
			existing:    "foo_bar",
			replacement: "foo bar",
		},
		{
			name:        "case_insensitive_collision",
			existing:    "Foo",
			replacement: "foo",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			document := Document{
				SchemaVersion:    CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]Project{
					"project-alpha": {
						ID:   "project-alpha",
						Name: testCase.existing,
					},
					"project-beta": {
						ID:   "project-beta",
						Name: "Beta",
					},
				},
			}

			err := document.SetProjectName("project-beta", testCase.replacement)
			if err == nil {
				t.Fatal("expected slug-collision error")
			}
			if !IsInvalidProjectNameError(err) {
				t.Fatalf("expected invalid project name error, got %v", err)
			}
		})
	}
}

func TestDocumentSetProjectNameRequiresKnownProject(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}

	err := document.SetProjectName("missing", "Alpha")
	if err == nil {
		t.Fatal("expected missing-project error")
	}
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
}
