package artifactdoc

import (
	"encoding/json"
	"fmt"
)

// FileReferenceSource renders the document source for an artifact whose whole
// content is one workspace file reference.
//
// Setta itself composes this document when the provider reports a file the turn
// produced, so the grammar owner renders it rather than the conversation
// service concatenating source text. The result still has to compile like any
// model-authored document; nothing here is trusted past the compiler.
func FileReferenceSource(path string, description string) string {
	return fmt.Sprintf(
		"root = Document([\n  FileReference(%s, %s)\n])",
		stringLiteral(path),
		stringLiteral(description),
	)
}

// stringLiteral renders one profile string literal. The profile takes JSON
// string syntax, including \uXXXX escapes, so the JSON encoder is the exact
// escaping rule rather than an approximation of it.
func stringLiteral(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		// json.Marshal only fails here for unsupported types, and the input is
		// a string. Invalid UTF-8 is replaced, and the compiler rejects the
		// replacement character, so a bad value fails at acceptance.
		panic(fmt.Sprintf("encode artifact document string literal: %v", err))
	}
	return string(encoded)
}
