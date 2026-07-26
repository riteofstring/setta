package artifactdoc

import (
	"encoding/json"
	"fmt"
	"unicode/utf8"
)

// FileReferenceSource renders the document source for an artifact whose whole
// content is one workspace file reference.
//
// Setta itself composes this document when the provider reports a file the turn
// produced, so the grammar owner renders it rather than the conversation
// service concatenating source text. The result still has to compile like any
// model-authored document; nothing here is trusted past the compiler.
func FileReferenceSource(path string, description string) (string, error) {
	pathLiteral, err := stringLiteral("file reference path", path)
	if err != nil {
		return "", err
	}
	descriptionLiteral, err := stringLiteral("file reference description", description)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"root = Document([\n  FileReference(%s, %s)\n])",
		pathLiteral,
		descriptionLiteral,
	), nil
}

// stringLiteral renders one profile string literal. The profile takes JSON
// string syntax, including \uXXXX escapes, so the JSON encoder is the exact
// escaping rule rather than an approximation of it.
func stringLiteral(label string, value string) (string, error) {
	if !utf8.ValidString(value) {
		return "", fmt.Errorf("%s is not valid UTF-8", label)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("encode %s as an artifact document string literal: %w", label, err)
	}
	return string(encoded), nil
}
