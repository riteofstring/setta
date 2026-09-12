package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/setta/bench/backend/internal/contracts"
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
		} else if err := writeOutput(candidate); err != nil {
			fatal(err)
		}
	}
}

func generatedOutputs() ([]output, error) {
	project, err := encodeSchema(contracts.ProjectSchema())
	if err != nil {
		return nil, err
	}
	snapshot, err := encodeSchema(contracts.SnapshotSchema())
	if err != nil {
		return nil, err
	}
	protocol, err := encodeSchema(contracts.ProtocolSchema())
	if err != nil {
		return nil, err
	}
	return []output{
		{path: "internal/contracts/testdata/project-v1.schema.json", data: project},
		{path: "internal/contracts/testdata/snapshot-v1.schema.json", data: snapshot},
		{path: "internal/contracts/testdata/protocol-v1.schema.json", data: protocol},
		{path: filepath.Join("..", "src", "backend", "generatedContract.ts"), data: []byte(contracts.TypeScriptContract())},
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
