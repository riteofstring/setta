package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	flags := flag.NewFlagSet("generate-contract", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	check := flags.Bool("check", false, "check generated artifacts for drift")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("generate-contract does not accept positional arguments")
	}
	return contracts.GenerateArtifacts(contracts.FixtureProjectSnapshotV2(), *check)
}
