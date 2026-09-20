package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/setta/realtime/backend/internal/contracts"
)

type output struct {
	path string
	data []byte
}

func main() {
	check := flag.Bool("check", false, "")
	flag.Parse()
	if flag.NArg() != 0 {
		fatal(errors.New("generate-contract accepts no positional arguments"))
	}
	outputs, err := generatedOutputs()
	if err != nil {
		fatal(err)
	}
	for _, candidate := range outputs {
		if *check {
			if err := checkOutput(candidate); err != nil {
				fatal(err)
			}
			continue
		}
		if err := writeOutput(candidate); err != nil {
			fatal(err)
		}
	}
}

func generatedOutputs() ([]output, error) {
	applyRequest, err := encodeSchema(contracts.ApplyRequestSchema())
	if err != nil {
		return nil, err
	}
	directInvokeRequest, err := encodeSchema(contracts.DirectInvokeRequestSchema())
	if err != nil {
		return nil, err
	}
	runtimeSource, err := encodeSchema(contracts.RuntimeSourceDocumentSchema())
	if err != nil {
		return nil, err
	}
	applyRuntimeSourceRequest, err := encodeSchema(contracts.ApplyRuntimeSourceRequestSchema())
	if err != nil {
		return nil, err
	}
	applyRuntimeSourceResult, err := encodeSchema(contracts.ApplyRuntimeSourceResultSchema())
	if err != nil {
		return nil, err
	}
	project, err := encodeSchema(contracts.ProjectSchema())
	if err != nil {
		return nil, err
	}
	runtime, err := encodeSchema(contracts.RuntimeSchema())
	if err != nil {
		return nil, err
	}
	runtimeCommand, err := encodeSchema(contracts.RuntimeCommandSchema())
	if err != nil {
		return nil, err
	}
	worker, err := encodeSchema(contracts.WorkerSchema())
	if err != nil {
		return nil, err
	}
	contentReference, err := encodeSchema(contracts.ContentReferenceSchema())
	if err != nil {
		return nil, err
	}
	return []output{
		{path: "internal/contracts/testdata/apply-request-v2.schema.json", data: applyRequest},
		{path: "internal/contracts/testdata/direct-invoke-request-v1.schema.json", data: directInvokeRequest},
		{path: "internal/contracts/testdata/runtime-source-v1.schema.json", data: runtimeSource},
		{path: "internal/contracts/testdata/apply-runtime-source-request-v1.schema.json", data: applyRuntimeSourceRequest},
		{path: "internal/contracts/testdata/apply-runtime-source-result-v1.schema.json", data: applyRuntimeSourceResult},
		{path: "internal/contracts/testdata/project-v2.schema.json", data: project},
		{path: "internal/contracts/testdata/runtime-v2.schema.json", data: runtime},
		{path: "internal/contracts/testdata/runtime-command-v2.schema.json", data: runtimeCommand},
		{path: "internal/contracts/testdata/worker-v2.schema.json", data: worker},
		{path: "internal/contracts/testdata/content-reference-v1.schema.json", data: contentReference},
		{path: filepath.Join("..", "src", "api", "generatedContract.ts"), data: []byte(contracts.TypeScriptContract())},
	}, nil
}

func encodeSchema(schema map[string]any) ([]byte, error) {
	data, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func writeOutput(candidate output) error {
	if err := os.MkdirAll(filepath.Dir(candidate.path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(candidate.path, candidate.data, 0o644)
}

func checkOutput(candidate output) error {
	current, err := os.ReadFile(candidate.path)
	if err != nil {
		return fmt.Errorf("generated contract %s: %w", candidate.path, err)
	}
	if !bytes.Equal(current, candidate.data) {
		return fmt.Errorf("generated contract %s is stale", candidate.path)
	}
	return nil
}

func fatal(err error) {
	_, _ = fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
