package verifier

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	SchemaVersion           = 1
	MaximumChecks           = 32
	MaximumDetailBytes      = 2048
	MaximumChangedFiles     = 256
	MaximumChangedPathBytes = 512
)

type Result struct {
	SchemaVersion int      `json:"schemaVersion"`
	Verifier      string   `json:"verifier"`
	Passed        bool     `json:"passed"`
	Checks        []Check  `json:"checks"`
	ChangedFiles  []string `json:"changedFiles"`
}

type Check struct {
	ID     string `json:"id"`
	Passed bool   `json:"passed"`
	Detail string `json:"detail"`
}

func NewResult(verifierID string, checks []Check, changedFiles []string) Result {
	passed := len(checks) > 0
	for _, check := range checks {
		passed = passed && check.Passed
	}
	return Result{
		SchemaVersion: SchemaVersion,
		Verifier:      verifierID,
		Passed:        passed,
		Checks:        checks,
		ChangedFiles:  changedFiles,
	}
}

func (result Result) Validate() error {
	if result.SchemaVersion != SchemaVersion {
		return fmt.Errorf("verifier result schemaVersion is %d, want %d", result.SchemaVersion, SchemaVersion)
	}
	if err := validateIdentifier("verifier result verifier", result.Verifier); err != nil {
		return err
	}
	if result.Checks == nil {
		return fmt.Errorf("verifier result checks must be an array, not null")
	}
	if len(result.Checks) == 0 || len(result.Checks) > MaximumChecks {
		return fmt.Errorf("verifier result has %d checks, want 1-%d", len(result.Checks), MaximumChecks)
	}
	seenChecks := make(map[string]struct{}, len(result.Checks))
	passed := true
	for index, check := range result.Checks {
		if err := check.Validate(); err != nil {
			return fmt.Errorf("verifier result check %d: %w", index, err)
		}
		if _, exists := seenChecks[check.ID]; exists {
			return fmt.Errorf("verifier result repeats check %q", check.ID)
		}
		seenChecks[check.ID] = struct{}{}
		passed = passed && check.Passed
	}
	if result.Passed != passed {
		return fmt.Errorf("verifier result passed is %t, want %t from checks", result.Passed, passed)
	}
	if result.ChangedFiles == nil {
		return fmt.Errorf("verifier result changedFiles must be an array, not null")
	}
	if len(result.ChangedFiles) > MaximumChangedFiles {
		return fmt.Errorf(
			"verifier result has %d changed files, maximum is %d",
			len(result.ChangedFiles),
			MaximumChangedFiles,
		)
	}
	if !sort.StringsAreSorted(result.ChangedFiles) {
		return fmt.Errorf("verifier result changedFiles must be sorted")
	}
	for index, path := range result.ChangedFiles {
		if err := validateRelativePath(path); err != nil {
			return fmt.Errorf("verifier result changedFiles[%d]: %w", index, err)
		}
		if index > 0 && result.ChangedFiles[index-1] == path {
			return fmt.Errorf("verifier result repeats changed file %q", path)
		}
	}
	return nil
}

func (check Check) Validate() error {
	if err := validateIdentifier("check id", check.ID); err != nil {
		return err
	}
	if strings.TrimSpace(check.Detail) == "" {
		return fmt.Errorf("check %s detail is required", check.ID)
	}
	if strings.TrimSpace(check.Detail) != check.Detail {
		return fmt.Errorf("check %s detail must not have surrounding whitespace", check.ID)
	}
	if len(check.Detail) > MaximumDetailBytes {
		return fmt.Errorf(
			"check %s detail is %d bytes, maximum is %d",
			check.ID,
			len(check.Detail),
			MaximumDetailBytes,
		)
	}
	return nil
}

func WriteResult(writer io.Writer, result Result) error {
	if err := result.Validate(); err != nil {
		return err
	}
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode verifier result: %w", err)
	}
	return nil
}

func BoundedDetail(value string) string {
	value = strings.TrimSpace(strings.ToValidUTF8(value, "�"))
	if value == "" {
		return "No diagnostic output was produced."
	}
	if len(value) <= MaximumDetailBytes {
		return value
	}
	maximum := MaximumDetailBytes - len("…")
	value = value[:maximum]
	for !utf8.ValidString(value) {
		_, size := utf8.DecodeLastRuneInString(value)
		if size == 0 {
			break
		}
		value = value[:len(value)-size]
	}
	return value + "…"
}

func validateIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if len(value) > 64 {
		return fmt.Errorf("%s is %d bytes, maximum is 64", label, len(value))
	}
	for _, character := range value {
		if character >= 'a' && character <= 'z' ||
			character >= '0' && character <= '9' ||
			character == '-' || character == '_' {
			continue
		}
		return fmt.Errorf("%s %q has unsupported characters", label, value)
	}
	return nil
}
