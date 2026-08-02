package volumecopy

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	SchemaVersion      = 1
	MaximumDetailBytes = 2048
)

type Status string

const (
	StatusCopied           Status = "copied"
	StatusInvalidWorkspace Status = "invalid_workspace"
)

type Result struct {
	SchemaVersion int    `json:"schemaVersion"`
	Status        Status `json:"status"`
	Detail        string `json:"detail"`
}

func CopiedResult() Result {
	return Result{SchemaVersion: SchemaVersion, Status: StatusCopied}
}

func InvalidWorkspaceResult(detail string) Result {
	return Result{
		SchemaVersion: SchemaVersion,
		Status:        StatusInvalidWorkspace,
		Detail:        boundedDetail(detail),
	}
}

func (result Result) Validate() error {
	if result.SchemaVersion != SchemaVersion {
		return fmt.Errorf("volume-copy schemaVersion is %d, want %d", result.SchemaVersion, SchemaVersion)
	}
	switch result.Status {
	case StatusCopied:
		if result.Detail != "" {
			return errors.New("copied volume result must not carry detail")
		}
	case StatusInvalidWorkspace:
		if strings.TrimSpace(result.Detail) == "" || strings.TrimSpace(result.Detail) != result.Detail {
			return errors.New("invalid-workspace volume result requires trimmed detail")
		}
		if !utf8.ValidString(result.Detail) || len(result.Detail) > MaximumDetailBytes {
			return errors.New("invalid-workspace volume result detail is not bounded UTF-8")
		}
	default:
		return fmt.Errorf("unsupported volume-copy status %q", result.Status)
	}
	return nil
}

func boundedDetail(value string) string {
	value = strings.TrimSpace(strings.ToValidUTF8(value, "�"))
	if value == "" {
		return "The final workspace is invalid."
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
