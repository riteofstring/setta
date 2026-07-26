package conversation

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"setta/internal/agent"
	"setta/internal/conversation/artifactdoc"
)

// The emit_artifact boundary accepts exactly two fields and one document
// language. Everything past strict argument decoding is the compiler's
// judgement, so this file maps compiler diagnostics into the typed tool failure
// the model can correct, and never re-implements a rule the compiler owns.

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
	source, err := decodeRequiredEmitArtifactStringField(fields, "source", "artifact document source")
	if err != nil {
		return emitArtifactInput{}, err
	}
	if err := compileEmitArtifactSource(source); err != nil {
		return emitArtifactInput{}, err
	}
	return emitArtifactInput{Title: title, Source: source}, nil
}

func decodeEmitArtifactArgumentFields(arguments json.RawMessage) (map[string]json.RawMessage, error) {
	if len(arguments) == 0 {
		return nil, newArtifactToolFailureError(
			artifactToolFailureMissingRequiredFields,
			"emit_artifact arguments are required",
			true,
			[]agent.DynamicToolFieldError{{Field: "arguments", Message: "Provide a JSON object with title and source."}},
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

func rejectUnknownEmitArtifactFields(fields map[string]json.RawMessage) error {
	for name := range fields {
		if name == "title" || name == "source" {
			continue
		}
		return newArtifactToolFailureError(
			artifactToolFailureInvalidArguments,
			fmt.Sprintf("unknown field %s is not supported by emit_artifact", name),
			true,
			[]agent.DynamicToolFieldError{{
				Field:   name,
				Message: "Remove this field. emit_artifact takes title and source only, and everything else belongs in the document source.",
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
func compileEmitArtifactSource(source string) error {
	if _, err := artifactdoc.Compile(artifactCatalog(), source); err != nil {
		return emitArtifactCompileFailure(err)
	}
	return nil
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
