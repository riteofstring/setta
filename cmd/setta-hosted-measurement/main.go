package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"setta/internal/hostedmeasurement"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, time.Now))
}

func run(args []string, stdout io.Writer, stderr io.Writer, now func() time.Time) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: setta-hosted-measurement dry-run --manifest /absolute/private/manifest.json")
		return 2
	}
	if args[0] != "dry-run" {
		fmt.Fprintf(stderr, "unknown setta-hosted-measurement command %q; only dry-run is enabled\n", args[0])
		return 2
	}
	flagSet := flag.NewFlagSet("setta-hosted-measurement dry-run", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	var manifestPath string
	flagSet.StringVar(&manifestPath, "manifest", "", "absolute path to the private authorization manifest")
	if err := flagSet.Parse(args[1:]); err != nil {
		return 2
	}
	if flagSet.NArg() != 0 {
		fmt.Fprintln(stderr, "setta-hosted-measurement dry-run does not accept positional arguments")
		return 2
	}
	if manifestPath == "" {
		fmt.Fprintln(stderr, "--manifest is required")
		return 2
	}
	authorization, err := hostedmeasurement.LoadManifest(manifestPath, now(), hostedmeasurement.ValidateForStart)
	if err != nil {
		fmt.Fprintf(stderr, "validate hosted measurement authorization: %v\n", err)
		return 1
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(hostedmeasurement.BuildPlan(authorization)); err != nil {
		fmt.Fprintf(stderr, "write hosted measurement dry-run: %v\n", err)
		return 1
	}
	return 0
}
