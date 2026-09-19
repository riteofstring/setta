package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/setta/experiment-lens/backend/internal/contracts"
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
	schemas := []struct {
		name   string
		schema map[string]any
	}{
		{"experiment-manifest-v1.schema.json", contracts.ExperimentManifestSchema()},
		{"observation-source-v1.schema.json", contracts.ObservationSourceSchema()},
		{"lens-snapshot-v1.schema.json", contracts.LensSnapshotSchema()},
		{"lens-mutation-v1.schema.json", contracts.LensMutationSchema()},
		{"selection-packet-v1.schema.json", contracts.SelectionPacketSchema()},
		{"mutation-result-v1.schema.json", contracts.MutationResultSchema()},
		{"export-result-v1.schema.json", contracts.ExportResultSchema()},
		{"structured-error-v1.schema.json", contracts.StructuredErrorSchema()},
		{"series-v1.schema.json", contracts.SeriesSchema()},
	}
	outputs := make([]output, 0, len(schemas)+1)
	for _, candidate := range schemas {
		encoded, err := encodeSchema(candidate.schema)
		if err != nil {
			return nil, err
		}
		outputs = append(outputs, output{path: filepath.Join("internal", "contracts", "testdata", candidate.name), data: encoded})
	}
	outputs = append(outputs, output{path: filepath.Join("..", "src", "backend", "generatedContract.ts"), data: []byte(contracts.TypeScriptContract())})
	return outputs, nil
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
