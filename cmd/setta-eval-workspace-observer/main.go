package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"setta/internal/evalharness/workspaceevidence"
)

const evaluationWorkspaceRoot = "/workspace"

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 0 {
		return errors.New("setta-eval-workspace-observer accepts no arguments")
	}
	digest, err := workspaceevidence.Capture(evaluationWorkspaceRoot)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(os.Stdout).Encode(digest); err != nil {
		return fmt.Errorf("encode evaluation workspace digest: %w", err)
	}
	return nil
}
