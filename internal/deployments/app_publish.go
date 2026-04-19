package deployments

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/projectstate"
)

var (
	ErrAppPublisherRequired             = errors.New("app deployment publisher is required")
	ErrAppPublishContentServiceRequired = errors.New("app deployment publish content service is required")
	ErrAppPublishProjectStateRequired   = errors.New("app deployment publish project runtime is required")
	ErrAppPublishProviderSourceRequired = errors.New("active app deployment provider source path is required")
	ErrAppPublishAppDefinitionMissing   = errors.New("app definition is required to publish an app deployment")
	ErrAppPublishAppSpecPathRequired    = errors.New("app spec path is required to publish an app deployment")
	ErrAppPublishAppSpecNotFound        = errors.New("app spec was not found for app deployment publish")
	ErrAppPublishAppSpecInvalid         = errors.New("app spec is invalid for app deployment publish")
)

type AppPublisherOptions struct {
	Catalog          *Catalog
	SettaFilesRoot   string
	WorkspaceRoot    string
	PluginSourcePath string
	Now              func() time.Time
}

type AppPolicyOverrides = SharePolicyOverrides

type AppPublishRequest struct {
	ProjectState       *projectstate.Runtime
	ProjectID          string
	DeploymentName     string
	PolicyOverrides    *AppPolicyOverrides
	ListenerEntrypoint string
	ListenerEnabled    bool
}

type AppPublishResult struct {
	Metadata Metadata
	Manifest Manifest
	Policy   Policy
	Snapshot projectstate.Document
}

type ValidationIssue struct {
	Message     string
	ElementKey  string
	ElementType string
}

type AppPublishValidationError struct {
	Issues []ValidationIssue
}

func (e *AppPublishValidationError) Error() string {
	if e == nil || len(e.Issues) == 0 {
		return ErrAppPublishAppSpecInvalid.Error()
	}

	limit := len(e.Issues)
	if limit > 3 {
		limit = 3
	}
	messages := make([]string, 0, limit)
	for _, issue := range e.Issues[:limit] {
		message := strings.TrimSpace(issue.Message)
		if message == "" {
			continue
		}
		messages = append(messages, message)
	}
	if len(messages) == 0 {
		return ErrAppPublishAppSpecInvalid.Error()
	}
	if len(e.Issues) > limit {
		return ErrAppPublishAppSpecInvalid.Error() + ": " + strings.Join(messages, "; ") + fmt.Sprintf(" (+%d more)", len(e.Issues)-limit)
	}
	return ErrAppPublishAppSpecInvalid.Error() + ": " + strings.Join(messages, "; ")
}

func (e *AppPublishValidationError) Unwrap() error {
	return ErrAppPublishAppSpecInvalid
}
