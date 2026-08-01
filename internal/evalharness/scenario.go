package evalharness

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/jsonio"
)

const (
	ScenarioSchemaVersion       = 1
	ScenarioTimeoutSeconds      = 1800
	ScenarioMaximumFileBytes    = 64 * 1024
	ScenarioMaximumSteps        = 8
	ScenarioMaximumMessageBytes = 16 * 1024
	ScenarioMaximumTokenBudget  = 1_000_000

	ScenarioFixtureTypeScriptService = "typescript-service"
	ScenarioVerifierStraightforward  = "straightforward-task"
)

type ScenarioStepKind string

const (
	ScenarioStepSubmit ScenarioStepKind = "submit"
)

type ScenarioTerminalState string

const (
	ScenarioTerminalCompleted ScenarioTerminalState = "completed"
)

type ScenarioClarificationPolicy string

const (
	ScenarioClarificationForbidden ScenarioClarificationPolicy = "forbidden"
)

type ScenarioProgressPolicy string

const (
	ScenarioProgressWhenUseful ScenarioProgressPolicy = "when_useful"
)

type Scenario struct {
	SchemaVersion  int                   `json:"schemaVersion"`
	ID             string                `json:"id"`
	Fixture        string                `json:"fixture"`
	TimeoutSeconds int                   `json:"timeoutSeconds"`
	Steps          []ScenarioStep        `json:"steps"`
	Expect         ScenarioExpectations  `json:"expect"`
	Verifier       string                `json:"verifier"`
	Budget         ScenarioBudget        `json:"budget"`
	Communication  ScenarioCommunication `json:"communication"`
}

type ScenarioStep struct {
	Kind ScenarioStepKind `json:"kind"`
	Text string           `json:"text"`
}

type ScenarioExpectations struct {
	TerminalState ScenarioTerminalState       `json:"terminalState"`
	Clarification ScenarioClarificationPolicy `json:"clarification"`
}

type ScenarioBudget struct {
	HardTotalTokens int64 `json:"hardTotalTokens"`
}

type ScenarioCommunication struct {
	Progress            ScenarioProgressPolicy `json:"progress"`
	FinalResultRequired bool                   `json:"finalResultRequired"`
}

func LoadScenario(path string) (Scenario, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return Scenario{}, fmt.Errorf("inspect eval scenario %s: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return Scenario{}, fmt.Errorf("eval scenario %s must be a regular file", path)
	}
	if info.Size() > ScenarioMaximumFileBytes {
		return Scenario{}, fmt.Errorf(
			"eval scenario %s is %d bytes, maximum is %d",
			path,
			info.Size(),
			ScenarioMaximumFileBytes,
		)
	}
	file, err := os.Open(path)
	if err != nil {
		return Scenario{}, fmt.Errorf("open eval scenario %s: %w", path, err)
	}
	defer file.Close()
	var scenario Scenario
	if err := jsonio.DecodeSingle(file, &scenario); err != nil {
		return Scenario{}, fmt.Errorf("decode eval scenario %s: %w", path, err)
	}
	if err := scenario.Validate(); err != nil {
		return Scenario{}, fmt.Errorf("validate eval scenario %s: %w", path, err)
	}
	return scenario, nil
}

// LoadScenarios reads either the complete sorted catalog or an explicit,
// ordered subset. Scenario identifiers are filenames by contract, so selection
// never becomes an arbitrary filesystem path.
func LoadScenarios(directory string, selectedIDs []string) ([]Scenario, error) {
	paths, err := selectScenarioPaths(directory, selectedIDs)
	if err != nil {
		return nil, err
	}
	scenarios := make([]Scenario, 0, len(paths))
	seen := make(map[string]string, len(paths))
	for _, path := range paths {
		scenario, err := LoadScenario(path)
		if err != nil {
			return nil, err
		}
		filenameID := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		if scenario.ID != filenameID {
			return nil, fmt.Errorf(
				"eval scenario file %s declares id %q",
				filepath.Base(path),
				scenario.ID,
			)
		}
		if firstPath, exists := seen[scenario.ID]; exists {
			return nil, fmt.Errorf(
				"eval scenario id %q is repeated by %s and %s",
				scenario.ID,
				firstPath,
				path,
			)
		}
		seen[scenario.ID] = path
		scenarios = append(scenarios, scenario)
	}
	return scenarios, nil
}

func (scenario Scenario) Validate() error {
	if scenario.SchemaVersion != ScenarioSchemaVersion {
		return fmt.Errorf(
			"schemaVersion is %d, want %d",
			scenario.SchemaVersion,
			ScenarioSchemaVersion,
		)
	}
	if err := validateScenarioIdentifier("id", scenario.ID); err != nil {
		return err
	}
	if scenario.Fixture != ScenarioFixtureTypeScriptService {
		return fmt.Errorf("fixture %q is not supported", scenario.Fixture)
	}
	if scenario.TimeoutSeconds != ScenarioTimeoutSeconds {
		return fmt.Errorf(
			"timeoutSeconds is %d, want the current contract value %d",
			scenario.TimeoutSeconds,
			ScenarioTimeoutSeconds,
		)
	}
	if scenario.Steps == nil {
		return errors.New("steps must be an array, not null")
	}
	if len(scenario.Steps) == 0 || len(scenario.Steps) > ScenarioMaximumSteps {
		return fmt.Errorf("steps contains %d entries, want 1-%d", len(scenario.Steps), ScenarioMaximumSteps)
	}
	for index, step := range scenario.Steps {
		if err := step.Validate(); err != nil {
			return fmt.Errorf("step %d: %w", index, err)
		}
	}
	if err := scenario.Expect.Validate(); err != nil {
		return fmt.Errorf("expect: %w", err)
	}
	if scenario.Verifier != ScenarioVerifierStraightforward {
		return fmt.Errorf("verifier %q is not supported", scenario.Verifier)
	}
	if err := scenario.Budget.Validate(); err != nil {
		return fmt.Errorf("budget: %w", err)
	}
	if err := scenario.Communication.Validate(); err != nil {
		return fmt.Errorf("communication: %w", err)
	}
	return nil
}

func (step ScenarioStep) Validate() error {
	if step.Kind != ScenarioStepSubmit {
		return fmt.Errorf("kind %q is not supported", step.Kind)
	}
	if err := validateScenarioText("text", step.Text); err != nil {
		return err
	}
	if len(step.Text) > ScenarioMaximumMessageBytes {
		return fmt.Errorf(
			"text is %d bytes, maximum is %d",
			len(step.Text),
			ScenarioMaximumMessageBytes,
		)
	}
	return nil
}

func (expectations ScenarioExpectations) Validate() error {
	if expectations.TerminalState != ScenarioTerminalCompleted {
		return fmt.Errorf("terminalState %q is not supported", expectations.TerminalState)
	}
	if expectations.Clarification != ScenarioClarificationForbidden {
		return fmt.Errorf("clarification %q is not supported", expectations.Clarification)
	}
	return nil
}

func (budget ScenarioBudget) Validate() error {
	if budget.HardTotalTokens <= 0 || budget.HardTotalTokens > ScenarioMaximumTokenBudget {
		return fmt.Errorf(
			"hardTotalTokens is %d, want 1-%d",
			budget.HardTotalTokens,
			ScenarioMaximumTokenBudget,
		)
	}
	return nil
}

func (communication ScenarioCommunication) Validate() error {
	if communication.Progress != ScenarioProgressWhenUseful {
		return fmt.Errorf("progress %q is not supported", communication.Progress)
	}
	if !communication.FinalResultRequired {
		return errors.New("finalResultRequired must be true")
	}
	return nil
}

func selectScenarioPaths(directory string, selectedIDs []string) ([]string, error) {
	if len(selectedIDs) > 0 {
		return selectedScenarioPaths(directory, selectedIDs)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, fmt.Errorf("read eval scenario directory %s: %w", directory, err)
	}
	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		paths = append(paths, filepath.Join(directory, entry.Name()))
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		return nil, fmt.Errorf("eval scenario directory %s contains no JSON scenarios", directory)
	}
	return paths, nil
}

func selectedScenarioPaths(directory string, selectedIDs []string) ([]string, error) {
	paths := make([]string, 0, len(selectedIDs))
	seen := make(map[string]struct{}, len(selectedIDs))
	for _, id := range selectedIDs {
		if err := validateScenarioIdentifier("selected scenario id", id); err != nil {
			return nil, err
		}
		if _, exists := seen[id]; exists {
			return nil, fmt.Errorf("selected scenario id %q is repeated", id)
		}
		seen[id] = struct{}{}
		paths = append(paths, filepath.Join(directory, id+".json"))
	}
	return paths, nil
}

func validateScenarioIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if len(value) > 64 {
		return fmt.Errorf("%s is %d bytes, maximum is 64", label, len(value))
	}
	for _, character := range value {
		if character >= 'a' && character <= 'z' ||
			character >= '0' && character <= '9' ||
			character == '-' {
			continue
		}
		return fmt.Errorf("%s %q must use lowercase ASCII letters, digits, and hyphens", label, value)
	}
	if strings.HasPrefix(value, "-") || strings.HasSuffix(value, "-") || strings.Contains(value, "--") {
		return fmt.Errorf("%s %q has invalid hyphen placement", label, value)
	}
	return nil
}

func validateScenarioText(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}
