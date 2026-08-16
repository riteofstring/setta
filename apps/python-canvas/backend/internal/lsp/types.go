// Package lsp owns the bounded Basedpyright JSON-RPC session used by Python
// Canvas. It has no HTTP or frontend dependencies.
package lsp

import "encoding/json"

type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Diagnostic struct {
	Range    Range  `json:"range"`
	Severity int    `json:"severity,omitempty"`
	Message  string `json:"message"`
}

type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Version     *int         `json:"version,omitempty"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type SignatureHelpResult struct {
	Signatures []SignatureInformation `json:"signatures,omitempty"`
}

type SignatureInformation struct {
	Label      string                 `json:"label"`
	Parameters []ParameterInformation `json:"parameters,omitempty"`
}

type ParameterInformation struct {
	Label json.RawMessage `json:"label"`
}

type CompletionResult struct {
	Items []CompletionItem `json:"items"`
}

type CompletionItem struct {
	Label      string `json:"label"`
	InsertText string `json:"insertText,omitempty"`
}
