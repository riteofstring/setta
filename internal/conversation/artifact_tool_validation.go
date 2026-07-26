package conversation

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"setta/internal/agent"
	"setta/internal/conversation/artifactdoc"
)

// The emit_artifact boundary accepts exactly two fields and one document
// language. The compiler owns document-shape acceptance; the conversation
// boundary then binds any compiled file references to the authorized workspace.
// This file maps either failure into the typed tool response the model can
// correct, without re-implementing a compiler rule here.

func decodeEmitArtifactInput(arguments json.RawMessage) (emitArtifactInput, error) {
	fields, err := decodeEmitArtifactArgumentFields(arguments)
	if err != nil {
		return emitArtifactInput{}, err
	}
	if err := rejectUnknownEmitArtifactFields(fields); err != nil {
		return emitArtifactInput{}, err
	}
	title, err := decodeRequiredEmitArtifactStringField(fields, "title", "artifact title")
	if err != nil {
		return emitArtifactInput{}, err
	}
	if err := validateRequiredEmitArtifactToolText("title", "artifact title", title); err != nil {
		return emitArtifactInput{}, err
	}
	kind, err := decodeRequiredEmitArtifactStringField(fields, "kind", "artifact kind")
	if err != nil {
		return emitArtifactInput{}, err
	}
	if err := validateRequiredEmitArtifactToolText("kind", "artifact kind", kind); err != nil {
		return emitArtifactInput{}, err
	}
	if err := validateEmitArtifactKind(kind); err != nil {
		return emitArtifactInput{}, err
	}
	summary, err := decodeRequiredEmitArtifactStringField(fields, "summary", "artifact summary")
	if err != nil {
		return emitArtifactInput{}, err
	}
	if err := validateRequiredEmitArtifactToolText("summary", "artifact summary", summary); err != nil {
		return emitArtifactInput{}, err
	}
	if err := validateEmitArtifactSummary(summary); err != nil {
		return emitArtifactInput{}, err
	}
	source, err := decodeRequiredEmitArtifactStringField(fields, "source", "artifact document source")
	if err != nil {
		return emitArtifactInput{}, err
	}
	document, err := compileEmitArtifactSource(source)
	if err != nil {
		return emitArtifactInput{}, err
	}
	return emitArtifactInput{
		Title:    title,
		Kind:     kind,
		Summary:  summary,
		Source:   source,
		document: document,
	}, nil
}

func decodeEmitArtifactArgumentFields(arguments json.RawMessage) (map[string]json.RawMessage, error) {
	if len(arguments) == 0 {
		return nil, newArtifactToolFailureError(
			artifactToolFailureMissingRequiredFields,
			"emit_artifact arguments are required",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Provide a JSON object with title, kind, summary, and source."}},
			nil,
		)
	}
	decoder := json.NewDecoder(bytes.NewReader(arguments))
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil {
		return nil, newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			"emit_artifact arguments must be a strict JSON object",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Provide one JSON object."}},
			err,
		)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			"emit_artifact arguments must contain exactly one JSON object",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Remove trailing JSON values."}},
			err,
		)
	}
	return fields, nil
}

// maxArtifactKindBytes bounds the kicker. It names a form in one or two words;
// anything longer is a sentence that belongs in the document.
const maxArtifactKindBytes = 24

func validateEmitArtifactKind(kind string) error {
	if len(kind) <= maxArtifactKindBytes {
		return nil
	}
	return newArtifactToolFailureError(
		artifactToolFailureInvalidArguments,
		fmt.Sprintf("artifact kind is longer than %d bytes", maxArtifactKindBytes),
		true,
		[]agent.DynamicToolFieldError{{
			Field:   "kind",
			Message: "Name the form of the document in one or two words, such as Story, Report, or Protocol.",
		}},
		nil,
	)
}

// maxArtifactSummaryBytes bounds the standfirst. One sentence fits well inside
// it; anything longer has stopped claiming what the artifact is and started
// being the artifact.
const maxArtifactSummaryBytes = 220

func validateEmitArtifactSummary(summary string) error {
	if len(summary) > maxArtifactSummaryBytes {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			fmt.Sprintf("artifact summary is longer than %d bytes", maxArtifactSummaryBytes),
			true,
			[]agent.DynamicToolFieldError{{
				Field:   "summary",
				Message: "Say what the artifact is in one sentence.",
			}},
			nil,
		)
	}
	// A standfirst is one line. A summary carrying its own paragraph breaks is
	// a document, and it would be rendered as a run-on line rather than as the
	// structure it was written as.
	if strings.ContainsAny(summary, "\r\n") {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			"artifact summary must be a single line",
			true,
			[]agent.DynamicToolFieldError{{
				Field:   "summary",
				Message: "Write one sentence with no line breaks.",
			}},
			nil,
		)
	}
	return nil
}

func rejectUnknownEmitArtifactFields(fields map[string]json.RawMessage) error {
	for name := range fields {
		if name == "title" || name == "kind" || name == "summary" || name == "source" {
			continue
		}
		return newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			fmt.Sprintf("unknown field %s is not supported by emit_artifact", name),
			true,
			[]agent.DynamicToolFieldError{{
				Field:   name,
				Message: "Remove this field. emit_artifact takes title, kind, and source only, and everything else belongs in the document source.",
			}},
			nil,
		)
	}
	return nil
}

func decodeRequiredEmitArtifactStringField(
	fields map[string]json.RawMessage,
	name string,
	label string,
) (string, error) {
	raw, ok := fields[name]
	if !ok {
		return "", missingEmitArtifactFieldError(name, label)
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("%s must be a JSON string", label),
			true,
			[]agent.DynamicToolFieldError{{Field: name, Message: fmt.Sprintf("Send %s as a JSON string.", name)}},
			err,
		)
	}
	return value, nil
}

// compileEmitArtifactSource is the acceptance decision. It runs before any ID
// is minted or any transaction opens, so a document the renderer could not
// render never reaches durable state.
func compileEmitArtifactSource(source string) (artifactdoc.Document, error) {
	document, err := artifactdoc.Compile(artifactCatalog(), source)
	if err != nil {
		return artifactdoc.Document{}, emitArtifactCompileFailure(err)
	}
	return document, nil
}

// validateEmitArtifactFileReferences resolves compiled FileReference nodes
// against the active turn's workspace before any artifact ID is allocated.
// The compiler already rejected absolute and traversal paths; this check binds
// the portable path to a real regular file and closes symlink escapes.
func validateEmitArtifactFileReferences(document artifactdoc.Document, workspaceRoot string) error {
	paths, err := document.FileReferencePaths()
	if err != nil {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidDocument,
			"the compiled artifact document could not be inspected",
			true,
			[]agent.DynamicToolFieldError{{
				Field:   "source",
				Message: "Rewrite the document against the catalog reference in the instructions.",
			}},
			err,
		)
	}
	if len(paths) == 0 {
		return nil
	}
	if workspaceRoot == "" {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidFileReference,
			"the artifact document references a file without an authorized workspace",
			true,
			[]agent.DynamicToolFieldError{{
				Field:   "source",
				Message: "Remove FileReference components because this topic has no authorized workspace.",
			}},
			nil,
		)
	}
	fieldErrors := make([]agent.DynamicToolFieldError, 0, len(paths))
	for _, path := range paths {
		absolutePath := filepath.Join(workspaceRoot, filepath.FromSlash(path))
		if _, valid := workspaceRelativeArtifactPath(workspaceRoot, absolutePath); valid {
			continue
		}
		fieldErrors = append(fieldErrors, agent.DynamicToolFieldError{
			Field: "source",
			Message: fmt.Sprintf(
				"FileReference %q must resolve to an existing regular file inside the authorized workspace.",
				path,
			),
		})
	}
	if len(fieldErrors) == 0 {
		return nil
	}
	return newArtifactToolFailureError(
		artifactToolFailureInvalidFileReference,
		"the artifact document contains an unavailable or unauthorized file reference",
		true,
		fieldErrors,
		nil,
	)
}

// validateEmitArtifactPrivateExecutionDetails keeps the Setta-owned process
// directory out of explicit artifacts as well as provider progress. The model
// receives retryable field guidance instead of publishing an internal host path
// in a title or document string.
func validateEmitArtifactPrivateExecutionDetails(
	input emitArtifactInput,
	scope conversationExecutionScope,
) error {
	fieldErrors := []agent.DynamicToolFieldError{}
	if containsPrivateWorkingDirectory(scope, input.Title) {
		fieldErrors = append(fieldErrors, agent.DynamicToolFieldError{
			Field:   "title",
			Message: "Remove the internal working-directory path from the artifact title.",
		})
	}
	if containsPrivateWorkingDirectory(scope, input.Source) ||
		artifactDocumentContainsPrivateWorkingDirectory(scope, input.document) {
		fieldErrors = append(fieldErrors, agent.DynamicToolFieldError{
			Field:   "source",
			Message: "Remove the internal working-directory path from the artifact document.",
		})
	}
	if len(fieldErrors) == 0 {
		return nil
	}
	return newArtifactToolFailureError(
		artifactToolFailureInvalidField,
		"the artifact contains a private execution detail",
		true,
		fieldErrors,
		nil,
	)
}

func artifactDocumentContainsPrivateWorkingDirectory(
	scope conversationExecutionScope,
	document artifactdoc.Document,
) bool {
	var contains func(any) bool
	contains = func(value any) bool {
		switch typed := value.(type) {
		case string:
			return containsPrivateWorkingDirectory(scope, typed)
		case artifactdoc.Node:
			for _, property := range typed.Props {
				if contains(property) {
					return true
				}
			}
		case []any:
			for _, item := range typed {
				if contains(item) {
					return true
				}
			}
		case map[string]any:
			for _, item := range typed {
				if contains(item) {
					return true
				}
			}
		}
		return false
	}
	return contains(document.Root)
}

func emitArtifactCompileFailure(err error) error {
	var compileErr *artifactdoc.CompileError
	if !errors.As(err, &compileErr) || len(compileErr.Diagnostics) == 0 {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidDocument,
			"the artifact document could not be compiled",
			true,
			[]agent.DynamicToolFieldError{{Field: "source", Message: "Rewrite the document against the catalog reference in the instructions."}},
			err,
		)
	}
	fieldErrors := make([]agent.DynamicToolFieldError, 0, len(compileErr.Diagnostics))
	messages := make([]string, 0, len(compileErr.Diagnostics))
	for _, diagnostic := range compileErr.Diagnostics {
		fieldErrors = append(fieldErrors, agent.DynamicToolFieldError{
			Field:   diagnostic.Field(),
			Message: emitArtifactDiagnosticMessage(diagnostic),
		})
		messages = append(messages, diagnostic.Message)
	}
	return newArtifactToolFailureError(
		string(compileErr.Diagnostics[0].Code),
		fmt.Sprintf("the artifact document was rejected: %s", strings.Join(messages, "; ")),
		true,
		fieldErrors,
		err,
	)
}

// emitArtifactDiagnosticMessage gives the model the position, the component
// under repair, and the correction instruction the compiler already wrote. It
// carries no parser internals.
func emitArtifactDiagnosticMessage(diagnostic artifactdoc.Diagnostic) string {
	parts := []string{fmt.Sprintf("Line %d, column %d", diagnostic.Position.Line, diagnostic.Position.Column)}
	if diagnostic.Component != "" {
		parts = append(parts, fmt.Sprintf("in %s", diagnostic.Component))
	}
	return fmt.Sprintf("%s: %s. %s", strings.Join(parts, " "), diagnostic.Message, diagnostic.Correction)
}

func validateRequiredEmitArtifactToolText(field string, label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return missingEmitArtifactFieldError(field, label)
	}
	if strings.TrimSpace(value) != value {
		return newArtifactToolFailureError(
			artifactToolFailureInvalidField,
			fmt.Sprintf("%s must not have surrounding whitespace", label),
			true,
			[]agent.DynamicToolFieldError{{Field: field, Message: fmt.Sprintf("Trim whitespace from %s.", field)}},
			nil,
		)
	}
	return nil
}

func missingEmitArtifactFieldError(field string, label string) error {
	return newArtifactToolFailureError(
		artifactToolFailureMissingRequiredFields,
		fmt.Sprintf("emit_artifact requires %s", label),
		true,
		[]agent.DynamicToolFieldError{{Field: field, Message: fmt.Sprintf("Provide %s.", field)}},
		nil,
	)
}
