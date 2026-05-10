package wsapi

import (
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/artifacts"
	"setta/internal/realtime"
)

var (
	errListenerEmitUnknownDependency         = errors.New("listener emit unknown dependency")
	errListenerEmitUnsupportedDependency     = errors.New("listener emit unsupported dependency")
	errListenerEmitInvalidValue              = errors.New("listener emit invalid value")
	errListenerEmitApplyFailed               = errors.New("listener emit apply failed")
	errListenerEmitInvalidArtifactUpdate     = errors.New("listener emit invalid artifact update")
	errListenerEmitUnsupportedArtifactUpdate = errors.New("listener emit unsupported artifact update")
	errListenerEmitArtifactUpdateFailed      = errors.New("listener emit artifact update failed")
)

type listenerEmitUnknownDependencyError struct {
	DependencyName string
}

func (e *listenerEmitUnknownDependencyError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s", errListenerEmitUnknownDependency, e.DependencyName)
}

func (e *listenerEmitUnknownDependencyError) Unwrap() error {
	return errListenerEmitUnknownDependency
}

type listenerEmitUnsupportedDependencyError struct {
	DependencyName string
	Reason         string
}

func (e *listenerEmitUnsupportedDependencyError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s: %s", errListenerEmitUnsupportedDependency, e.DependencyName, e.Reason)
}

func (e *listenerEmitUnsupportedDependencyError) Unwrap() error {
	return errListenerEmitUnsupportedDependency
}

type listenerEmitInvalidValueError struct {
	DependencyName string
	ExpectedType   string
}

func (e *listenerEmitInvalidValueError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s expects %s", errListenerEmitInvalidValue, e.DependencyName, e.ExpectedType)
}

func (e *listenerEmitInvalidValueError) Unwrap() error {
	return errListenerEmitInvalidValue
}

type listenerEmitApplyError struct {
	Message string
}

func (e *listenerEmitApplyError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *listenerEmitApplyError) Unwrap() error {
	return errListenerEmitApplyFailed
}

type listenerEmitInvalidArtifactUpdateError struct {
	Path    string
	Message string
}

func (e *listenerEmitInvalidArtifactUpdateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *listenerEmitInvalidArtifactUpdateError) Unwrap() error {
	return errListenerEmitInvalidArtifactUpdate
}

type listenerEmitUnsupportedArtifactUpdateError struct {
	Path   string
	Reason string
}

func (e *listenerEmitUnsupportedArtifactUpdateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Reason
}

func (e *listenerEmitUnsupportedArtifactUpdateError) Unwrap() error {
	return errListenerEmitUnsupportedArtifactUpdate
}

type listenerEmitArtifactUpdateFailedError struct {
	Path    string
	Message string
}

func (e *listenerEmitArtifactUpdateFailedError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *listenerEmitArtifactUpdateFailedError) Unwrap() error {
	return errListenerEmitArtifactUpdateFailed
}

type listenerResolvedDependencyUpdate struct {
	DependencyName string
	SectionID      string
	CodeObjectID   string
	SectionType    string
	RawValue       json.RawMessage
}

type listenerResolvedArtifactUpdate struct {
	Artifact artifacts.RawArtifact
}

type listenerFrontendEmitContext struct {
	ProjectID string
}

type listenerPluginSectionTarget struct {
	SectionID string
	VariantID string
	Payload   map[string]any
}

type listenerPluginControlUpdate struct {
	Data                 map[string]any
	Kind                 *string
	SchemaVersionPresent bool
	SchemaVersionValue   any
}

type listenerEmitErrorResolver func(error) (realtime.ListenerErrorContent, bool)

var listenerEmitErrorResolvers = []listenerEmitErrorResolver{
	listenerEmitUnknownDependencyContent,
	listenerEmitUnsupportedDependencyContent,
	listenerEmitInvalidValueContent,
	listenerEmitInvalidArtifactUpdateContent,
	listenerEmitUnsupportedArtifactUpdateContent,
	listenerEmitArtifactUpdateFailedContent,
}

var listenerWritableSectionTypes = map[string]struct{}{
	"TextBlock": {},
	"Chat":      {},
	"Plugin":    {},
}
