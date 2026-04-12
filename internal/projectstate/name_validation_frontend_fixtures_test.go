package projectstate

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type nameValidationFixtureCase struct {
	Name  string  `json:"name"`
	Error *string `json:"error"`
}

type nameValidationFixtures struct {
	Project     []nameValidationFixtureCase `json:"project"`
	Section     []nameValidationFixtureCase `json:"section"`
	ViewMode    []nameValidationFixtureCase `json:"viewMode"`
	WindowSpace []nameValidationFixtureCase `json:"windowSpace"`
	Param       []nameValidationFixtureCase `json:"param"`
}

// The frontend keeps these validation expectations in one shared fixture file.
// Mirror that file here so Go-owned validation helpers stay aligned with the
// same caller-visible cases.
func TestNameValidationSharedFixturesMatchFrontendCases(t *testing.T) {
	t.Parallel()

	fixtures := loadNameValidationFixtures(t)

	t.Run("project", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range fixtures.Project {
			assertFixtureValidationError(
				t,
				"project",
				testCase,
				projectNameValidationErrorForFixture(t, testCase.Name),
			)
		}
	})

	t.Run("section", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range fixtures.Section {
			assertFixtureValidationError(
				t,
				"section",
				testCase,
				sectionNameValidationErrorForFixture(t, testCase.Name),
			)
		}
	})

	t.Run("view_mode", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range fixtures.ViewMode {
			assertFixtureValidationError(
				t,
				"view_mode",
				testCase,
				viewModeNameValidationErrorForFixture(t, testCase.Name),
			)
		}
	})

	t.Run("window_space", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range fixtures.WindowSpace {
			assertFixtureValidationError(
				t,
				"window_space",
				testCase,
				windowSpaceNameValidationErrorForFixture(t, testCase.Name),
			)
		}
	})

	t.Run("param", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range fixtures.Param {
			assertFixtureValidationError(
				t,
				"param",
				testCase,
				paramNameValidationErrorForFixture(t, testCase.Name),
			)
		}
	})
}

func loadNameValidationFixtures(t *testing.T) nameValidationFixtures {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("..", "..", "tests", "fixtures", "name_validation_cases.json"))
	if err != nil {
		t.Fatalf("read name validation fixtures: %v", err)
	}

	var fixtures nameValidationFixtures
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatalf("decode name validation fixtures: %v", err)
	}
	return fixtures
}

func assertFixtureValidationError(t *testing.T, family string, testCase nameValidationFixtureCase, got string) {
	t.Helper()

	want := fixtureErrorString(testCase.Error)
	if got != want {
		t.Fatalf("%s fixture %q: got %q, want %q", family, testCase.Name, got, want)
	}
}

func fixtureErrorString(message *string) string {
	if message == nil {
		return ""
	}
	return *message
}

func projectNameValidationErrorForFixture(t *testing.T, name string) string {
	t.Helper()

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

	_, err := validateProjectName(document, "project-alpha", name, false)
	return invalidProjectNameMessage(t, err)
}

func sectionNameValidationErrorForFixture(t *testing.T, name string) string {
	t.Helper()

	_, err := validateSectionName(sectionNameTestProject(t), "target", name)
	return invalidSectionNameMessage(t, err)
}

func viewModeNameValidationErrorForFixture(t *testing.T, name string) string {
	t.Helper()

	_, err := validateViewModeName(viewModesTestProject(t), "focus", name)
	return invalidViewModeNameMessage(t, err)
}

func windowSpaceNameValidationErrorForFixture(t *testing.T, name string) string {
	t.Helper()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		WindowSpaces: map[string]WindowSpaceConfig{
			"space-a": {
				ID:        "space-a",
				Name:      "Primary",
				SortIndex: 0,
			},
		},
	}

	_, err := validateWindowSpaceName(project, "space-a", name)
	return invalidWindowSpaceNameMessage(t, err)
}

func paramNameValidationErrorForFixture(t *testing.T, name string) string {
	t.Helper()

	_, err := validateParamCodeObjectNameForSection(
		codeObjectNameTestProject(t),
		"callable-section",
		"editable-kwarg",
		name,
	)
	return invalidCodeObjectNameMessage(t, err)
}

func invalidProjectNameMessage(t *testing.T, err error) string {
	t.Helper()

	if err == nil {
		return ""
	}
	var invalid *InvalidProjectNameError
	if !errors.As(err, &invalid) {
		t.Fatalf("expected InvalidProjectNameError, got %v", err)
	}
	return invalid.Message
}

func invalidSectionNameMessage(t *testing.T, err error) string {
	t.Helper()

	if err == nil {
		return ""
	}
	var invalid *InvalidSectionNameError
	if !errors.As(err, &invalid) {
		t.Fatalf("expected InvalidSectionNameError, got %v", err)
	}
	return invalid.Message
}

func invalidViewModeNameMessage(t *testing.T, err error) string {
	t.Helper()

	if err == nil {
		return ""
	}
	var invalid *InvalidViewModeNameError
	if !errors.As(err, &invalid) {
		t.Fatalf("expected InvalidViewModeNameError, got %v", err)
	}
	return invalid.Message
}

func invalidWindowSpaceNameMessage(t *testing.T, err error) string {
	t.Helper()

	if err == nil {
		return ""
	}
	var invalid *InvalidWindowSpaceNameError
	if !errors.As(err, &invalid) {
		t.Fatalf("expected InvalidWindowSpaceNameError, got %v", err)
	}
	return invalid.Message
}

func invalidCodeObjectNameMessage(t *testing.T, err error) string {
	t.Helper()

	if err == nil {
		return ""
	}
	var invalid *InvalidCodeObjectNameError
	if !errors.As(err, &invalid) {
		t.Fatalf("expected InvalidCodeObjectNameError, got %v", err)
	}
	return invalid.Message
}
